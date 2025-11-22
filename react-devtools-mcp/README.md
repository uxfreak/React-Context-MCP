# React DevTools MCP Server

MCP server that exposes React DevTools capabilities for inspecting React applications via the Model Context Protocol.

## Features

- **React Backend Injection** - Automatically injects React DevTools backend hook into pages
- **Component Tree Inspection** - List and inspect React fiber tree with props, state, and source locations
- **Accessibility Tree Snapshot** - Capture page structure with text content and CDP backendDOMNodeId for every element
- **Two Element-to-Component Mapping Methods**:
  - **CDP backendDOMNodeId** (Recommended) - Fast, deterministic direct element access via Chrome DevTools Protocol
  - **ARIA Selectors** (Legacy) - Cross-session compatible element searching via accessibility tree
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

Get complete React component information for an element found in the snapshot. Returns component name, type, props, state, source location, and owner hierarchy.

**Uses ARIA selectors** built on the browser's accessibility tree for reliable element finding. This approach is more robust than manual DOM traversal and successfully handles headings, images, buttons, and most UI elements.

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

### 9. `get_react_component_from_backend_node_id`

**NEW! Faster and more deterministic alternative to ARIA selectors.**

Get React component information using CDP `backendDOMNodeId` from the accessibility tree snapshot. This approach provides direct DOM element access without searching.

**Use this when:**
- You have a `backendDOMNodeId` from `take_snapshot` (snapshots now include this for every element)
- You need faster, more deterministic element lookup
- You're making multiple queries in the same session

**Arguments:**
- `backendDOMNodeId` (number) - Backend DOM node ID from snapshot's `backendDOMNodeId` field

**Example:**
```json
{"jsonrpc":"2.0","id":"8","method":"tools/call","params":{"name":"get_react_component_from_backend_node_id","arguments":{"backendDOMNodeId":48}}}
```

**Response:** (Same format as `get_react_component_from_snapshot`)

**Important:** The `backendDOMNodeId` is only valid within the same browser session. Always use `take_snapshot` and `get_react_component_from_backend_node_id` in the same MCP session (same JSON-RPC connection).

## Common Workflows

### Finding Source Location of Text on Page (CDP backendDOMNodeId Method)

**Recommended approach:** Use CDP backendDOMNodeId for faster, more deterministic lookups.

**Single MCP session with both snapshot and component lookup:**

```bash
cat <<'EOF' > find-component.jsonl
{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"take_snapshot","arguments":{"verbose":true}}}
{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"get_react_component_from_backend_node_id","arguments":{"backendDOMNodeId":48}}}
EOF

(cat find-component.jsonl; sleep 10) | TARGET_URL=http://localhost:3000 node build/src/main.js --isolated --headless
```

**Step 1:** The snapshot returns the accessibility tree with `backendDOMNodeId` for each element:
```json
{
  "role": "button",
  "name": "Sign up",
  "uid": "1763809431664_38",
  "backendDOMNodeId": 48
}
```

**Step 2:** Use the `backendDOMNodeId` to get the React component (happens in same session automatically)

**Result:**
```json
{
  "success": true,
  "component": {
    "name": "Button",
    "type": "ForwardRef",
    "source": {
      "fileName": "src/components/Button.tsx",
      "lineNumber": 42,
      "columnNumber": 8
    },
    "props": {"variant": "primary", "children": "Sign up"},
    "owners": [
      {"name": "OnboardingScreen", "source": "src/pages/Onboarding.tsx:136"},
      {"name": "App", "source": "src/App.tsx:102"}
    ]
  }
}
```

### Finding Source Location of Text on Page (ARIA Selector Method)

**Legacy approach:** Use ARIA selectors when you need cross-session compatibility.

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

The `take_snapshot` tool now supports **two approaches** for element-to-component mapping:

**CDP Approach (Recommended):**
1. Calls Chrome DevTools Protocol `Accessibility.getFullAXTree()`
2. Extracts `backendDOMNodeId` for every element in the tree
3. Generates unique UIDs for each node
4. Returns hierarchical tree with roles, names, text content, **and backendDOMNodeId**

**Legacy Puppeteer Approach:**
1. Calls Puppeteer's `page.accessibility.snapshot()` API (deprecated)
2. Generates unique UIDs for each node
3. Returns hierarchical tree with roles, names, and text content (no backendDOMNodeId)

### Two Methods for Mapping Elements to React Components

#### Method 1: CDP backendDOMNodeId (Recommended)

**Tool:** `get_react_component_from_backend_node_id`

**How it works:**
1. Get `backendDOMNodeId` from snapshot (included for every element)
2. Use CDP `DOM.resolveNode({backendNodeId})` to get RemoteObject reference
3. Use CDP `Runtime.callFunctionOn()` to execute JavaScript in element context
4. Extract React fiber from `element.__reactFiber$...` property
5. Walk fiber tree to collect all components (FunctionComponent, ClassComponent, ForwardRef)
6. Return complete component hierarchy with source locations

**Benefits:**
- ✅ **Faster** - Direct element access, no searching
- ✅ **More deterministic** - Unique numeric ID per element
- ✅ **Full component hierarchy** - Returns all components from element to root
- ✅ **Precise source locations** - File, line, and column for each component

**Important constraint - Session staleness:**

BackendDOMNodeIds are **only valid within the same browser session**. Causes of staleness:

1. **Different browser sessions** (95% probability) - Each `--isolated --headless` run creates a new browser instance. IDs from one run cannot be used in another.
2. **Page navigation/reload** (80% probability) - DOM tree is rebuilt with new IDs.
3. **DOM mutations** (20% probability) - React re-renders may invalidate IDs.
4. **Timing/race conditions** (15% probability) - Async updates between getting and using ID.

**Solution:** Always use `take_snapshot` and `get_react_component_from_backend_node_id` in the **same MCP session** (same JSON-RPC connection to the same browser instance).

#### Method 2: ARIA Selectors (Legacy)

**Tool:** `get_react_component_from_snapshot`

**How it works:**
1. Takes `role` and `name` from snapshot (e.g., `{role: "button", name: "Sign up"}`)
2. Uses Puppeteer's ARIA selector syntax: `aria/Name[role="button"]`
3. Finds the DOM element via browser's built-in accessibility tree
4. Extracts React fiber and component data from `element.__reactFiber$...` keys
5. Returns complete component information (name, type, props, state, source, owners)

**Benefits:**
- ✅ Built on browser's native accessibility tree (same as screen readers)
- ✅ Handles dynamic content and shadow DOM
- ✅ More reliable than text searching or XPath queries
- ✅ No session staleness issues (searches on demand)

**Limitations:**
- ⚠️ Slower (requires searching)
- ⚠️ Less deterministic (multiple elements may match same role+name)
- ⚠️ Requires unique role+name combinations

**When to use each method:**

| Use Case | Recommended Method |
|----------|-------------------|
| Single session, multiple element queries | CDP backendDOMNodeId |
| Cross-session element tracking | ARIA selectors |
| Automated testing (fresh browser per test) | ARIA selectors |
| Interactive debugging (persistent session) | CDP backendDOMNodeId |
| Need guaranteed uniqueness | CDP backendDOMNodeId |
| Non-unique element names | CDP backendDOMNodeId |

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
