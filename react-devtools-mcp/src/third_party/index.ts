/**
 * Minimal re-exports to keep imports tidy.
 */
import 'core-js/modules/es.promise.with-resolvers.js';
import 'core-js/proposals/iterator-helpers.js';

export {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
export {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
export {
  type CallToolResult,
  type ImageContent,
  type TextContent,
} from '@modelcontextprotocol/sdk/types.js';
export {z as zod} from 'zod';
export {default as debug} from 'debug';
export type {Debugger} from 'debug';
export {default as yargs} from 'yargs';
export {hideBin} from 'yargs/helpers';
export {default as puppeteer} from 'puppeteer-core';
export type {
  Browser,
  LaunchOptions,
  Page,
  Target,
  ElementHandle,
  HTTPRequest,
} from 'puppeteer-core';
