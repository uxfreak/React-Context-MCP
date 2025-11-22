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

    const result = await (context as any).getSelectedPage().evaluate(
      (role: string, name: string) => {
        // Find element by role and accessible name
        const elements = Array.from(document.querySelectorAll('*'));

        let targetElement: Element | null = null;
        for (const el of elements) {
          // Match by role and text content
          const elRole = el.getAttribute('role') || el.tagName.toLowerCase();
          const elText = el.textContent?.trim();

          if (elRole === role && elText === name) {
            targetElement = el;
            break;
          }
        }

        if (!targetElement) {
          return {success: false, error: `No element found with role="${role}" and name="${name}"`};
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
      },
      role,
      name,
    );

    response.appendResponseLine(JSON.stringify(result, null, 2));
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
];
