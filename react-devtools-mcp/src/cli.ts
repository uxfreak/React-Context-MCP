import {hideBin, yargs} from './third_party/index.js';
import type {Channel} from './browser.js';

export interface Args {
  headless: boolean;
  browserUrl?: string;
  wsEndpoint?: string;
  wsHeaders?: Record<string, string>;
  executablePath?: string;
  channel?: Channel;
  isolated: boolean;
  viewport?: {width: number; height: number};
}

export function parseArguments() {
  const argv = yargs(hideBin(process.argv))
    .option('headless', {
      type: 'boolean',
      default: true,
      describe: 'Run Chrome in headless mode',
    })
    .option('browserUrl', {
      type: 'string',
      describe: 'Chrome remote debugging browserURL to connect to',
    })
    .option('wsEndpoint', {
      type: 'string',
      describe: 'Chrome remote debugging websocket endpoint to connect to',
    })
    .option('executablePath', {
      type: 'string',
      describe: 'Path to Chrome executable',
    })
    .option('channel', {
      type: 'string',
      choices: ['stable', 'canary', 'beta', 'dev'],
      describe: 'Chrome release channel',
    })
    .option('isolated', {
      type: 'boolean',
      default: false,
      describe: 'Use isolated user-data-dir per launch',
    })
    .option('viewport', {
      type: 'string',
      describe: 'Viewport as WIDTHxHEIGHT, e.g. 1280x720',
    })
    .help()
    .parseSync();

  const parsed: Args = {
    headless: argv.headless,
    browserUrl: argv.browserUrl,
    wsEndpoint: argv.wsEndpoint,
    executablePath: argv.executablePath,
    channel: argv.channel as Channel,
    isolated: argv.isolated,
  };

  if (argv.viewport) {
    const match = /^(\d+)x(\d+)$/.exec(argv.viewport);
    if (match) {
      parsed.viewport = {
        width: Number(match[1]),
        height: Number(match[2]),
      };
    }
  }

  return parsed;
}
