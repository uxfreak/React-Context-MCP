import {zod} from '../third_party/index.js';
import {defineTool} from './ToolDefinition.js';

export const ensureReactAttached = defineTool({
  name: 'ensure_react_attached',
  description:
    'Ensure the React DevTools backend hook is present on the current page and list detected renderers.',
  schema: {},
  handler: async (_req, response, context) => {
    const result = await context.ensureReactAttached();
    const lines: string[] = [];
    lines.push(
      result.attached
        ? 'React DevTools backend is installed.'
        : 'React DevTools backend is not installed.',
    );
    if (result.message) {
      lines.push(result.message);
    }
    if (result.renderers.length === 0) {
      lines.push('No React renderers detected on this page.');
    } else {
      lines.push('Renderers:');
      for (const renderer of result.renderers) {
        lines.push(
          `- id=${renderer.id} name=${renderer.name ?? 'unknown'} version=${
            renderer.version ?? 'unknown'
          } bundleType=${renderer.bundleType ?? 'n/a'}`,
        );
      }
    }
    for (const line of lines) {
      response.appendResponseLine(line);
    }
  },
});

export const listReactRoots = defineTool({
  name: 'list_react_roots',
  description:
    'List React roots detected on the current page. Requires React DevTools backend to be attached.',
  schema: {
    rendererId: zod.number().optional().describe('Filter by renderer id.'),
  },
  handler: async (request, response, context) => {
    const roots = await context.listReactRoots();
    const filtered = request.params.rendererId
      ? roots.filter(root => root.rendererId === request.params.rendererId)
      : roots;
    if (filtered.length === 0) {
      response.appendResponseLine('No React roots detected.');
      return;
    }
    for (const root of filtered) {
      response.appendResponseLine(
        `renderer=${root.rendererId}(${root.rendererName ?? 'unknown'}) root=${
          root.rootId
        } idx=${root.rootIndex} name=${root.displayName ?? 'Unknown'} nodes=${
          root.nodes ?? 'n/a'
        }`,
      );
    }
  },
});

export const listComponents = defineTool({
  name: 'list_components',
  description:
    'List React component tree (limited depth) for a root. Returns generated ids usable with get_component and highlight_component.',
  schema: {
    rendererId: zod.number().optional(),
    rootIndex: zod.number().optional(),
    depth: zod
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3)
      .describe('Depth to traverse from the root.'),
    maxNodes: zod
      .number()
      .int()
      .min(1)
      .max(2000)
      .default(200)
      .describe('Maximum nodes to return.'),
    nameFilter: zod.string().optional().describe('Substring match on name.'),
  },
  handler: async (request, response, context) => {
    const nodes = await context.listComponents({
      rendererId: request.params.rendererId,
      rootIndex: request.params.rootIndex,
      depth: request.params.depth,
      maxNodes: request.params.maxNodes,
      nameFilter: request.params.nameFilter,
    });
    if (nodes.length === 0) {
      response.appendResponseLine('No components matched.');
      return;
    }
    for (const node of nodes) {
      response.appendResponseLine(
        `${node.id} depth=${node.depth} type=${node.type} name=${node.name} key=${
          node.key ?? 'null'
        }`,
      );
    }
  },
});

export const getComponent = defineTool({
  name: 'get_component',
  description:
    'Inspect a component by id returned from list_components. Includes props/state/source if available.',
  schema: {
    id: zod.string().describe('Component id as returned by list_components.'),
  },
  handler: async (request, response, context) => {
    const data = await context.getComponentById(request.params.id);
    if (!data) {
      response.appendResponseLine('Component not found.');
      return;
    }
    response.appendResponseLine(JSON.stringify(data, null, 2));
  },
});

export const highlightComponent = defineTool({
  name: 'highlight_component',
  description:
    'Highlight a component in the page using its id from list_components.',
  schema: {
    id: zod.string().describe('Component id as returned by list_components.'),
  },
  handler: async (request, response, context) => {
    const result = await context.highlightComponent(request.params.id);
    response.appendResponseLine(
      result.ok
        ? `Highlighted: ${result.message}`
        : `Failed to highlight: ${result.message}`,
    );
  },
});

export const takeSnapshot = defineTool({
  name: 'take_snapshot',
  description:
    'Take an accessibility tree snapshot of the current page. Returns a hierarchical tree with roles, names, and UIDs for finding text and UI elements.',
  schema: {
    verbose: zod.boolean().optional().describe('Include all elements (true) or only interesting ones (false, default)'),
  },
  handler: async (request, response, context) => {
    const snapshot = await context.takeSnapshot(request.params.verbose ?? false);
    if (!snapshot) {
      response.appendResponseLine('No snapshot available.');
      return;
    }
    response.appendResponseLine(JSON.stringify(snapshot, null, 2));
  },
});

// Debug tool: Step 1 - Test finding React fiber keys on DOM elements
export const debugFiberKeys = defineTool({
  name: 'debug_fiber_keys',
  description: '[DEBUG] Test if we can find __reactFiber keys on DOM elements',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const result = await (context as any).getSelectedPage().evaluate(() => {
      // Find first button element
      const button = document.querySelector('button');
      if (!button) {
        return { success: false, error: 'No button found on page' };
      }

      // Get all keys on the button element
      const keys = Object.keys(button);

      // Find React fiber key
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));

      return {
        success: !!fiberKey,
        buttonText: button.textContent?.trim().substring(0, 50),
        totalKeys: keys.length,
        fiberKey: fiberKey || null,
        sampleKeys: keys.slice(0, 10),
      };
    });

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// Debug tool: Step 2 - Test walking up fiber tree to find component
export const debugFiberWalk = defineTool({
  name: 'debug_fiber_walk',
  description: '[DEBUG] Test walking up fiber tree from DOM element to find authored component',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const result = await (context as any).getSelectedPage().evaluate(() => {
      // Find first button element
      const button = document.querySelector('button');
      if (!button) {
        return { success: false, error: 'No button found on page' };
      }

      // Get fiber from button
      const keys = Object.keys(button);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) {
        return { success: false, error: 'No fiber key found on button' };
      }

      const fiber = (button as any)[fiberKey];
      if (!fiber) {
        return { success: false, error: 'Fiber key exists but fiber is null' };
      }

      // Walk up the fiber tree
      const chain: Array<{
        tag: number;
        typeName: string;
        hasType: boolean;
        hasProps: boolean;
        hasState: boolean;
      }> = [];

      let current = fiber;
      let foundComponent = null;
      let maxSteps = 20; // Safety limit

      while (current && maxSteps > 0) {
        maxSteps--;

        const typeName =
          (typeof current.type === 'function' ? current.type.name : null) ||
          (typeof current.type === 'string' ? current.type : null) ||
          (current.elementType?.name) ||
          'Unknown';

        const fiberInfo = {
          tag: current.tag,
          typeName,
          hasType: !!current.type,
          hasProps: !!current.memoizedProps,
          hasState: !!current.memoizedState,
        };

        chain.push(fiberInfo);

        // Check if this is an authored component
        // Tag 0 = FunctionComponent, Tag 1 = ClassComponent, Tag 11 = ForwardRef, Tag 15 = MemoComponent
        if ([0, 1, 11, 15].includes(current.tag)) {
          foundComponent = {
            tag: current.tag,
            typeName,
            hasProps: !!current.memoizedProps,
            hasState: !!current.memoizedState,
            hasSource: !!(current._debugSource || current.type?._debugSource),
          };
          break;
        }

        // Move up the tree
        current = current.return;
      }

      return {
        success: true,
        buttonText: button.textContent?.trim().substring(0, 50),
        chainLength: chain.length,
        chain,
        foundComponent,
        reachedLimit: maxSteps === 0,
      };
    });

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// Debug tool: Step 3 - Test extracting component metadata (name and type)
export const debugExtractMetadata = defineTool({
  name: 'debug_extract_metadata',
  description: '[DEBUG] Test extracting proper component name and type from fiber',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const result = await (context as any).getSelectedPage().evaluate(() => {
      // Find first button element
      const button = document.querySelector('button');
      if (!button) {
        return { success: false, error: 'No button found on page' };
      }

      // Get fiber and walk up to component
      const keys = Object.keys(button);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) {
        return { success: false, error: 'No fiber key found' };
      }

      let fiber = (button as any)[fiberKey];
      let maxSteps = 20;
      while (fiber && maxSteps > 0) {
        maxSteps--;
        if ([0, 1, 11, 15].includes(fiber.tag)) {
          break;
        }
        fiber = fiber.return;
      }

      if (!fiber) {
        return { success: false, error: 'No component found' };
      }

      // Extract component metadata based on tag
      const getComponentName = (fiber: any) => {
        // Try displayName first (respects React DevTools naming)
        if (fiber.type?.displayName) return fiber.type.displayName;

        // Tag-specific extraction
        switch (fiber.tag) {
          case 0: // FunctionComponent
          case 1: // ClassComponent
            return fiber.type?.name || fiber.elementType?.name || 'Anonymous';

          case 11: // ForwardRef
            return fiber.type?.render?.displayName ||
                   fiber.type?.render?.name ||
                   fiber.elementType?.render?.name ||
                   'ForwardRef';

          case 15: // MemoComponent
            return fiber.type?.type?.displayName ||
                   fiber.type?.type?.name ||
                   fiber.elementType?.type?.name ||
                   'Memo';

          default:
            return 'Unknown';
        }
      };

      const getComponentType = (tag: number) => {
        const types: Record<number, string> = {
          0: 'FunctionComponent',
          1: 'ClassComponent',
          2: 'IndeterminateComponent',
          11: 'ForwardRef',
          15: 'MemoComponent',
        };
        return types[tag] || `UnknownTag(${tag})`;
      };

      const name = getComponentName(fiber);
      const type = getComponentType(fiber.tag);

      return {
        success: true,
        buttonText: button.textContent?.trim().substring(0, 50),
        component: {
          name,
          type,
          tag: fiber.tag,
          hasDisplayName: !!fiber.type?.displayName,
          hasTypeName: !!fiber.type?.name,
          hasRender: !!fiber.type?.render,
          hasTypeType: !!fiber.type?.type,
        },
        rawTypeInfo: {
          typeOfType: typeof fiber.type,
          typeKeys: fiber.type ? Object.keys(fiber.type).slice(0, 10) : [],
        },
      };
    });

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// Debug tool: Step 4 - Test extracting and safely serializing props
export const debugExtractProps = defineTool({
  name: 'debug_extract_props',
  description: '[DEBUG] Test extracting props with safe serialization (depth limit, circular refs)',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const result = await (context as any).getSelectedPage().evaluate(() => {
      // Find first button element
      const button = document.querySelector('button');
      if (!button) {
        return { success: false, error: 'No button found on page' };
      }

      // Get fiber and walk up to component
      const keys = Object.keys(button);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) {
        return { success: false, error: 'No fiber key found' };
      }

      let fiber = (button as any)[fiberKey];
      let maxSteps = 20;
      while (fiber && maxSteps > 0) {
        maxSteps--;
        if ([0, 1, 11, 15].includes(fiber.tag)) {
          break;
        }
        fiber = fiber.return;
      }

      if (!fiber) {
        return { success: false, error: 'No component found' };
      }

      // Safe serialization with depth limit and circular reference detection
      const safeSerialize = (obj: any, maxDepth = 3, seen = new WeakSet()): any => {
        // Handle primitives
        if (obj === null || obj === undefined) return obj;
        if (typeof obj !== 'object') return obj;

        // Handle circular references
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);

        // Handle depth limit
        if (maxDepth <= 0) return '[Max Depth]';

        // Handle arrays
        if (Array.isArray(obj)) {
          return obj.slice(0, 100).map(item => safeSerialize(item, maxDepth - 1, seen));
        }

        // Handle React elements
        if (obj.$$typeof) {
          return '[React Element]';
        }

        // Handle DOM nodes
        if (obj instanceof Node) {
          return '[DOM Node]';
        }

        // Handle functions
        if (typeof obj === 'function') {
          return `[Function: ${obj.name || 'anonymous'}]`;
        }

        // Handle plain objects
        const result: any = {};
        const entries = Object.entries(obj).slice(0, 50); // Limit properties
        for (const [key, value] of entries) {
          // Skip internal React props
          if (key.startsWith('__react')) continue;
          result[key] = safeSerialize(value, maxDepth - 1, seen);
        }
        return result;
      };

      const props = fiber.memoizedProps;
      const serializedProps = props ? safeSerialize(props, 3) : null;

      return {
        success: true,
        buttonText: button.textContent?.trim().substring(0, 50),
        propsInfo: {
          hasProps: !!props,
          propsKeys: props ? Object.keys(props).slice(0, 20) : [],
          propsCount: props ? Object.keys(props).length : 0,
        },
        props: serializedProps,
      };
    });

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// Debug tool: Step 5 - Test extracting source location from data-inspector props
export const debugExtractSource = defineTool({
  name: 'debug_extract_source',
  description: '[DEBUG] Test extracting source location from data-inspector-* props (React 19 compatible)',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const result = await (context as any).getSelectedPage().evaluate(() => {
      // Find first button element
      const button = document.querySelector('button');
      if (!button) {
        return { success: false, error: 'No button found on page' };
      }

      // Get fiber and walk up to component
      const keys = Object.keys(button);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) {
        return { success: false, error: 'No fiber key found' };
      }

      let fiber = (button as any)[fiberKey];
      let maxSteps = 20;
      while (fiber && maxSteps > 0) {
        maxSteps--;
        if ([0, 1, 11, 15].includes(fiber.tag)) {
          break;
        }
        fiber = fiber.return;
      }

      if (!fiber) {
        return { success: false, error: 'No component found' };
      }

      // Extract source location from data-inspector-* props
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

      const source = extractSource(fiber);

      return {
        success: true,
        buttonText: button.textContent?.trim().substring(0, 50),
        hasSource: !!source,
        source,
        // Show what props we checked
        checkedProps: {
          'data-inspector-relative-path': fiber.memoizedProps?.['data-inspector-relative-path'],
          'data-inspector-line': fiber.memoizedProps?.['data-inspector-line'],
          'data-inspector-column': fiber.memoizedProps?.['data-inspector-column'],
        },
      };
    });

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// Debug tool: Step 6 - Test extracting owners chain
export const debugExtractOwners = defineTool({
  name: 'debug_extract_owners',
  description: '[DEBUG] Test extracting owners chain by walking up fiber tree (React 19 compatible)',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const result = await (context as any).getSelectedPage().evaluate(() => {
      // Find first button element
      const button = document.querySelector('button');
      if (!button) {
        return { success: false, error: 'No button found on page' };
      }

      // Get fiber and walk up to component
      const keys = Object.keys(button);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) {
        return { success: false, error: 'No fiber key found' };
      }

      let fiber = (button as any)[fiberKey];
      let maxSteps = 20;
      while (fiber && maxSteps > 0) {
        maxSteps--;
        if ([0, 1, 11, 15].includes(fiber.tag)) {
          break;
        }
        fiber = fiber.return;
      }

      if (!fiber) {
        return { success: false, error: 'No component found' };
      }

      // Helper to get component name
      const getComponentName = (fiber: any) => {
        if (fiber.type?.displayName) return fiber.type.displayName;

        switch (fiber.tag) {
          case 0:
          case 1:
            return fiber.type?.name || fiber.elementType?.name || 'Anonymous';
          case 11:
            return fiber.type?.render?.displayName ||
                   fiber.type?.render?.name ||
                   fiber.elementType?.render?.name ||
                   'ForwardRef';
          case 15:
            return fiber.type?.type?.displayName ||
                   fiber.type?.type?.name ||
                   fiber.elementType?.type?.name ||
                   'Memo';
          default:
            return 'Unknown';
        }
      };

      const getComponentType = (tag: number) => {
        const types: Record<number, string> = {
          0: 'FunctionComponent',
          1: 'ClassComponent',
          11: 'ForwardRef',
          15: 'MemoComponent',
        };
        return types[tag] || `UnknownTag(${tag})`;
      };

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

      // Walk up the tree to collect owner components
      const owners: Array<{
        name: string;
        type: string;
        source?: any;
      }> = [];

      let current = fiber.return; // Start from parent
      let maxOwners = 10;

      while (current && maxOwners > 0) {
        // Only collect authored components
        if ([0, 1, 11, 15].includes(current.tag)) {
          const name = getComponentName(current);
          const type = getComponentType(current.tag);
          const source = extractSource(current);

          owners.push({
            name,
            type,
            ...(source && { source }),
          });

          maxOwners--;
        }

        current = current.return;
      }

      return {
        success: true,
        buttonText: button.textContent?.trim().substring(0, 50),
        currentComponent: {
          name: getComponentName(fiber),
          type: getComponentType(fiber.tag),
        },
        ownersCount: owners.length,
        owners,
      };
    });

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// Production tool: Get React component info from snapshot element
export const getReactComponentFromSnapshot = defineTool({
  name: 'get_react_component_from_snapshot',
  description: 'Get React component info for an element from take_snapshot. Pass role and name from snapshot to find the element and extract React data (name, type, props, source, owners).',
  schema: {
    role: zod.string().describe('Role from snapshot (e.g., "button", "heading")'),
    name: zod.string().describe('Name from snapshot (e.g., "Sign up", "Log in")'),
  },
  handler: async (request, response, context) => {
    await context.ensureReactAttached();

    const {role, name} = request.params;
    const page = (context as any).getSelectedPage();

    // Use ARIA selector to find element (more reliable than manual DOM search)
    const ariaSelector = `aria/${name}[role="${role}"]`;
    const elementHandle = await page.$(ariaSelector);

    if (!elementHandle) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: `No element found with role="${role}" and name="${name}"`,
        ariaSelector,
      }, null, 2));
      return;
    }

    // Now extract React fiber and component data from the element
    const result = await elementHandle.evaluate((targetElement: Element) => {
        if (!targetElement) {
          return {success: false, error: 'Element handle is null'};
        }

        // Get fiber from element
        const keys = Object.keys(targetElement);
        const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) {
          return {success: false, error: 'Element found but has no React fiber'};
        }

        let fiber = (targetElement as any)[fiberKey];
        let maxSteps = 20;
        while (fiber && maxSteps > 0) {
          maxSteps--;
          if ([0, 1, 11, 15].includes(fiber.tag)) {
            break;
          }
          fiber = fiber.return;
        }

        if (!fiber) {
          return {success: false, error: 'No React component found in fiber tree'};
        }

        // Extract all component data using tested capabilities
        const getComponentName = (fiber: any) => {
          if (fiber.type?.displayName) return fiber.type.displayName;
          switch (fiber.tag) {
            case 0:
            case 1:
              return fiber.type?.name || fiber.elementType?.name || 'Anonymous';
            case 11:
              return fiber.type?.render?.displayName || fiber.type?.render?.name || 'ForwardRef';
            case 15:
              return fiber.type?.type?.displayName || fiber.type?.type?.name || 'Memo';
            default:
              return 'Unknown';
          }
        };

        const getComponentType = (tag: number) => {
          const types: Record<number, string> = {
            0: 'FunctionComponent',
            1: 'ClassComponent',
            11: 'ForwardRef',
            15: 'MemoComponent',
          };
          return types[tag] || `UnknownTag(${tag})`;
        };

        const safeSerialize = (obj: any, maxDepth = 3, seen = new WeakSet()): any => {
          if (obj === null || obj === undefined) return obj;
          if (typeof obj !== 'object') return obj;
          if (seen.has(obj)) return '[Circular]';
          seen.add(obj);
          if (maxDepth <= 0) return '[Max Depth]';
          if (Array.isArray(obj)) return obj.slice(0, 100).map(item => safeSerialize(item, maxDepth - 1, seen));
          if (obj.$$typeof) return '[React Element]';
          if (obj instanceof Node) return '[DOM Node]';
          if (typeof obj === 'function') return `[Function: ${obj.name || 'anonymous'}]`;
          const result: any = {};
          const entries = Object.entries(obj).slice(0, 50);
          for (const [key, value] of entries) {
            if (key.startsWith('__react')) continue;
            result[key] = safeSerialize(value, maxDepth - 1, seen);
          }
          return result;
        };

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

        // Extract owners
        const owners: Array<{name: string; type: string; source?: any}> = [];
        let current = fiber.return;
        let maxOwners = 10;
        while (current && maxOwners > 0) {
          if ([0, 1, 11, 15].includes(current.tag)) {
            const name = getComponentName(current);
            const type = getComponentType(current.tag);
            const source = extractSource(current);
            owners.push({name, type, ...(source && {source})});
            maxOwners--;
          }
          current = current.return;
        }

        return {
          success: true,
          component: {
            name: getComponentName(fiber),
            type: getComponentType(fiber.tag),
            props: fiber.memoizedProps ? safeSerialize(fiber.memoizedProps, 3) : null,
            state: fiber.memoizedState ? safeSerialize(fiber.memoizedState, 2) : null,
            source: extractSource(fiber),
            owners,
          },
        };
      });

    response.appendResponseLine(JSON.stringify(result, null, 2));
  },
});

// Test 1: Basic ARIA selector test
export const testAriaSelector = defineTool({
  name: 'test_aria_selector',
  description: '[TEST 1] Test if Puppeteer ARIA selectors work to find "Sign up" button using aria/Name[role="button"] syntax',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const page = (context as any).getSelectedPage();

    try {
      // Test ARIA selector syntax: aria/Name[role="button"]
      const selector = 'aria/Sign up[role="button"]';
      const element = await page.$(selector);

      if (!element) {
        response.appendResponseLine(JSON.stringify({
          success: false,
          selector,
          error: 'ARIA selector returned null - element not found',
        }, null, 2));
        return;
      }

      // Element found! Get some basic info
      const info = await element.evaluate((el: Element) => {
        return {
          tagName: el.tagName.toLowerCase(),
          textContent: el.textContent?.trim().substring(0, 50),
          role: el.getAttribute('role'),
          hasReactFiber: Object.keys(el).some(k => k.startsWith('__reactFiber')),
        };
      });

      response.appendResponseLine(JSON.stringify({
        success: true,
        selector,
        elementFound: true,
        elementInfo: info,
      }, null, 2));
    } catch (error: any) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: error.message,
      }, null, 2));
    }
  },
});

// Test 2: Get React fiber from ARIA-found element
export const testAriaToFiber = defineTool({
  name: 'test_aria_to_fiber',
  description: '[TEST 2] Test getting React fiber and component info from ARIA-found "Sign up" button',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const page = (context as any).getSelectedPage();

    try {
      const result = await page.evaluate(async () => {
        // Use ARIA selector to find element (simulated in evaluate context)
        const button = document.querySelector('button');
        if (!button || button.textContent?.trim() !== 'Sign up') {
          return {success: false, error: 'Sign up button not found'};
        }

        // Get fiber from element
        const keys = Object.keys(button);
        const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) {
          return {success: false, error: 'No React fiber on button'};
        }

        let fiber = (button as any)[fiberKey];
        const originalFiberTag = fiber?.tag;

        // Walk up to authored component
        let maxSteps = 20;
        while (fiber && maxSteps > 0) {
          maxSteps--;
          if ([0, 1, 11, 15].includes(fiber.tag)) break;
          fiber = fiber.return;
        }

        if (!fiber) {
          return {success: false, error: 'No authored React component found in fiber tree'};
        }

        // Extract basic component info
        const getComponentName = (fiber: any): string => {
          if (!fiber) return 'Unknown';
          let type = fiber.type;
          if (type?.displayName) return type.displayName;
          if (type?.name) return type.name;
          if (fiber.tag === 11 && type?.render) {
            if (type.render.displayName) return type.render.displayName;
            if (type.render.name) return type.render.name;
          }
          if (fiber.tag === 15 && type?.type) {
            if (type.type.displayName) return type.type.displayName;
            if (type.type.name) return type.type.name;
          }
          return 'Unknown';
        };

        const getComponentType = (tag: number): string => {
          const types: Record<number, string> = {
            0: 'FunctionComponent',
            1: 'ClassComponent',
            5: 'HostComponent',
            11: 'ForwardRef',
            15: 'MemoComponent',
          };
          return types[tag] || `Tag${tag}`;
        };

        return {
          success: true,
          originalFiberTag,
          stepsToComponent: 20 - maxSteps,
          component: {
            name: getComponentName(fiber),
            type: getComponentType(fiber.tag),
            tag: fiber.tag,
          },
        };
      });

      response.appendResponseLine(JSON.stringify(result, null, 2));
    } catch (error: any) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: error.message,
      }, null, 2));
    }
  },
});

// Test 3: Edge cases - not found, different element
export const testAriaEdgeCases = defineTool({
  name: 'test_aria_edge_cases',
  description: '[TEST 3] Test edge cases: element not found, trying "Log in" button',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const page = (context as any).getSelectedPage();

    try {
      const results = await page.evaluate(async () => {
        const tests: any[] = [];

        // Test 1: Element not found
        try {
          const selector1 = 'aria/DoesNotExist[role="button"]';
          // In evaluate context, we can't use page.$, so simulate
          tests.push({
            test: 'Element not found',
            selector: selector1,
            expected: 'Should handle gracefully',
            result: 'Cannot test page.$ in evaluate context - will test in handler',
          });
        } catch (e: any) {
          tests.push({test: 'Element not found', error: e.message});
        }

        // Test 2: Find "Log in" button
        const loginButton = Array.from(document.querySelectorAll('button')).find(
          b => b.textContent?.trim() === 'Log in'
        );

        if (loginButton) {
          const keys = Object.keys(loginButton);
          const fiberKey = keys.find(k => k.startsWith('__reactFiber'));

          if (fiberKey) {
            let fiber = (loginButton as any)[fiberKey];
            let maxSteps = 20;
            while (fiber && maxSteps > 0) {
              maxSteps--;
              if ([0, 1, 11, 15].includes(fiber.tag)) break;
              fiber = fiber.return;
            }

            const getComponentName = (fiber: any): string => {
              if (!fiber) return 'Unknown';
              let type = fiber.type;
              if (type?.displayName) return type.displayName;
              if (type?.name) return type.name;
              if (fiber.tag === 11 && type?.render) {
                if (type.render.displayName) return type.render.displayName;
                if (type.render.name) return type.render.name;
              }
              return 'Unknown';
            };

            tests.push({
              test: 'Find Log in button',
              success: true,
              component: getComponentName(fiber),
              stepsToComponent: 20 - maxSteps,
            });
          } else {
            tests.push({test: 'Find Log in button', success: false, error: 'No fiber'});
          }
        } else {
          tests.push({test: 'Find Log in button', success: false, error: 'Button not found'});
        }

        return {success: true, tests};
      });

      // Test element not found using page.$
      const notFoundSelector = 'aria/DoesNotExist[role="button"]';
      const notFound = await page.$(notFoundSelector);
      results.tests[0].result = notFound ? 'UNEXPECTED: Found element' : 'Correctly returned null';

      response.appendResponseLine(JSON.stringify(results, null, 2));
    } catch (error: any) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: error.message,
      }, null, 2));
    }
  },
});

// Test 1: Get backendDOMNodeId from CDP Accessibility domain
export const testCdpBackendNodeId = defineTool({
  name: 'test_cdp_backend_node_id',
  description: '[CDP TEST 1] Test getting backendDOMNodeId from CDP Accessibility.getFullAXTree for "Sign up" button',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const page = (context as any).getSelectedPage();

    try {
      // Access CDP client
      const client = (page as any)._client();

      // Enable Accessibility domain
      await client.send('Accessibility.enable');

      // Get full AX tree with backendDOMNodeId
      const axTree = await client.send('Accessibility.getFullAXTree');

      // Helper to recursively search all nodes in the flat array
      const findNodeInArray = (nodes: any[], targetRole: string, targetName: string): any => {
        for (const node of nodes) {
          if (node.role?.value === targetRole && node.name?.value === targetName) {
            return node;
          }
        }
        return null;
      };

      // Find "Sign up" button - axTree.nodes is a flat array, not a tree
      const signupNode = findNodeInArray(axTree.nodes, 'button', 'Sign up');

      if (!signupNode) {
        // Debug: show first 3 button nodes to understand structure
        const buttonNodes = axTree.nodes.filter((n: any) => n.role?.value === 'button').slice(0, 3);
        response.appendResponseLine(JSON.stringify({
          success: false,
          error: 'Sign up button not found in AX tree',
          treeNodeCount: axTree.nodes?.length || 0,
          buttonCount: axTree.nodes.filter((n: any) => n.role?.value === 'button').length,
          sampleButtons: buttonNodes.map((n: any) => ({role: n.role?.value, name: n.name?.value})),
        }, null, 2));
        return;
      }

      response.appendResponseLine(JSON.stringify({
        success: true,
        node: {
          role: signupNode.role?.value,
          name: signupNode.name?.value,
          backendDOMNodeId: signupNode.backendDOMNodeId,
          nodeId: signupNode.nodeId,
        },
        message: 'Successfully extracted backendDOMNodeId from CDP',
      }, null, 2));
    } catch (error: any) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }, null, 2));
    }
  },
});

// Test 2: Resolve backendDOMNodeId to DOM ElementHandle
export const testCdpResolveNode = defineTool({
  name: 'test_cdp_resolve_node',
  description: '[CDP TEST 2] Test resolving backendDOMNodeId (53) to DOM ElementHandle using DOM.resolveNode',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const page = (context as any).getSelectedPage();

    try {
      // Access CDP client
      const client = (page as any)._client();

      // Enable DOM domain
      await client.send('DOM.enable');

      // Get document to ensure DOM tree is available
      await client.send('DOM.getDocument');

      // Test with known backendDOMNodeId from Test 1
      const backendNodeId = 53;

      // Resolve using backendNodeId only (executionContextId is optional)
      const {object} = await client.send('DOM.resolveNode', {
        backendNodeId,
      });

      if (!object || !object.objectId) {
        response.appendResponseLine(JSON.stringify({
          success: false,
          error: 'DOM.resolveNode did not return a valid object',
          object,
        }, null, 2));
        return;
      }

      // Successfully got a remote object with objectId
      response.appendResponseLine(JSON.stringify({
        success: true,
        message: 'Successfully resolved backendNodeId to remote object',
        remoteObject: {
          objectId: object.objectId,
          type: object.type,
          subtype: object.subtype,
          className: object.className,
        },
        backendNodeId,
      }, null, 2));
    } catch (error: any) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }, null, 2));
    }
  },
});

// Test 3: Combined test - Get backendDOMNodeId AND resolve it in same execution
export const testCdpCombined = defineTool({
  name: 'test_cdp_combined',
  description: '[CDP TEST 3] Combined test: Get backendDOMNodeId from AX tree and immediately resolve to DOM element',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const page = (context as any).getSelectedPage();

    try {
      const client = (page as any)._client();

      // Enable domains
      await client.send('Accessibility.enable');
      await client.send('DOM.enable');
      await client.send('DOM.getDocument');

      // Step 1: Get AX tree
      const axTree = await client.send('Accessibility.getFullAXTree');

      // Step 2: Find Sign up button
      const findNodeInArray = (nodes: any[], targetRole: string, targetName: string): any => {
        for (const node of nodes) {
          if (node.role?.value === targetRole && node.name?.value === targetName) {
            return node;
          }
        }
        return null;
      };

      const signupNode = findNodeInArray(axTree.nodes, 'button', 'Sign up');

      if (!signupNode || !signupNode.backendDOMNodeId) {
        response.appendResponseLine(JSON.stringify({
          success: false,
          error: 'Could not find Sign up button in AX tree',
          nodeCount: axTree.nodes.length,
        }, null, 2));
        return;
      }

      const backendNodeId = signupNode.backendDOMNodeId;

      // Step 3: Immediately resolve the node in same session
      const {object} = await client.send('DOM.resolveNode', {
        backendNodeId,
      });

      if (!object || !object.objectId) {
        response.appendResponseLine(JSON.stringify({
          success: false,
          error: 'DOM.resolveNode did not return a valid object',
          backendNodeId,
          object,
        }, null, 2));
        return;
      }

      response.appendResponseLine(JSON.stringify({
        success: true,
        message: 'Successfully got backendNodeId from AX tree and resolved to DOM object',
        backendNodeId,
        remoteObject: {
          objectId: object.objectId,
          type: object.type,
          subtype: object.subtype,
          className: object.className,
        },
      }, null, 2));
    } catch (error: any) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }, null, 2));
    }
  },
});

// Test 4: Extract React fiber from RemoteObject
export const testCdpExtractFiber = defineTool({
  name: 'test_cdp_extract_fiber',
  description: '[CDP TEST 4] Extract React fiber from DOM element via Runtime.callFunctionOn',
  schema: {},
  handler: async (_req, response, context) => {
    await context.ensureReactAttached();

    const page = (context as any).getSelectedPage();

    try {
      const client = (page as any)._client();

      // Enable domains
      await client.send('Accessibility.enable');
      await client.send('DOM.enable');
      await client.send('DOM.getDocument');

      // Step 1: Get backendDOMNodeId from AX tree
      const axTree = await client.send('Accessibility.getFullAXTree');

      const findNodeInArray = (nodes: any[], targetRole: string, targetName: string): any => {
        for (const node of nodes) {
          if (node.role?.value === targetRole && node.name?.value === targetName) {
            return node;
          }
        }
        return null;
      };

      const signupNode = findNodeInArray(axTree.nodes, 'button', 'Sign up');

      if (!signupNode || !signupNode.backendDOMNodeId) {
        response.appendResponseLine(JSON.stringify({
          success: false,
          error: 'Could not find Sign up button in AX tree',
        }, null, 2));
        return;
      }

      const backendNodeId = signupNode.backendDOMNodeId;

      // Step 2: Resolve to RemoteObject
      const {object} = await client.send('DOM.resolveNode', {
        backendNodeId,
      });

      if (!object || !object.objectId) {
        response.appendResponseLine(JSON.stringify({
          success: false,
          error: 'DOM.resolveNode did not return a valid object',
        }, null, 2));
        return;
      }

      // Step 3: Extract React fiber and navigate to component using Runtime.callFunctionOn
      const fiberResult = await client.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function() {
          const keys = Object.keys(this);
          const fiberKey = keys.find(k => k.startsWith('__reactFiber$'));
          if (!fiberKey) return { error: 'No React fiber found' };

          let fiber = this[fiberKey];
          const hostFiber = {
            tag: fiber.tag,
            type: typeof fiber.type === 'function' ? fiber.type.name : String(fiber.type),
          };

          // Navigate up the fiber tree and collect ALL components
          // tag 0 = FunctionComponent, tag 1 = ClassComponent
          // tag 5 = HostComponent (DOM element like 'button', 'div')
          // tag 11 = ForwardRef or Memo wrapper
          let current = fiber;
          const path = [];
          const components = [];

          while (current) {
            const typeName = typeof current.type === 'function' ? current.type.name : String(current.type || 'unknown');
            path.push({
              tag: current.tag,
              type: typeName
            });

            // Collect all React components (FunctionComponent, ClassComponent, ForwardRef/Memo)
            if (current.tag === 0 || current.tag === 1 || current.tag === 11) {
              const componentName = typeof current.type === 'function' ? current.type.name : String(current.type || 'Unknown');
              const tagNames = {
                0: 'FunctionComponent',
                1: 'ClassComponent',
                11: 'ForwardRef'
              };

              components.push({
                tag: current.tag,
                tagName: tagNames[current.tag] || 'Unknown',
                name: componentName,
                displayName: current.type?.displayName || null,
                // Try to get source location
                source: current._debugSource ? {
                  fileName: String(current._debugSource.fileName || ''),
                  lineNumber: Number(current._debugSource.lineNumber) || 0,
                  columnNumber: Number(current._debugSource.columnNumber) || 0
                } : null
              });
            }

            current = current.return;

            // Safety: don't traverse more than 50 levels
            if (path.length > 50) break;
          }

          return {
            fiberKey: fiberKey,
            hostFiber: hostFiber,
            components: components,  // Array of ALL components from closest to farthest
            immediateParent: components[0] || null,  // Closest component
            rootComponent: components[components.length - 1] || null,  // Farthest component
            traversalPath: path,
            traversalDepth: path.length
          };
        }`,
        returnByValue: true,
      });

      response.appendResponseLine(JSON.stringify({
        success: true,
        message: 'Successfully navigated fiber tree to find React component',
        backendNodeId,
        objectId: object.objectId,
        result: fiberResult.result.value,
      }, null, 2));
    } catch (error: any) {
      response.appendResponseLine(JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }, null, 2));
    }
  },
});

export const tools = [
  ensureReactAttached,
  listReactRoots,
  listComponents,
  getComponent,
  highlightComponent,
  takeSnapshot,
  getReactComponentFromSnapshot,
  debugFiberKeys,
  debugFiberWalk,
  debugExtractMetadata,
  debugExtractProps,
  debugExtractSource,
  debugExtractOwners,
  testAriaSelector,
  testAriaToFiber,
  testAriaEdgeCases,
  testCdpBackendNodeId,
  testCdpResolveNode,
  testCdpCombined,
  testCdpExtractFiber,
];
