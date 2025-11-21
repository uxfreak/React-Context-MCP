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

export const tools = [
  ensureReactAttached,
  listReactRoots,
  listComponents,
  getComponent,
  highlightComponent,
];
