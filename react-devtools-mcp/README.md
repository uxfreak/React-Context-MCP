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

## Requirements for Source Location Tracking

For the `get_react_component_from_snapshot` tool to extract source file locations (React 19+ compatible), your React application needs the Babel plugin that adds `data-inspector-*` attributes:

### Vite

Add to `vite.config.ts`:
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@babel/plugin-transform-react-jsx-development', {
            // Adds data-inspector-line, data-inspector-column, etc.
          }]
        ]
      }
    })
  ]
})
```

### Webpack / Create React App

The plugin is automatically included in development mode. No additional configuration needed.

### Next.js

Next.js includes this by default in development mode.

### Manual Babel Config

Add to `.babelrc` or `babel.config.js`:
```json
{
  "env": {
    "development": {
      "plugins": ["@babel/plugin-transform-react-jsx-development"]
    }
  }
}
```

**Note:** Source location tracking only works in development builds. Production builds strip this metadata for performance.

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

Capture accessibility tree snapshot to find text and UI elements on the page.

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
      "text": "{\n  \"root\": {\n    \"role\": \"RootWebArea\",\n    \"name\": \"My App\",\n    \"uid\": \"1763797635548_0\",\n    \"children\": [\n      {\n        \"role\": \"button\",\n        \"name\": \"Sign up\",\n        \"uid\": \"1763797635548_38\"\n      },\n      {\n        \"role\": \"button\",\n        \"name\": \"Log in\",\n        \"uid\": \"1763797635548_46\"\n      }\n    ]\n  },\n  \"snapshotId\": \"1763797635548\"\n}"
    }]
  }
}
```

### 8. `get_react_component_from_snapshot`

**NEW!** Get complete React component information for an element found in the snapshot. Returns component name, type, props, state, source location, and owner hierarchy.

**Arguments:**
- `role` (string) - Element role from snapshot (e.g., "button", "heading", "paragraph")
- `name` (string) - Element name/text from snapshot (e.g., "Sign up", "Log in")

**Example:**
```json
{"jsonrpc":"2.0","id":"7","method":"tools/call","params":{"name":"get_react_component_from_snapshot","arguments":{"role":"button","name":"Sign up"}}}
```

**Response:**
```json
{
  "result": {
    "content": [{
      "type": "text",
      "text": "{\n  \"success\": true,\n  \"component\": {\n    \"name\": \"Button\",\n    \"type\": \"ForwardRef\",\n    \"props\": {\n      \"variant\": \"primary\",\n      \"size\": \"large\",\n      \"onClick\": {},\n      \"children\": \"Sign up\"\n    },\n    \"state\": {...},\n    \"source\": {\n      \"fileName\": \"src/design-system/components/organisms/OnboardingScreen/OnboardingScreen.tsx\",\n      \"lineNumber\": 361,\n      \"columnNumber\": 10\n    },\n    \"owners\": [\n      {\"name\": \"Box\", \"type\": \"ForwardRef\", \"source\": {...}},\n      {\"name\": \"OnboardingScreen\", \"type\": \"FunctionComponent\", \"source\": {...}},\n      {\"name\": \"OnboardingPage\", \"type\": \"FunctionComponent\", \"source\": {...}}\n    ]\n  }\n}"
    }]
  }
}
```

## Common Workflows

### Finding Source Location of Text on Page

This workflow demonstrates how to find any visible text (e.g., "Sign up") and trace it back to the React component and source file.

**Step 1: Take a snapshot to find the text**
```bash
cat <<'EOF' > find-text.jsonl
{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"take_snapshot","arguments":{"verbose":true}}}
EOF

(cat find-text.jsonl; sleep 10) | TARGET_URL=http://localhost:3000 node build/src/main.js --isolated --headless
```

**Step 2: Search the snapshot JSON for your text**

Look for nodes with your target text in the `name` field:
```json
{
  "role": "button",
  "name": "Sign up",
  "uid": "1763797635548_38"
}
```

Note the `role` ("button") and `name` ("Sign up") values.

**Step 3: Get React component information**
```bash
cat <<'EOF' > get-component.jsonl
{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"get_react_component_from_snapshot","arguments":{"role":"button","name":"Sign up"}}}
EOF

(cat get-component.jsonl; sleep 10) | TARGET_URL=http://localhost:3000 node build/src/main.js --isolated --headless
```

**Result: Complete component information**
```json
{
  "success": true,
  "component": {
    "name": "Button",
    "type": "ForwardRef",
    "source": {
      "fileName": "src/design-system/components/organisms/OnboardingScreen/OnboardingScreen.tsx",
      "lineNumber": 361,
      "columnNumber": 10
    },
    "props": {"variant": "primary", "size": "large", "children": "Sign up"},
    "owners": [
      {"name": "OnboardingScreen", "source": "src/pages/OnboardingPage.tsx:136"},
      {"name": "OnboardingPage", "source": "src/App.tsx:102"}
    ]
  }
}
```

Now you know:
- ✅ Component name: `Button` (ForwardRef)
- ✅ Source file: `OnboardingScreen.tsx` line 361
- ✅ Props: `variant="primary" size="large"`
- ✅ Parent components: `OnboardingScreen` → `OnboardingPage` → `App`

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

### Source Location Extraction (React 19 Compatible)

Source information is extracted from `data-inspector-*` attributes added by Babel:
- `data-inspector-relative-path` - Source file path
- `data-inspector-line` - Line number
- `data-inspector-column` - Column number

**Why not `_debugSource`?** React 19 disabled the `_debugSource` and `_debugOwner` fiber properties for performance. This server uses the Babel plugin approach which is more reliable and future-proof.

**Component Hierarchy:** The owners chain is built by walking up the fiber tree using `fiber.return` pointers, collecting all authored components (FunctionComponent, ClassComponent, ForwardRef, MemoComponent) along the way.

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

- [x] Map accessibility tree to React components (`get_react_component_from_snapshot`)
- [x] Get component source from text/UI elements
- [ ] Support for multiple React roots
- [ ] Component state editing
- [ ] Props diffing between renders
- [ ] Performance profiling integration
- [ ] Click-to-inspect UI element → get React component

## License

Apache-2.0
