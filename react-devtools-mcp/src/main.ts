#!/usr/bin/env node

/**
 * React DevTools MCP Server
 */
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {parseArguments} from './cli.js';
import {McpContext} from './McpContext.js';
import {Mutex} from './Mutex.js';
import {McpResponse} from './McpResponse.js';
import {logger} from './logger.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
} from './third_party/index.js';
import {tools as reactTools} from './tools/react.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';

const VERSION = '0.1.0';

async function main() {
  const args = parseArguments();
  const server = new McpServer(
    {
      name: 'react_devtools',
      title: 'React DevTools MCP server',
      version: VERSION,
    },
    {capabilities: {logging: {}}},
  );

  const transport = new StdioServerTransport();
  const toolMutex = new Mutex();

  let context: McpContext;

  async function getContext(): Promise<McpContext> {
    if (context) {
      return context;
    }
    const browser =
      args.browserUrl || args.wsEndpoint
        ? await ensureBrowserConnected({
            browserURL: args.browserUrl,
            wsEndpoint: args.wsEndpoint,
          })
        : await ensureBrowserLaunched({
            headless: args.headless,
            channel: args.channel,
            executablePath: args.executablePath,
            isolated: args.isolated,
            viewport: args.viewport,
          });
    context = await McpContext.from(browser);
    return context;
  }

  function registerTool(tool: ToolDefinition) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
      },
      async params => {
        const release = await toolMutex.acquire();
        try {
          const ctx = await getContext();
          const response = new McpResponse();
          await tool.handler({params}, response, ctx);

          // If the tool wants to include pages, update the snapshot
          if (response.getIncludePages()) {
            await ctx.createPagesSnapshot();
          }

          return response.toCallToolResult(
            ctx.getPages(),
            ctx.getSelectedPage(),
          ) as CallToolResult;
        } finally {
          release();
        }
      },
    );
  }

  const tools: ToolDefinition<any>[] = [...reactTools];
  for (const tool of tools) {
    registerTool(tool);
  }

  // Initialize browser/context immediately so Chrome launches without waiting
  // for the first tool call.
  await getContext();

  await server.connect(transport);
  logger(`React DevTools MCP server v${VERSION} connected`);
  console.error(
    'Warning: React DevTools MCP server inspects live pages. Avoid using on sensitive pages.',
  );
  // Keep process alive.
  setInterval(() => {}, 1 << 30);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
