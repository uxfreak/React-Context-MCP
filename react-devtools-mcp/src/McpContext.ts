import type {Browser, Page} from './third_party/index.js';
import {logger} from './logger.js';
import {ReactSession} from './ReactSession.js';
import type {ReactAttachResult, ReactRootInfo} from './tools/ToolDefinition.js';

const CLOSE_PAGE_ERROR = 'Cannot close the last open page';

export class McpContext {
  #browser: Browser;
  #pages: Page[] = [];
  #selectedPage?: Page;
  #reactSessions = new WeakMap<Page, ReactSession>();

  private constructor(browser: Browser) {
    this.#browser = browser;
  }

  static async from(browser: Browser) {
    const ctx = new McpContext(browser);
    await ctx.#init();
    return ctx;
  }

  async #init() {
    await this.createPagesSnapshot();
    const targetUrl = process.env.TARGET_URL;
    if (targetUrl) {
      // Install the backend hook before the app loads React.
      await this.ensureReactAttached().catch(error =>
        logger(`Preload React hook failed: ${String(error)}`),
      );
      logger(`Navigating to ${targetUrl}`);
      await this.#selectedPage!.goto(targetUrl, {waitUntil: 'domcontentloaded'});
    }
  }

  async createPagesSnapshot(): Promise<Page[]> {
    const allPages = await this.#browser.pages();

    // Filter out devtools:// pages
    this.#pages = allPages.filter(page => {
      return !page.url().startsWith('devtools://');
    });

    if (!this.#selectedPage || this.#pages.indexOf(this.#selectedPage) === -1) {
      if (this.#pages.length > 0) {
        // Prefer a page that's not about:blank
        const nonBlankPage = this.#pages.find(page => page.url() !== 'about:blank');
        this.selectPage(nonBlankPage || this.#pages[0]);
      } else {
        const newPage = await this.#browser.newPage();
        this.#pages.push(newPage);
        this.selectPage(newPage);
      }
    }

    return this.#pages;
  }

  getSelectedPage(): Page {
    if (!this.#selectedPage) {
      throw new Error('No page selected');
    }
    if (this.#selectedPage.isClosed()) {
      throw new Error('The selected page has been closed. Call list_pages to see open pages.');
    }
    return this.#selectedPage;
  }

  selectPage(page: Page) {
    this.#selectedPage = page;
  }

  getPages(): Page[] {
    return this.#pages;
  }

  getPageByIdx(idx: number): Page {
    const page = this.#pages[idx];
    if (!page) {
      throw new Error('No page found');
    }
    return page;
  }

  async closePage(pageIdx: number): Promise<void> {
    if (this.#pages.length === 1) {
      throw new Error(CLOSE_PAGE_ERROR);
    }
    const page = this.getPageByIdx(pageIdx);
    await page.close({runBeforeUnload: false});
  }

  async newPage(): Promise<Page> {
    const page = await this.#browser.newPage();
    await this.createPagesSnapshot();
    this.selectPage(page);
    return page;
  }

  #getReactSession(page: Page): ReactSession {
    let session = this.#reactSessions.get(page);
    if (!session) {
      session = new ReactSession(page);
      this.#reactSessions.set(page, session);
    }
    return session;
  }

  async ensureReactAttached(): Promise<ReactAttachResult> {
    const page = this.getSelectedPage();
    logger('ensureReactAttached on selected page');
    return this.#getReactSession(page).attach();
  }

  async listReactRoots(): Promise<ReactRootInfo[]> {
    const page = this.getSelectedPage();
    logger('listReactRoots on selected page');
    return this.#getReactSession(page).listRoots();
  }

  async listComponents(_: {
    rendererId?: number;
    rootIndex?: number;
    depth?: number;
    maxNodes?: number;
    nameFilter?: string;
  }) {
    // Placeholder until full bridge is implemented.
    return [];
  }

  async getComponentById(_id: string) {
    // Placeholder until full bridge is implemented.
    return null;
  }

  async highlightComponent(_id: string) {
    // Placeholder until full bridge is implemented.
    return {ok: false, message: 'Highlight not implemented yet'};
  }

  async takeSnapshot(verbose = false) {
    const page = this.getSelectedPage();
    logger('takeSnapshot on selected page');
    return this.#getReactSession(page).takeSnapshot(verbose);
  }
}
