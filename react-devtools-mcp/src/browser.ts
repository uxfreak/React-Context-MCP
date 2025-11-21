import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {logger} from './logger.js';
import {puppeteer, type Browser, type LaunchOptions} from './third_party/index.js';

export type Channel = 'stable' | 'canary' | 'beta' | 'dev';

let browser: Browser | undefined;

function makeTargetFilter() {
  const ignoredPrefixes = new Set([
    'chrome://',
    'chrome-extension://',
    'chrome-untrusted://',
  ]);

  return function targetFilter(target: {url(): string}) {
    const url = target.url();
    if (url === 'chrome://newtab/') {
      return true;
    }
    for (const prefix of ignoredPrefixes) {
      if (url.startsWith(prefix)) {
        return false;
      }
    }
    return true;
  };
}

export async function ensureBrowserConnected(options: {
  browserURL?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
}): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }

  const connectOptions: Parameters<typeof puppeteer.connect>[0] = {
    targetFilter: makeTargetFilter(),
    defaultViewport: null,
    handleDevToolsAsPage: true,
  };

  if (options.wsEndpoint) {
    connectOptions.browserWSEndpoint = options.wsEndpoint;
    if (options.wsHeaders) {
      connectOptions.headers = options.wsHeaders;
    }
  } else if (options.browserURL) {
    connectOptions.browserURL = options.browserURL;
  } else {
    throw new Error('Either browserURL or wsEndpoint must be provided');
  }

  logger('Connecting Puppeteer', JSON.stringify(connectOptions));
  browser = await puppeteer.connect(connectOptions);
  logger('Connected Puppeteer');
  return browser;
}

interface McpLaunchOptions {
  executablePath?: string;
  channel?: Channel;
  headless: boolean;
  isolated: boolean;
  viewport?: {width: number; height: number};
  args?: string[];
}

export async function launch(options: McpLaunchOptions): Promise<Browser> {
  const {channel, executablePath, headless, isolated} = options;
  const profileDirName =
    channel && channel !== 'stable'
      ? `chrome-profile-${channel}`
      : 'chrome-profile';

  let userDataDir: string | undefined;
  if (!isolated) {
    userDataDir = path.join(
      os.homedir(),
      '.cache',
      'react-devtools-mcp',
      profileDirName,
    );
    await fs.promises.mkdir(userDataDir, {recursive: true});
  }

  const args: LaunchOptions['args'] = [
    ...(options.args ?? []),
    '--hide-crash-restore-bubble',
  ];
  if (headless) {
    args.push('--screen-info={1920x1080}');
  }

  logger(
    `Launching Chrome (headless=${headless}) profile=${userDataDir ?? '<tmp>'}`,
  );
  const b = await puppeteer.launch({
    channel: channel && channel !== 'stable' ? (`chrome-${channel}` as any) : 'chrome',
    targetFilter: makeTargetFilter(),
    executablePath,
    defaultViewport: null,
    userDataDir,
    pipe: false,
    headless,
    args,
    handleDevToolsAsPage: true,
  });

  if (options.viewport) {
    const [page] = await b.pages();
    // @ts-expect-error Puppeteer internal API for resize
    await page?.resize({
      contentWidth: options.viewport.width,
      contentHeight: options.viewport.height,
    });
  }

  return b;
}

export async function ensureBrowserLaunched(
  options: McpLaunchOptions,
): Promise<Browser> {
  if (browser?.connected) {
    return browser;
  }
  browser = await launch(options);
  return browser;
}
