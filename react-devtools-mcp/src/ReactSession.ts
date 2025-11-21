import path from 'node:path';

import {logger} from './logger.js';
import type {ReactAttachResult, ReactRootInfo} from './tools/ToolDefinition.js';
import type {Page} from './third_party/index.js';

/**
 * Manages injecting the React DevTools backend into a Puppeteer page and
 * reading basic renderer/root information. This intentionally limits scope to
 * lightweight inspection (no full Store bridge yet).
 */
export class ReactSession {
  #page: Page;
  #backendInjected = false;
  static #backendPath: string | null = null;

  constructor(page: Page) {
    this.#page = page;
  }

  static resolveBackendPath(): string {
    if (this.#backendPath) {
      return this.#backendPath;
    }
    // The published `react-devtools-inline` package ships a backend entry.
    // We resolve to that file so we can inject it directly into the page.
    const resolved = require.resolve('react-devtools-inline/backend');
    this.#backendPath = resolved;
    return resolved;
  }

  async ensureBackendInjected(): Promise<void> {
    if (this.#backendInjected) {
      return;
    }

    // Try to install hook early for subsequent navigations.
    const backendPath = ReactSession.resolveBackendPath();
    await this.#page.evaluateOnNewDocument(
      ({backendPath}) => {
        const script = document.createElement('script');
        script.src = backendPath;
        document.documentElement.appendChild(script);
      },
      {backendPath},
    );

    let hasHook = await this.#page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return Boolean((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__);
    });
    if (hasHook) {
      this.#backendInjected = true;
      return;
    }

    logger(`Injecting React DevTools backend from ${backendPath}`);
    try {
      await this.#page.addScriptTag({path: backendPath});

      // If hook still absent, reload once to let the init script run before React loads.
      hasHook = await this.#page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return Boolean((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__);
      });
      if (!hasHook) {
        await this.#page.reload({waitUntil: 'domcontentloaded'});
      }
      this.#backendInjected = true;
    } catch (error) {
      logger(`Failed to inject React DevTools backend: ${String(error)}`);
      throw new Error(
        `Failed to inject React DevTools backend from ${path.basename(
          backendPath,
        )}`,
        {cause: error},
      );
    }
  }

  async attach(): Promise<ReactAttachResult> {
    try {
      await this.ensureBackendInjected();
    } catch (error) {
      return {
        attached: false,
        renderers: [],
        message: (error as Error).message,
      };
    }

    const renderers = await this.#page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook || !hook.renderers) {
        return [];
      }
      const results: Array<{
        id: number;
        name?: string;
        version?: string;
        bundleType?: number;
      }> = [];
      // hook.renderers is a Map in modern React DevTools.
      if (hook.renderers.forEach) {
        hook.renderers.forEach(
          (
            value: {
              rendererPackageName?: string;
              rendererVersion?: string;
              bundleType?: number;
            },
            key: number,
          ) => {
            results.push({
              id: key,
              name: value.rendererPackageName,
              version: value.rendererVersion,
              bundleType: value.bundleType,
            });
          },
        );
      } else if (Array.isArray(hook.renderers)) {
        for (const entry of hook.renderers) {
          results.push({
            id: entry[0],
            name: entry[1]?.rendererPackageName,
            version: entry[1]?.rendererVersion,
            bundleType: entry[1]?.bundleType,
          });
        }
      }
      return results;
    });

    return {
      attached: true,
      renderers,
    };
  }

  async listRoots(): Promise<ReactRootInfo[]> {
    await this.ensureBackendInjected();
    const roots = await this.#page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook || !hook.renderers || !hook.getFiberRoots) {
        return [];
      }
      const results: Array<{
        rendererId: number;
        rendererName?: string;
        rendererVersion?: string;
        rootId: string;
        rootIndex: number;
        displayName?: string;
        nodes?: number;
      }> = [];
      hook.renderers.forEach(
        (
          value: {
            rendererPackageName?: string;
            rendererVersion?: string;
            bundleType?: number;
          },
          rendererId: number,
        ) => {
          const fiberRoots = hook.getFiberRoots(rendererId);
          if (!fiberRoots || fiberRoots.size === 0) {
            return;
          }
          fiberRoots.forEach((root: any, idx: number) => {
            const displayName =
              root?.current?.elementType?.displayName ??
              root?.current?.elementType?.name ??
              'Unknown';
            // Count nodes roughly by walking depth-first with a cap to avoid runaway.
            let count = 0;
            const stack = [root?.current];
            const limit = 2000;
            while (stack.length && count < limit) {
              const node = stack.pop();
              if (!node) continue;
              count++;
              if (node.child) stack.push(node.child);
              if (node.sibling) stack.push(node.sibling);
            }
            results.push({
              rendererId,
              rendererName: value.rendererPackageName,
              rendererVersion: value.rendererVersion,
              rootId: `${rendererId}:${idx}`,
              rootIndex: idx,
              displayName,
              nodes: count,
            });
          });
        },
      );
      return results;
    });
    return roots;
  }
}
