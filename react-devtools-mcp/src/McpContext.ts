import type {Browser, Page} from './third_party/index.js';
import {logger} from './logger.js';
import {ReactSession} from './ReactSession.js';
import type {ReactAttachResult, ReactRootInfo} from './tools/ToolDefinition.js';

export class McpContext {
  #browser: Browser;
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
    const pages = await this.#browser.pages();
    if (pages.length > 0) {
      this.#selectedPage = pages[0];
    } else {
      this.#selectedPage = await this.#browser.newPage();
    }
    const targetUrl = process.env.TARGET_URL;
    if (targetUrl) {
      // Install the backend hook before the app loads React.
      await this.ensureReactAttached().catch(error =>
        logger(`Preload React hook failed: ${String(error)}`),
      );
      logger(`Navigating to ${targetUrl}`);
      await this.#selectedPage.goto(targetUrl, {waitUntil: 'domcontentloaded'});
    }
  }

  getSelectedPage(): Page {
    if (!this.#selectedPage) {
      throw new Error('No active page');
    }
    return this.#selectedPage;
  }

  selectPage(page: Page) {
    this.#selectedPage = page;
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
