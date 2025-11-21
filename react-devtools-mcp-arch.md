# React DevTools MCP server — implementation blueprint

This doc maps the Chrome DevTools MCP architecture to a new MCP server that exposes React DevTools capabilities against a live Chrome instance.

## Goals
- Keep the server contract identical to other MCP servers (stdio transport, `@modelcontextprotocol/sdk`, zod schemas).
- Reuse the Chrome DevTools MCP shell for browser lifecycle, logging, mutex-guarded tool execution, and response formatting.
- Add a React-aware context that injects the React DevTools backend into target pages, exposes a bridge, collects component trees, enables highlighting, and supports profiling.

## High-level architecture
1) **Server entry (`main.ts`)**
   - Parse CLI flags (browser launch/connect + React-specific flags).
   - Ensure a Chrome connection (`ensureBrowserLaunched/Connected`), create a `ReactMcpContext`.
   - Register React tools (list roots/components, inspect, highlight, update, profiler) using the same `ToolDefinition` pattern as Chrome MCP.
   - Serialize tool calls via a `Mutex`; emit logs and disclaimers.

2) **Browser lifecycle (`browser.ts`)** — copied/adapted from `chrome-devtools-mcp/src/browser.ts`
   - Launch or attach via Puppeteer with target filtering (ignore `chrome://`, extensions).
   - Allow `wsEndpoint/browserURL` attach, headless, channel selection, viewport sizing, proxy, isolated profile dirs.
   - Expose `Channel` type and `ensureBrowserLaunched/Connected`.

3) **React context (`ReactMcpContext`)**
   - Wraps a Puppeteer `Browser`.
   - Tracks pages, selected page, dialogs, snapshots (reuse `WaitForHelper`, `PageCollector`, `snapshot` from Chrome MCP).
   - Manages per-page React sessions (see below).
   - Exposes helpers to tools: resolve DOM node by uid, list/inspect React components, highlight, profiler control.

4) **React bridge/session (`ReactDevToolsBridge`)**
   - On first use per page:
     - Inject `__REACT_DEVTOOLS_GLOBAL_HOOK__` if absent (load `react-devtools-inline/backend` bundle via `page.addInitScript`/`addScriptTag`).
     - Create a custom “wall” that moves messages between Node and the page:
       - In page: `window.__REACT_DEVTOOLS_MCP_SEND = payload => window.postMessage(payload, '*')`.
       - In Node: `page.exposeFunction('__REACT_DEVTOOLS_MCP_RECEIVE', fn)` and `page.on('console')`/`page.on('pageerror')` as needed.
       - Use `page.evaluate` to wire `window.addEventListener('message', ...)` to call the exposed receive.
     - Instantiate backend bridge in page (`react-devtools-inline/backend.createBridge`) pointing at the wall.
     - In Node, instantiate frontend bridge (`react-devtools-shared/src/bridge`) + store (`react-devtools-shared/src/devtools/store`).
     - Activate backend (`activate(contentWindow, {bridge})`) so the renderer hook emits tree events.
   - Cache session per page; revalidate on navigation.
   - API surface for tools:
     - `ensureAttached()`: returns renderer info/version, whether React is present.
     - `listRoots()`: root IDs/display names.
     - `getComponent(id)`: props/state/hooks/owner path.
     - `findComponents({name?, text?, propMatch?})`.
     - `selectByDom(backendNodeId|uid)`: map DOM node → fiber → component.
     - `highlight(id)`: use overlay from `react-devtools-shared` (inline frontend overlay helpers).
     - Profiler: `start()`, `stop()`, `getResult()` (exported profile JSON/flamechart summary).

5) **Tools (initial set)**
   - `ensure_react_attached`: inject backend if needed, return renderer list (id, version, bundleType).
   - `list_react_roots`: ids + display names; optional renderer filter.
   - `list_components`: paginated tree walk (rootId, depth limit, name filter).
   - `get_component`: detailed inspect (props/state/hooks/owners, source info).
   - `find_components`: by displayName, regex on text, or prop match.
   - `select_component_by_dom`: uses text snapshot UID/backendNodeId to find fiber.
   - `highlight_component`: overlays fiber on the page.
   - Profiler trio: `start_profiler`, `stop_profiler`, `get_profiler_result`.
   - Optional mutations: `update_props`, `update_state`, `trigger_rerender`, `toggle_trace_updates` (if supported by renderer).

6) **Response formatting**
   - Reuse `McpResponse` helpers from Chrome MCP: pages list, network/console inclusion, snapshot attachments, text/JSON payloads, image for highlights (overlay screenshot).
   - Standardize output size limits and friendly messages when React isn’t present on the page.

## Key React code references (already fetched under `react/`)
- `packages/react-devtools-inline/src/backend.js` — backend injection, bridge wiring.
- `packages/react-devtools-inline/README.md` — embedding guide and wall customization.
- `packages/react-devtools-shared/src/bridge` — bridge implementation used on both ends.
- `packages/react-devtools-shared/src/devtools/store/store.js` — component tree store (selectors, profiling).
- `packages/react-devtools-shared/src/backend/renderer.js` — renderer hooks/fiber access.
- Overlay/highlight utilities in `react-devtools-shared/src/frontend` (used by inline frontend).

## Implementation roadmap
1) **Scaffold package**
   - New `react-devtools-mcp/` package with `tsconfig`, `package.json`, scripts `build`, `start`, `typecheck`.
   - Dependencies: `@modelcontextprotocol/sdk`, `puppeteer-core`, `zod`, `debug`, `react-devtools-inline`, `react-devtools-shared`, `core-js` polyfills (match Chrome MCP).

2) **Port shared infra**
   - Copy/adapt: `browser.ts`, `Mutex.ts`, `logger.ts`, `WaitForHelper.ts`, `McpResponse.ts`, `tools/ToolDefinition.ts`, `formatters`, `third_party/index.ts`.

3) **React bridge**
   - Implement `ReactDevToolsBridge` (wall + backend inject + store creation).
   - Handle reinjection: no-op if hook already present; reset session on navigation.
   - Timeouts and size caps on tree payloads.

4) **Context**
   - `ReactMcpContext.from(browser, logger, opts)` mirroring Chrome MCP init but wiring React sessions per page.
   - Expose helpers consumed by tools (tree, inspect, highlight, profiler).

5) **Tools (v0)**
   - Implement `ensure_react_attached`, `list_react_roots`, `get_component`, `highlight_component`.
   - Wire registration in `main.ts`; add `--headless`, `--channel`, `--browserUrl/wsEndpoint`, `--react-backend-path`, `--react-no-inject` flags.

6) **Profiler + mutations (v1)**
   - Add profiler tools and safe mutation tools (props/state overrides) gated by a flag.

7) **Testing**
   - Add a sample React app fixture and an integration script that launches Chrome via Puppeteer, runs tools, asserts non-empty roots and component inspection works.

## Notes/risks
- The React DevTools inline packages are on experimental channels; pin versions and surface a clear disclaimer.
- Cross-origin pages: React hook injection won’t work; tools should return a friendly error.
- Payload size: cap component tree depth/width; prefer paginated responses for large apps.
- Highlight overlay: ensure cleanup between calls; avoid leaking injected CSS/DOM.

## Next actionable steps (if we proceed)
1) Create `react-devtools-mcp/` package scaffold with shared infra copied from Chrome MCP.
2) Implement `ReactDevToolsBridge` (injection + wall + store) and `ReactMcpContext`.
3) Ship initial tool set (`ensure_react_attached`, `list_react_roots`, `get_component`, `highlight_component`) and an integration test against a sample React page.
