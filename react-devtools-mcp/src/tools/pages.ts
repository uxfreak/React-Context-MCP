import {zod} from '../third_party/index.js';

import {CLOSE_PAGE_ERROR, defineTool, timeoutSchema} from './ToolDefinition.js';

export const listPages = defineTool({
  name: 'list_pages',
  description: 'Get a list of pages open in the browser.',
  schema: {},
  handler: async (_request, response) => {
    response.setIncludePages(true);
  },
});

export const selectPage = defineTool({
  name: 'select_page',
  description: 'Select a page as a context for future tool calls.',
  schema: {
    pageIdx: zod
      .number()
      .describe(
        'The index of the page to select. Call list_pages to list pages.',
      ),
  },
  handler: async (request, response, context) => {
    const page = context.getPageByIdx(request.params.pageIdx);
    await page.bringToFront();
    context.selectPage(page);
    response.setIncludePages(true);
  },
});

export const closePage = defineTool({
  name: 'close_page',
  description: 'Closes the page by its index. The last open page cannot be closed.',
  schema: {
    pageIdx: zod
      .number()
      .describe(
        'The index of the page to close. Call list_pages to list pages.',
      ),
  },
  handler: async (request, response, context) => {
    try {
      await context.closePage(request.params.pageIdx);
    } catch (err) {
      const error = err as Error;
      if (error.message === CLOSE_PAGE_ERROR) {
        response.appendResponseLine(error.message);
      } else {
        throw err;
      }
    }
    response.setIncludePages(true);
  },
});

export const newPage = defineTool({
  name: 'new_page',
  description: 'Creates a new page',
  schema: {
    url: zod.string().describe('URL to load in a new page.'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = await context.newPage();

    await page.goto(request.params.url, {
      timeout: request.params.timeout,
      waitUntil: 'domcontentloaded',
    });

    response.setIncludePages(true);
  },
});

export const navigatePage = defineTool({
  name: 'navigate_page',
  description: 'Navigates the currently selected page to a URL.',
  schema: {
    type: zod
      .enum(['url', 'back', 'forward', 'reload'])
      .optional()
      .describe(
        'Navigate the page by URL, back or forward in history, or reload.',
      ),
    url: zod.string().optional().describe('Target URL (only type=url)'),
    ignoreCache: zod
      .boolean()
      .optional()
      .describe('Whether to ignore cache on reload.'),
    ...timeoutSchema,
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const options = {
      timeout: request.params.timeout,
      waitUntil: 'domcontentloaded' as const,
    };

    if (!request.params.type && !request.params.url) {
      throw new Error('Either URL or a type is required.');
    }

    if (!request.params.type) {
      request.params.type = 'url';
    }

    switch (request.params.type) {
      case 'url':
        if (!request.params.url) {
          throw new Error('A URL is required for navigation of type=url.');
        }
        try {
          await page.goto(request.params.url, options);
          response.appendResponseLine(
            `Successfully navigated to ${request.params.url}.`,
          );
        } catch (err) {
          const error = err as Error;
          response.appendResponseLine(
            `Unable to navigate in the selected page: ${error.message}.`,
          );
        }
        break;
      case 'back':
        try {
          await page.goBack(options);
          response.appendResponseLine(
            `Successfully navigated back to ${page.url()}.`,
          );
        } catch (err) {
          const error = err as Error;
          response.appendResponseLine(
            `Unable to navigate back in the selected page: ${error.message}.`,
          );
        }
        break;
      case 'forward':
        try {
          await page.goForward(options);
          response.appendResponseLine(
            `Successfully navigated forward to ${page.url()}.`,
          );
        } catch (err) {
          const error = err as Error;
          response.appendResponseLine(
            `Unable to navigate forward in the selected page: ${error.message}.`,
          );
        }
        break;
      case 'reload':
        try {
          await page.reload({
            ...options,
            ignoreCache: request.params.ignoreCache,
          });
          response.appendResponseLine('Successfully reloaded the page.');
        } catch (err) {
          const error = err as Error;
          response.appendResponseLine(
            `Unable to reload the selected page: ${error.message}.`,
          );
        }
        break;
    }

    response.setIncludePages(true);
  },
});
