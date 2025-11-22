import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

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
  static #backendSource: string | null = null;

  constructor(page: Page) {
    this.#page = page;
  }

  static resolveBackendPath(): string {
    if (this.#backendPath) {
      return this.#backendPath;
    }
    // Use the published `react-devtools-core` backend bundle (UMD, browser-ready).
    const require = createRequire(import.meta.url);
    const resolved = require.resolve('react-devtools-core/dist/backend.js');
    this.#backendPath = resolved;
    return resolved;
  }

  static getBackendSource(): string {
    if (this.#backendSource) {
      return this.#backendSource;
    }
    const file = this.resolveBackendPath();
    this.#backendSource = fs.readFileSync(file, 'utf8');
    return this.#backendSource;
  }

  async ensureBackendInjected(): Promise<void> {
    if (this.#backendInjected) {
      return;
    }

    // Ensure CSP doesn't block our injected scripts.
    await this.#page.setBypassCSP(true);

    // Try to install hook early for subsequent navigations.
    const backendPath = ReactSession.resolveBackendPath();
    const backendSource = ReactSession.getBackendSource();
    const hookBootstrap = `
      (function initReactHook(){
        const existing = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        const renderers = existing?.renderers || new Map();
        const fiberRoots = existing?.getFiberRoots
          ? existing.getFiberRoots
          : (id) => fiberRootsMap.get(id) || new Set();
        const fiberRootsMap = existing?._fiberRoots || new Map();
        let nextId = renderers.size + 1;
        const injectBase = typeof existing?.inject === 'function' ? existing.inject : null;
        const onCommitBase =
          typeof existing?.onCommitFiberRoot === 'function'
            ? existing.onCommitFiberRoot
            : null;
        const hook = existing || {};
        hook.supportsFiber = true;
        hook.renderers = renderers;
        hook._fiberRoots = fiberRootsMap;
        hook.getFiberRoots = id => fiberRootsMap.get(id) || new Set();
        hook.inject = function (renderer) {
          const id = injectBase ? injectBase.call(this, renderer) : nextId++;
          try { renderers.set(id, renderer); } catch (e) {}
          return id;
        };
        hook.onCommitFiberRoot = function (id, root, ...rest) {
          let roots = fiberRootsMap.get(id);
          if (!roots) {
            roots = new Set();
            fiberRootsMap.set(id, roots);
          }
          roots.add(root);
          if (onCommitBase) {
            try { onCommitBase.call(this, id, root, ...rest); } catch (e) {}
          }
        };
        globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
      })();
    `;
    await this.#page.evaluateOnNewDocument((source, bootstrap) => {
      try {
        // eslint-disable-next-line no-eval
        eval(bootstrap);
        // eslint-disable-next-line no-eval
        eval(source);
      } catch (e) {
        console.warn('React DevTools MCP preload failed', e);
      }
    }, backendSource, hookBootstrap);

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
      // Re-install at runtime to win against any later shims.
      await this.#page.evaluate((source, bootstrap) => {
        try {
          // eslint-disable-next-line no-eval
          eval(bootstrap);
          // eslint-disable-next-line no-eval
          eval(source);
        } catch (e) {
          console.warn('React DevTools MCP runtime inject failed', e);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return Boolean((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__);
      }, backendSource, hookBootstrap);

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
    const {results, error} = await this.#page.evaluate(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook || !hook.renderers || !hook.getFiberRoots) {
          return {results: [], error: null};
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
            let idx = 0;
            fiberRoots.forEach((root: any) => {
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
              idx++;
            });
          },
        );
        return {results, error: null};
      } catch (e) {
        return {results: [], error: (e as Error).message};
      }
    });
    if (error) {
      throw new Error(error);
    }
    return results;
  }

  async takeSnapshot(verbose = false) {
    await this.ensureBackendInjected();

    // Use CDP to get full accessibility tree with backendDOMNodeId
    const client = (this.#page as any)._client();
    await client.send('Accessibility.enable');
    const cdpAxTree = await client.send('Accessibility.getFullAXTree');

    if (!cdpAxTree || !cdpAxTree.nodes || cdpAxTree.nodes.length === 0) {
      return null;
    }

    const snapshotId = Date.now().toString();
    let uidCounter = 0;

    // CDP returns flat array - need to build hierarchy
    // First, create a map of all nodes by nodeId
    const nodeMap = new Map();
    const childrenMap = new Map(); // parentId -> childIds

    for (const node of cdpAxTree.nodes) {
      const nodeId = node.nodeId;
      nodeMap.set(nodeId, node);

      // Track children relationships
      if (node.childIds && node.childIds.length > 0) {
        childrenMap.set(nodeId, node.childIds);
      }
    }

    // Process node and build hierarchy
    const processNode = (node: any): any => {
      // Filter by interestingOnly if needed
      if (!verbose && node.ignored) {
        return null;
      }

      const uid = `${snapshotId}_${uidCounter++}`;
      const processed: any = {
        role: node.role?.value,
        name: node.name?.value,
        uid,
        backendDOMNodeId: node.backendDOMNodeId, // Add this!
      };

      // Copy a11y properties
      if (node.value?.value !== undefined) processed.value = node.value.value;
      if (node.description?.value !== undefined) processed.description = node.description.value;
      if (node.keyshortcuts?.value !== undefined) processed.keyshortcuts = node.keyshortcuts.value;
      if (node.roledescription?.value !== undefined) processed.roledescription = node.roledescription.value;
      if (node.disabled?.value !== undefined) processed.disabled = node.disabled.value;
      if (node.expanded?.value !== undefined) processed.expanded = node.expanded.value;
      if (node.focused?.value !== undefined) processed.focused = node.focused.value;
      if (node.checked?.value !== undefined) processed.checked = node.checked.value;
      if (node.pressed?.value !== undefined) processed.pressed = node.pressed.value;

      // Process children recursively
      const childIds = childrenMap.get(node.nodeId);
      if (childIds && childIds.length > 0) {
        const children = childIds
          .map((childId: string) => {
            const childNode = nodeMap.get(childId);
            return childNode ? processNode(childNode) : null;
          })
          .filter((child: any) => child !== null);

        if (children.length > 0) {
          processed.children = children;
        }
      }

      return processed;
    };

    // Find root node (no parent)
    const rootNode = cdpAxTree.nodes[0]; // First node is usually root

    if (!rootNode) {
      return null;
    }

    const root = processNode(rootNode);

    return {
      root,
      snapshotId,
    };
  }
}
