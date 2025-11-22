# React DevTools MCP Server

MCP server that exposes React DevTools capabilities for inspecting React applications via the Model Context Protocol.

## Features

- **React Backend Injection** - Automatically injects React DevTools backend hook into pages
- **Component Tree Inspection** - List and inspect React fiber tree with props, state, and source locations
- **Accessibility Tree Snapshot** - Capture page structure with text content for finding UI elements
- **Component Highlighting** - Visual highlighting of React components in the browser

## Installation

```bash
npm install
npm run build
```

## Usage

### Starting the Server

```bash
# With a target URL (auto-navigates on startup)
TARGET_URL=http://localhost:3000 node build/src/main.js

# Connect to existing Chrome instance
node build/src/main.js --browserUrl http://localhost:9222

# Isolated mode (separate Chrome profile)
node build/src/main.js --isolated --headless
```

### Command-line Options

- `--headless` - Run Chrome in headless mode (default: true)
- `--isolated` - Use isolated user data directory (avoids profile conflicts)
- `--browserUrl <url>` - Connect to existing Chrome debugging session
- `--wsEndpoint <url>` - WebSocket endpoint for Chrome DevTools Protocol
- `--executablePath <path>` - Path to Chrome executable
- `--channel <channel>` - Chrome release channel (stable, canary, beta, dev)
- `--viewport <WxH>` - Set viewport size (e.g., 1280x720)

## MCP Tools

### 1. `ensure_react_attached`

Injects React DevTools backend and detects renderers.

**Example:**
```json
{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"ensure_react_attached","arguments":{}}}
```

**Response:**
```json
{
  "result": {
    "content": [{
      "type": "text",
      "text": "React DevTools backend is installed.\nRenderers:\n- id=1 name=react-dom version=18.2.0 bundleType=1"
    }]
  }
}
```

### 2. `list_react_roots`

Lists all React roots on the page.

**Example:**
```json
{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"list_react_roots","arguments":{}}}
```

**Response:**
```json
{
  "result": {
    "content": [{
      "type": "text",
      "text": "renderer=1(react-dom) root=1:0 idx=0 name=Unknown nodes=103"
    }]
  }
}
```

### 3. `list_components`

Lists React component tree with filtering options.

**Arguments:**
- `rendererId` (optional) - Filter by renderer ID
- `rootIndex` (optional) - Filter by root index
- `depth` (number, default: 100) - Maximum traversal depth
- `maxNodes` (number, default: 10000) - Maximum nodes to return
- `nameFilter` (string, optional) - Substring match on component name
- `includeTypes` (array, optional) - Filter by component types. If not provided, shows only authored components (FunctionComponent, ClassComponent, etc.). Pass `[]` for all types including DOM elements.

**Example (authored components only):**
```json
{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"list_components","arguments":{"depth":5}}}
```

**Example (all including DOM):**
```json
{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"list_components","arguments":{"depth":100,"maxNodes":10000,"includeTypes":[]}}}
```

**Response:**
```json
{
  "result": {
    "content": [{
      "type": "text",
      "text": "1:0:0.0.0 depth=2 type=FunctionComponent name=App key=null\n1:0:0.0.0.0 depth=3 type=FunctionComponent name=PaddingProvider key=null"
    }]
  }
}
```

### 4. `list_function_components`

Convenience tool to list only FunctionComponent nodes.

**Arguments:**
- `rendererId` (optional)
- `rootIndex` (optional)
- `depth` (number, default: 100)
- `maxNodes` (number, default: 10000)

### 5. `get_component`

Inspect detailed component information by ID.

**Arguments:**
- `id` (string) - Component ID from `list_components`

**Example:**
```json
{"jsonrpc":"2.0","id":"4","method":"tools/call","params":{"name":"get_component","arguments":{"id":"1:0:0.0.0"}}}
```

**Response:**
```json
{
  "result": {
    "content": [{
      "type": "text",
      "text": "{\n  \"id\": \"1:0:0.0.0\",\n  \"name\": \"App\",\n  \"type\": \"Tag0\",\n  \"props\": {...},\n  \"state\": null,\n  \"source\": {\n    \"fileName\": \"src/App.tsx\",\n    \"lineNumber\": 42,\n    \"columnNumber\": 4\n  },\n  \"owners\": [{\"name\": \"Root\"}]\n}"
    }]
  }
}
```

### 6. `highlight_component`

Visually highlight a component in the browser.

**Arguments:**
- `id` (string) - Component ID from `list_components`

**Example:**
```json
{"jsonrpc":"2.0","id":"5","method":"tools/call","params":{"name":"highlight_component","arguments":{"id":"1:0:0.0.0"}}}
```

### 7. `take_snapshot`

**NEW!** Capture accessibility tree snapshot to find text and UI elements.

**Arguments:**
- `verbose` (boolean, optional, default: false) - Include all elements or only "interesting" ones

**Example:**
```json
{"jsonrpc":"2.0","id":"6","method":"tools/call","params":{"name":"take_snapshot","arguments":{"verbose":true}}}
```

**Response:**
```json
{
  "result": {
    "content": [{
      "type": "text",
      "text": "{\n  \"root\": {\n    \"role\": \"RootWebArea\",\n    \"name\": \"My App\",\n    \"uid\": \"1763797635548_0\",\n    \"children\": [\n      {\n        \"role\": \"button\",\n        \"name\": \"Log in\",\n        \"uid\": \"1763797635548_46\"\n      }\n    ]\n  },\n  \"snapshotId\": \"1763797635548\"\n}"
    }]
  }
}
```

## Common Workflows

### Finding Text on Page (e.g., "log in")

**Step 1: Take a snapshot**
```bash
echo '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"take_snapshot","arguments":{"verbose":true}}}' | \
TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless
```

**Step 2: Search the snapshot JSON for your text**

Look for nodes with `"name": "Log in"`:
```json
{
  "role": "button",
  "name": "Log in",
  "uid": "1763797635548_46",
  "children": [...]
}
```

**Step 3: Find the React component (coming soon)**

The next step is to map the DOM element (via UID) back to its React component to get source location.

### Testing via JSON-RPC

Create a test file with your commands:

```bash
cat <<'EOF' > test-commands.jsonl
{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"ensure_react_attached","arguments":{}}}
{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"list_react_roots","arguments":{}}}
{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"list_components","arguments":{"depth":5}}}
{"jsonrpc":"2.0","id":"4","method":"tools/call","params":{"name":"take_snapshot","arguments":{"verbose":true}}}
EOF

(cat test-commands.jsonl; sleep 15) | TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless
```

## Component ID Format

Component IDs use the format: `{rendererId}:{rootIndex}:{path}`

- **rendererId**: React renderer ID (usually 1 for react-dom)
- **rootIndex**: Index of the React root (usually 0)
- **path**: Dot-separated child indices (e.g., `0.2.1` means first child → third child → second child)

Example: `1:0:0.2.1`

## How It Works

### React Backend Injection

On page load, the server:
1. Injects a custom React DevTools global hook
2. Intercepts `renderer.inject()` calls when React initializes
3. Captures fiber roots via `onCommitFiberRoot` hook
4. Stores fiber tree for inspection

### Component Tree Traversal

The server walks the React fiber tree depth-first:
- Starts from `root.current` fiber node
- Traverses via `fiber.child` and `fiber.sibling` pointers
- Generates stable path-based IDs for each component
- Extracts props, state, source info from fiber properties

### Source Location Extraction

Source information comes from (in priority order):
1. React Inspector attributes (`data-inspector-line`, etc.)
2. Fiber `_debugSource` / `_debugInfo` properties
3. Stack trace parsing (fallback)

### Accessibility Tree Snapshot

The new `take_snapshot` tool:
1. Calls Puppeteer's `page.accessibility.snapshot()` API
2. Generates unique UIDs for each node
3. Returns hierarchical tree with roles, names, and text content
4. Enables finding any visible text on the page

## Environment Variables

- `TARGET_URL` - URL to navigate to on startup

## Development

```bash
# Type checking
npm run typecheck

# Build
npm run build

# Clean build artifacts
npm run clean
```

## Troubleshooting

### "The browser is already running"

Use `--isolated` flag to create a separate Chrome profile:
```bash
node build/src/main.js --isolated
```

### No React renderers detected

- Ensure React is loaded on the page
- The page might be using a React build that doesn't expose the DevTools hook
- Try refreshing the page after the backend is injected

### Component source location not available

- Requires React Inspector metadata or debug builds
- Production builds may strip source information
- Use `data-inspector-*` attributes in development

## Future Enhancements

- [ ] Map accessibility tree UIDs to React components
- [ ] Get component source from DOM element selection
- [ ] Support for multiple React roots
- [ ] Component state editing
- [ ] Props diffing between renders
- [ ] Performance profiling integration

## License

Apache-2.0
