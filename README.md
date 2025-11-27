<div align="center">
  <img src="logo.png" alt="React Context MCP" width="600">
  <br><br>

[![npm version](https://img.shields.io/npm/v/react-context-mcp.svg)](https://npmjs.org/package/react-context-mcp)
[![License](https://img.shields.io/npm/l/react-context-mcp.svg)](https://github.com/uxfreak/react-context-mcp/blob/main/LICENSE)

</div>

## Instant React Component Discovery for AI Assistants

**The Problem:** You see a "Sign up" button and need to find which React component renders it, what file it's in, and what props it has.

**With React Context MCP:** Ask your AI assistant and get a complete component tree with accessibility information instantly.

```typescript
// You ask your AI:
"Show me the component tree for this page"

// Your AI calls:
get_component_map()

// You get:
React Component Tree:

OnboardingPage (src/pages/OnboardingPage.tsx:25:4)
└─ OnboardingScreen {content={...}, onSignUp={fn}, onLogIn={fn}} (src/pages/OnboardingPage.tsx:136:8)
   └─ Box {display="flex", flexDirection="column"} (src/design-system/OnboardingScreen.tsx:138:4)
      └─ Typography {as="h1", variant="h2Bold"} [role="heading" name="Create Account"] (src/components/Typography.tsx:103:10)
         └─ h1 [role="heading" name="Create Account"]
      └─ Button {size="large", onClick={fn}} [role="button" name="Sign up"] (src/components/Button.tsx:115:12)
         └─ button [role="button" name="Sign up"]
```

---

## What You Can Do

Ask your AI assistant to:

- **Get complete component trees** - See all React components with props, source locations, and accessibility structure
- **Find any UI element** - Trace buttons, inputs, or any element to its React component
- **Inspect component details** - Get props, state, and owner chains for any component
- **Navigate multi-page flows** - Analyze components across different screens

`react-context-mcp` is a Model Context Protocol (MCP) server that connects your AI assistant to React applications running in Chrome, providing instant access to component trees, props, state, and source locations.

## How It Works

### The Complete Picture: `get_component_map`

When you ask *"Show me the component tree"*, your AI calls:

```typescript
get_component_map({ verbose: true })
```

Returns a markdown tree showing:
- **All React components** (Button, TextField, OnboardingScreen, etc.)
- **Component props** in JSX format (`size="large"`, `onClick={fn}`)
- **Accessibility information** (role, accessible name for screen readers)
- **DOM elements with semantic roles** (button, h1, p, img)
- **Source locations** (file:line:column)

```
React Component Tree:

App (src/main.tsx:8:4)
└─ OnboardingScreen {onSignUp={fn}, onLogIn={fn}} (src/pages/OnboardingPage.tsx:136:8)
   └─ Stack {direction="column", gap="3"} (src/design-system/OnboardingScreen.tsx:216:8)
      └─ Text {variant="h1"} [role="heading" name="Send instantly"] (src/components/Text.tsx:222:12)
         └─ h1 [role="heading" name="Send instantly"]
      └─ Text {variant="body-secondary"} [role="paragraph"] (src/components/Text.tsx:232:12)
         └─ p [role="paragraph"]
      └─ Button {variant="primary", size="large"} [role="button" name="Sign up"] (src/components/Button.tsx:361:10)
         └─ button [role="button" name="Sign up"]
```

### Focused Element Inspection

For specific element details, use the two-step process:

**Step 1:** Take a snapshot to get element IDs
```typescript
take_snapshot({ verbose: true })
```

Returns the accessibility tree with **backendDOMNodeId** for every element:

```json
{
  "role": "button",
  "name": "Sign up",
  "backendDOMNodeId": 48
}
```

**Step 2:** Get React component details
```typescript
get_react_component_from_backend_node_id(48)
```

Returns complete component information:

```json
{
  "component": {
    "name": "Button",
    "type": "ForwardRef",
    "source": {
      "fileName": "src/components/Button.tsx",
      "lineNumber": 42,
      "columnNumber": 8
    },
    "props": {
      "variant": "primary",
      "size": "large",
      "onClick": "[Function]",
      "children": "Sign up"
    },
    "owners": [
      {
        "name": "OnboardingScreen",
        "source": "src/screens/OnboardingScreen.tsx:222:12"
      }
    ]
  }
}
```

---

## Requirements

- [Node.js](https://nodejs.org/) v20.19+ or v22.12+ or v23+
- [Chrome](https://www.google.com/chrome/) current stable version
- React application with development build (for source location tracking)

## Getting Started

### Quick Install

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "react-context": {
      "command": "npx",
      "args": ["-y", "react-context-mcp@latest"]
    }
  }
}
```

> [!NOTE]
> Using `@latest` ensures you always get the most recent version.

### MCP Client Setup

<details>
  <summary><b>Claude Code</b></summary>

Use the Claude Code CLI:

```bash
claude mcp add react-context npx react-context-mcp@latest
```

</details>

<details>
  <summary><b>Cursor</b></summary>

Go to `Cursor Settings` → `MCP` → `New MCP Server`, then add:

```json
{
  "mcpServers": {
    "react-context": {
      "command": "npx",
      "args": ["-y", "react-context-mcp@latest"]
    }
  }
}
```

</details>

<details>
  <summary><b>Cline / Windsurf / Other Clients</b></summary>

Add the configuration above to your MCP settings file. Refer to your client's documentation for the config file location.

</details>

### First Prompt

Try this in your MCP client:

```
Navigate to http://localhost:3000 and show me the component tree
```

Your AI assistant will open the browser, navigate to the page, and display the complete React component hierarchy with accessibility information.

## Source Location Tracking

> **⚠️ IMPORTANT:** To get accurate component source locations (file name, line number), you **must** configure the Babel plugin in your React project.

### Why Is This Required?

React Context MCP extracts source locations from `data-inspector-*` DOM attributes added by Babel. **React 19 removed the `_debugSource` fiber property**, making the Babel plugin approach the only reliable method for source tracking.

**Without the plugin:**
- ❌ Component source locations will show as `undefined`
- ✅ Component names, props, and tree structure work normally

**With the plugin:**
- ✅ Exact file paths (e.g., `src/components/Button.tsx`)
- ✅ Precise line and column numbers
- ✅ Complete component hierarchy with sources

### Configuration

#### Vite

```bash
npm install --save-dev @react-dev-inspector/babel-plugin
```

Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@react-dev-inspector/babel-plugin', {
            excludes: ['node_modules']
          }]
        ]
      }
    })
  ]
})
```

#### Next.js / CRA / Manual Babel

See the detailed configuration instructions for [Next.js](https://github.com/react-dev-inspector/react-dev-inspector#nextjs), [Create React App](https://github.com/react-dev-inspector/react-dev-inspector#create-react-app), and [manual Babel setup](https://github.com/react-dev-inspector/react-dev-inspector#babel) in the react-dev-inspector documentation.

---

## MCP Tools

### Page Management (5 tools)

1. **`list_pages`** - List all open browser tabs
2. **`select_page`** - Select a tab to work with
3. **`close_page`** - Close a specific tab
4. **`new_page`** - Open a new tab and navigate to URL
5. **`navigate_page`** - Navigate, reload, or go back/forward

### React Inspection (3 tools)

#### `get_component_map`
**Primary tool** - Get complete React component tree as markdown

**Arguments:**
- `verbose` (boolean, optional) - Include all DOM elements (default: true)
- `includeState` (boolean, optional) - Include component state (default: false)

**Response:**
```
React Component Tree:

App (src/App.tsx:10:4)
└─ Button {variant="primary", size="large"} [role="button" name="Sign up"] (src/Button.tsx:42:5)
   └─ button [role="button" name="Sign up"]
```

Shows:
- React component hierarchy
- Props in JSX format (`prop="value"`, `prop={value}`)
- ARIA attributes ([role="..." name="..."])
- DOM elements with semantic roles (button, h1, p, img, etc.)
- Source locations (file:line:column)

---

#### `take_snapshot`
Get accessibility tree with element IDs

**Arguments:**
- `verbose` (boolean, optional) - Include all elements (default: false)

**Response:**
```json
{
  "role": "RootWebArea",
  "name": "My App",
  "children": [
    {
      "role": "button",
      "name": "Sign up",
      "backendDOMNodeId": 48
    }
  ]
}
```

Use `backendDOMNodeId` with `get_react_component_from_backend_node_id` for detailed component inspection.

---

#### `get_react_component_from_backend_node_id`
Get React component details using backendDOMNodeId from snapshot

**Arguments:**
- `backendDOMNodeId` (number) - From take_snapshot

**Response:**
```json
{
  "success": true,
  "component": {
    "name": "Button",
    "type": "ForwardRef",
    "source": {
      "fileName": "src/components/Button.tsx",
      "lineNumber": 42
    },
    "props": {"variant": "primary", "children": "Sign up"},
    "owners": [
      {"name": "OnboardingScreen", "source": {...}},
      {"name": "App", "source": {...}}
    ]
  }
}
```

**Benefits:**
- ✅ Fastest method for component lookup
- ✅ Returns complete owner chain (parent components)
- ✅ Precise source locations

**Important:** backendDOMNodeId is only valid within the same browser session.

---

## Command-Line Options

```bash
# Auto-navigate on startup
TARGET_URL=http://localhost:3000 react-context-mcp

# Connect to existing Chrome with remote debugging
react-context-mcp --browserUrl http://localhost:9222

# Isolated mode (separate Chrome profile)
react-context-mcp --isolated --headless

# Custom Chrome executable
react-context-mcp --executablePath /path/to/chrome

# Set viewport size
react-context-mcp --viewport 1920x1080
```

**Available flags:**
- `--headless` - Run Chrome in headless mode
- `--isolated` - Use isolated user data directory
- `--browserUrl <url>` - Connect to existing Chrome debugging session
- `--wsEndpoint <url>` - WebSocket endpoint for CDP
- `--executablePath <path>` - Path to Chrome executable
- `--channel <channel>` - Chrome channel (stable, canary, beta, dev)
- `--viewport <WxH>` - Viewport size (e.g., 1280x720)

## Troubleshooting

### Browser Already Running
Use `--isolated` flag:
```bash
react-context-mcp --isolated
```

### Missing Source Locations
- Requires development build
- Add Babel plugin (see Source Location Tracking section)
- Restart dev server after configuration changes

### backendDOMNodeId Not Found
- Only valid within the same browser session
- Always use `take_snapshot` and `get_react_component_from_backend_node_id` in the same MCP session

## Development & Publishing

### Build

```bash
npm run build
```

### Test Locally

```bash
# Test the built package
npm start

# Or with target URL
TARGET_URL=http://localhost:3000 npm start
```

### Publish to npm

1. **Update version** in `package.json`:
   ```json
   {
     "version": "0.2.0"
   }
   ```

2. **Build and publish**:
   ```bash
   npm run build
   npm publish
   ```

3. **Verify publication**:
   ```bash
   npm info react-context-mcp
   ```

### Push to GitHub

```bash
# Commit all changes
git add .
git commit -m "feat: your feature description"

# Tag the version
git tag v0.2.0

# Push with tags
git push origin main --tags
```

## License

Apache-2.0

## Links

- **npm Package:** https://www.npmjs.com/package/react-context-mcp
- **GitHub Repository:** https://github.com/uxfreak/react-context-mcp
- **Issues:** https://github.com/uxfreak/react-context-mcp/issues
- **Model Context Protocol:** https://modelcontextprotocol.io
