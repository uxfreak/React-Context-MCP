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

  async getComponentMap(verbose = true, includeState = false): Promise<string | null> {
    // Get accessibility snapshot with backendDOMNodeId for correlation
    const snapshot = await this.takeSnapshot(verbose);
    if (!snapshot) {
      return null;
    }

    // Build a map of backendDOMNodeId -> accessibility info for quick lookup
    const axNodeMap = new Map<number, {role?: string; name?: string}>();
    const buildAxMap = (node: any) => {
      if (node.backendDOMNodeId) {
        axNodeMap.set(node.backendDOMNodeId, {
          role: node.role,
          name: node.name,
        });
      }
      if (node.children) {
        for (const child of node.children) {
          buildAxMap(child);
        }
      }
    };
    buildAxMap(snapshot.root);

    // Walk the React Fiber tree and build component tree with accessibility info
    const result = await this.#page.evaluate(
      (includeStateArg: boolean) => {
        const hook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook || !hook.renderers || !hook.getFiberRoots) {
          return {error: 'React DevTools hook not found or no renderers'};
        }

        // Helper to get component name from fiber
        const getComponentName = (fiber: any): string => {
          if (!fiber) return 'Unknown';
          if (fiber.type?.displayName) return fiber.type.displayName;

          switch (fiber.tag) {
            case 0: // FunctionComponent
            case 1: // ClassComponent
              return fiber.type?.name || fiber.elementType?.name || 'Anonymous';
            case 11: // ForwardRef
              return (
                fiber.type?.render?.displayName ||
                fiber.type?.render?.name ||
                fiber.elementType?.render?.name ||
                'ForwardRef'
              );
            case 15: // MemoComponent
              return (
                fiber.type?.type?.displayName ||
                fiber.type?.type?.name ||
                fiber.elementType?.type?.name ||
                'Memo'
              );
            default:
              return 'Unknown';
          }
        };

        // Helper to extract source location
        const extractSource = (fiber: any) => {
          const props = fiber.memoizedProps;
          if (!props) return null;

          const fileName = props['data-inspector-relative-path'];
          const lineNumber = props['data-inspector-line'];
          const columnNumber = props['data-inspector-column'];

          if (fileName || lineNumber || columnNumber) {
            return {
              fileName: fileName || undefined,
              lineNumber: lineNumber ? parseInt(lineNumber, 10) : undefined,
              columnNumber: columnNumber ? parseInt(columnNumber, 10) : undefined,
            };
          }

          return null;
        };

        // Helper to safe serialize state
        const safeSerialize = (obj: any, maxDepth = 2, seen = new WeakSet()): any => {
          if (obj === null || obj === undefined) return obj;
          if (typeof obj !== 'object') return obj;
          if (seen.has(obj)) return '[Circular]';
          seen.add(obj);
          if (maxDepth <= 0) return '[Max Depth]';
          if (Array.isArray(obj))
            return obj.slice(0, 10).map(item => safeSerialize(item, maxDepth - 1, seen));
          if (obj.$$typeof) return '[React Element]';
          if (obj instanceof Node) return '[DOM Node]';
          if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;

          const result: any = {};
          const entries = Object.entries(obj).slice(0, 20);
          for (const [key, value] of entries) {
            if (key.startsWith('__react')) continue;
            result[key] = safeSerialize(value, maxDepth - 1, seen);
          }
          return result;
        };

        // Helper to get backendDOMNodeId from fiber's DOM node
        const getBackendDOMNodeId = (fiber: any): number | null => {
          // For host components (DOM elements), stateNode is the DOM element
          if (fiber.tag === 5 && fiber.stateNode) {
            // stateNode is the actual DOM element
            const element = fiber.stateNode;
            // backendDOMNodeId is internal to CDP, not accessible from page context
            // We'll return a marker to indicate we should look it up
            return null;
          }
          return null;
        };

        // Walk fiber tree depth-first and collect components
        const lines: string[] = [];
        const processedFibers = new WeakSet();

        const walkFiber = (fiber: any, depth: number, prefix: string, isLast: boolean) => {
          if (!fiber || processedFibers.has(fiber)) return;
          processedFibers.add(fiber);

          // Check if this is an authored component (not a host element)
          const isComponent = [0, 1, 11, 15].includes(fiber.tag);
          const isHostElement = fiber.tag === 5; // Host component (div, button, etc.)

          if (isComponent) {
            const name = getComponentName(fiber);
            const source = extractSource(fiber);

            let line = prefix;
            line += name;

            // Add props summary if available
            if (fiber.memoizedProps) {
              const propsKeys = Object.keys(fiber.memoizedProps).filter(
                k => !k.startsWith('__react') && !k.startsWith('data-inspector') && k !== 'children',
              );
              if (propsKeys.length > 0) {
                line += ` {${propsKeys.slice(0, 3).join(', ')}}`;
              }
            }

            // Add state if requested and available
            if (includeStateArg && fiber.memoizedState) {
              const state = safeSerialize(fiber.memoizedState, 1);
              const stateStr = JSON.stringify(state);
              if (stateStr.length < 50) {
                line += ` state=${stateStr}`;
              } else {
                line += ` state={...}`;
              }
            }

            // Add source location
            if (source) {
              const loc = source.fileName
                ? `${source.fileName}:${source.lineNumber || '?'}:${source.columnNumber || '?'}`
                : '';
              if (loc) {
                line += ` (${loc})`;
              }
            }

            lines.push(line);

            // Update prefix for children
            const childPrefix = prefix.replace(/├─/g, '│ ').replace(/└─/g, '  ');

            // Process children
            let child = fiber.child;
            const children: any[] = [];
            while (child) {
              children.push(child);
              child = child.sibling;
            }

            children.forEach((child, idx) => {
              const isLastChild = idx === children.length - 1;
              const connector = isLastChild ? '└─' : '├─';
              walkFiber(child, depth + 1, childPrefix + connector + ' ', isLastChild);
            });
          } else if (isHostElement) {
            // For host elements, still traverse children to find components
            let child = fiber.child;
            while (child) {
              walkFiber(child, depth, prefix, isLast);
              child = child.sibling;
            }
          } else {
            // Other fiber types, just traverse children
            let child = fiber.child;
            while (child) {
              walkFiber(child, depth, prefix, isLast);
              child = child.sibling;
            }
          }
        };

        // Find all fiber roots and process them
        let foundAny = false;
        hook.renderers.forEach((_renderer: any, rendererId: number) => {
          const roots = hook.getFiberRoots(rendererId);
          if (!roots || roots.size === 0) return;

          roots.forEach((root: any, idx: number) => {
            if (!foundAny) {
              lines.push('React Component Tree:');
              lines.push('');
              foundAny = true;
            }

            const fiber = root.current;
            if (fiber) {
              walkFiber(fiber, 0, '', true);
            }
          });
        });

        if (!foundAny) {
          return {error: 'No React roots found'};
        }

        return {lines};
      },
      includeState,
    );

    if ('error' in result) {
      return `Error: ${result.error}`;
    }

    return result.lines.join('\n');
  }
}
