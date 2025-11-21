import {debug, type Debugger} from './third_party/index.js';

const LOG_NAMESPACE = 'react-devtools-mcp';

const log: Debugger = debug(LOG_NAMESPACE);

export {log as logger, type Debugger};
