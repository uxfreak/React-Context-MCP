<div align="center">
  <img src="logo.png" alt="React Context MCP" width="600">
  <br><br>

[![npm version](https://img.shields.io/npm/v/react-context-mcp.svg)](https://npmjs.org/package/react-context-mcp)
[![License](https://img.shields.io/npm/l/react-context-mcp.svg)](https://github.com/uxfreak/react-context-mcp/blob/main/LICENSE)

</div>

## Ask Your AI to Find React Components

**The Problem:** You see a "Sign up" button on screen and need to find which component renders it, what file it's in, and what props it has. This typically requires grepping code, searching files, and adding console.logs.

**With React Context MCP:** Ask your AI assistant and get the component details immediately.

```typescript
// You ask your AI:
"Find the 'Sign up' button and show me the React component"

// Your AI makes 2 tool calls:
// 1. take_snapshot() → Gets page structure with element IDs
// 2. get_react_component_from_backend_node_id(48) → Gets component details

// You get the answer:
{
  component: "Button",
  source: "src/design-system/atoms/Button/Button.tsx:42:8",
  props: { variant: "primary", size: "large", children: "Sign up" },
  owners: [
    { name: "OnboardingScreen", source: "src/screens/OnboardingScreen.tsx:222:12" },
    { name: "App", source: "src/App.tsx:15:3" }
  ]
}
```

**Example Result:** In production use, a developer analyzed 30+ components across a 6-screen signup flow, finding design system compliance issues that would have taken significantly longer to find manually.

---

## What You Can Do

Ask your AI assistant to:

- Find any UI element and trace it to its React component and source file
- Analyze all components of a specific type on a page (e.g., all TextFields, all Buttons)
- Show component hierarchies with full owner chains and source locations
- Navigate through multi-page flows and inspect components across screens

`react-context-mcp` is a Model Context Protocol (MCP) server that connects your AI assistant (Claude, Cursor, Copilot, Gemini) to React applications running in Chrome. It provides instant access to component trees, props, state, and source locations.

## How It Works: The Tool Journey

When you ask your AI *"Find the Sign up button and show me the component"*, here's what happens behind the scenes:

### Step 1: Your AI Takes a Snapshot
```typescript
take_snapshot({ verbose: true })
```

Returns the page structure as an accessibility tree with **backendDOMNodeId** for every element:

```json
{
  "role": "RootWebArea",
  "name": "Onboarding",
  "backendDOMNodeId": 12,
  "children": [
    {
      "role": "heading",
      "name": "Create your account",
      "backendDOMNodeId": 23
    },
    {
      "role": "form",
      "name": "Sign up form",
      "backendDOMNodeId": 31,
      "children": [
        {
          "role": "textbox",
          "name": "Email address",
          "backendDOMNodeId": 42
        },
        {
          "role": "textbox",
          "name": "Password",
          "backendDOMNodeId": 45
        },
        {
          "role": "button",
          "name": "Sign up",
          "backendDOMNodeId": 48  // ← AI finds this!
        },
        {
          "role": "button",
          "name": "Back",
          "backendDOMNodeId": 51
        }
      ]
    }
  ]
}
```

### Step 2: AI Finds Your Element

Your AI searches the tree for `"Sign up"` button → Found at `backendDOMNodeId: 48`

### Step 3: AI Fetches the React Component
```typescript
get_react_component_from_backend_node_id(48)
```

Uses the DOM node ID to traverse the React fiber tree and returns the **complete component hierarchy**:

```json
{
  "name": "Button",
  "type": "ForwardRef",
  "source": {
    "fileName": "src/design-system/atoms/Button/Button.tsx",
    "lineNumber": 42,
    "columnNumber": 8
  },
  "props": {
    "variant": "primary",
    "size": "large",
    "fullWidth": true,
    "disabled": false,
    "children": "Sign up"
  },
  "state": {
    "memoizedState": false,
    "baseState": false
  },
  "owners": [
    {
      "name": "OnboardingScreen",
      "type": "FunctionComponent",
      "source": {
        "fileName": "src/screens/OnboardingScreen.tsx",
        "lineNumber": 222,
        "columnNumber": 12
      }
    },
    {
      "name": "App",
      "type": "FunctionComponent",
      "source": {
        "fileName": "src/App.tsx",
        "lineNumber": 15,
        "columnNumber": 3
      }
    }
  ]
}
```

**Total time:** ~2 seconds. **Total tool calls:** 2.

---

## The Power: DOM Node → React Component Mapping

This is what makes it work - every DOM element maps to its React component:

```
Accessibility Tree (from snapshot)          React Fiber Tree (internal)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<button> "Sign up"                          Button (ForwardRef)
  backendDOMNodeId: 48  ─────────────────>    source: Button.tsx:42
  role: "button"                                props: { variant: "primary" }
  name: "Sign up"                               ↑ parent
                                                │
                                              OnboardingScreen
                                                source: OnboardingScreen.tsx:222
                                                ↑ parent
                                                │
                                              App
                                                source: App.tsx:15
```

**The magic:** `backendDOMNodeId: 48` is the bridge between what you see on screen and the React component tree.

---

## Real-World Use Cases (From Actual Usage)

### Use Case 1: Design System Compliance Audit

**Scenario:** You're migrating to a design system. You need to verify all TextField components on a 6-screen signup flow use the new design system version.

**You ask:** *"Navigate through the signup flow and check if all text inputs use the design system TextField"*

**The Journey:**

```typescript
// Screen 1: Email
navigate_page({ url: "http://localhost:3000/signup/email" })
take_snapshot()
```

**Snapshot returns:**
```json
{
  "role": "form",
  "name": "Sign up form",
  "backendDOMNodeId": 31,
  "children": [
    {
      "role": "textbox",
      "name": "Email address",
      "backendDOMNodeId": 52  // ← AI finds this
    }
  ]
}
```

**AI checks the component:**
```typescript
get_react_component_from_backend_node_id(52)
```

**Response:**
```json
{
  "name": "TextField",
  "type": "ForwardRef",
  "source": {
    "fileName": "src/design-system/components/atoms/TextField/TextField.tsx",
    "lineNumber": 28,
    "columnNumber": 8
  },
  "props": {
    "label": "Email address",
    "type": "email",
    "placeholder": "you@example.com",
    "autoFocus": true,
    "required": true
  }
}
// ✅ Design system component verified!
```

**Screen 2: Personal Info**
```typescript
navigate_page({ url: "http://localhost:3000/signup/personal-info" })
take_snapshot({ verbose: true })
```

**Snapshot returns:**
```json
{
  "role": "form",
  "name": "Personal information",
  "backendDOMNodeId": 60,
  "children": [
    {
      "role": "textbox",
      "name": "First name",
      "backendDOMNodeId": 67
    },
    {
      "role": "textbox",
      "name": "Last name",
      "backendDOMNodeId": 71
    },
    {
      "role": "textbox",
      "name": "Phone",
      "backendDOMNodeId": 75
    }
  ]
}
```

**AI checks each:**
```typescript
get_react_component_from_backend_node_id(67)
// Response: { name: "TextField", source: "src/design-system/..." } ✅

get_react_component_from_backend_node_id(71)
// Response: { name: "TextField", source: "src/design-system/..." } ✅

get_react_component_from_backend_node_id(75)
// Response: { name: "Input", source: "src/components/Input.tsx" } ❌ Legacy!
```

**Result:** Analyzed 30+ TextFields across 6 screens. Found 2 legacy components still using `src/components/Input.tsx` instead of the design system.

### Use Case 2: Component Refactoring Safety Check

**Scenario:** Before refactoring the Button component, find all instances and document their current props.

**You ask:** *"Find all buttons on this page and show me their props"*

**The Journey:**

```typescript
take_snapshot({ verbose: true })
```

**Snapshot returns all buttons:**
```json
{
  "children": [
    {
      "role": "button",
      "name": "Continue",
      "backendDOMNodeId": 48
    },
    {
      "role": "button",
      "name": "Back",
      "backendDOMNodeId": 52
    },
    {
      "role": "button",
      "name": "Skip",
      "backendDOMNodeId": 67
    },
    {
      "role": "button",
      "name": "Cancel",
      "backendDOMNodeId": 73
    }
    // ... 11 more buttons
  ]
}
```

**AI analyzes each button:**
```typescript
get_react_component_from_backend_node_id(48)
// { component: "Button", props: { variant: "primary", size: "large" } }

get_react_component_from_backend_node_id(52)
// { component: "Button", props: { variant: "secondary", size: "medium" } }

get_react_component_from_backend_node_id(67)
// { component: "Button", props: { variant: "text", size: "medium" } }

// ... checks all 15 buttons
```

**AI generates report:**
```
Found 15 Button components:
- All use props: variant, size, children
- 8 use variant="primary"
- 5 use variant="secondary"
- 2 use variant="text"
- Safe to add new optional prop: icon (won't break existing usage)
```

**Result:** Complete prop inventory generated. Safe refactoring plan created based on actual usage patterns.

### Use Case 3: Accessibility Audit

**Scenario:** Ensure all text inputs have proper labels and autocomplete attributes.

**You ask:** *"Check if all text inputs on this page have proper labels and autocomplete"*

**The Journey:**

```typescript
take_snapshot({ verbose: true })
```

**Snapshot returns all textboxes:**
```json
{
  "children": [
    {
      "role": "textbox",
      "name": "Email address",
      "backendDOMNodeId": 42
    },
    {
      "role": "textbox",
      "name": "",  // ❌ No accessible name!
      "backendDOMNodeId": 45
    },
    {
      "role": "textbox",
      "name": "First name",
      "backendDOMNodeId": 51
    }
  ]
}
```

**AI checks each input's props:**
```typescript
get_react_component_from_backend_node_id(42)
// ✅ { props: { label: "Email address", autoComplete: "email" } }

get_react_component_from_backend_node_id(45)
// ❌ { props: { placeholder: "Enter password" } }  // No label! No autocomplete!

get_react_component_from_backend_node_id(51)
// ⚠️ { props: { label: "First name" } }  // Has label, missing autocomplete
```

**AI generates accessibility report:**
```
Accessibility Issues Found:

❌ Critical (3 inputs):
- nodeId 45: Missing label (only has placeholder)
- nodeId 58: Missing label
- nodeId 62: Missing label

⚠️ Warning (8 inputs):
- nodeId 42, 51, 55, 59, 63, 67, 71, 75: Missing autocomplete attribute

Recommendations:
1. Add aria-label or label prop to all inputs
2. Add autocomplete for better UX (email, name, tel, etc.)
```

**Result:** Found 3 critical issues, 8 warnings. Generated fix list with exact file locations.

---

## Requirements

- [Node.js](https://nodejs.org/) v20.19+ or v22.12+ or v23+
- [Chrome](https://www.google.com/chrome/) current stable version
- [npm](https://www.npmjs.com/)
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

### Connecting to Existing Browser

To connect to a Chrome instance with remote debugging enabled:

```bash
# Start Chrome with remote debugging
chrome --remote-debugging-port=9222

# Add to MCP config with browserUrl
claude mcp add react-context npx react-context-mcp@latest --browserUrl http://localhost:9222
```

### First Prompt

Try this in your MCP client:

```
Navigate to http://localhost:3000 and find the "Sign up" button.
Show me the React component and its source file.
```

Your AI assistant will open the browser, take a snapshot, find the button, and show you the complete component information with source location.

## MCP Tools

### Page Management Tools

#### `list_pages`
Get a list of all open browser pages/tabs.

**Example:**
```json
{"name": "list_pages", "arguments": {}}
```

**Response:**
```
## Pages
0: http://localhost:3000 [selected]
1: http://localhost:3001/admin
```

#### `select_page`
Select a page by index for future operations.

**Arguments:**
- `pageIdx` (number) - Page index from list_pages

**Example:**
```json
{"name": "select_page", "arguments": {"pageIdx": 1}}
```

#### `close_page`
Close a page by index. Cannot close the last open page.

**Arguments:**
- `pageIdx` (number) - Page index to close

#### `new_page`
Create a new page and navigate to a URL.

**Arguments:**
- `url` (string) - URL to load
- `timeout` (number, optional) - Navigation timeout in milliseconds

**Example:**
```json
{"name": "new_page", "arguments": {"url": "http://localhost:3000"}}
```

#### `navigate_page`
Navigate the currently selected page.

**Arguments:**
- `type` (string) - Navigation type: "url", "back", "forward", "reload"
- `url` (string, optional) - Target URL (required for type="url")
- `ignoreCache` (boolean, optional) - Ignore cache on reload
- `timeout` (number, optional) - Navigation timeout

**Example:**
```json
{"name": "navigate_page", "arguments": {"type": "url", "url": "http://localhost:3000/about"}}
```

### React DevTools Tools

#### `ensure_react_attached`
Inject React DevTools backend and detect renderers.

**Response:**
```
React DevTools backend is installed.
Renderers:
- id=1 name=react-dom version=18.3.0
```

#### `list_react_roots`
List all React roots on the current page.

**Arguments:**
- `rendererId` (number, optional) - Filter by renderer ID

**Response:**
```
renderer=1(react-dom) root=1:0 idx=0 name=App nodes=156
```

#### `list_components`
List React component tree with filtering.

**Arguments:**
- `rendererId` (number, optional) - Filter by renderer
- `rootIndex` (number, optional) - Filter by root
- `depth` (number, default: 3) - Traversal depth (1-10)
- `maxNodes` (number, default: 200) - Max nodes (1-2000)
- `nameFilter` (string, optional) - Substring match on name

**Example:**
```json
{"name": "list_components", "arguments": {"depth": 5, "maxNodes": 100}}
```

#### `get_component`
Get detailed component information by ID.

**Arguments:**
- `id` (string) - Component ID from list_components

**Response:**
```json
{
  "id": "1:0:0.2.1",
  "name": "Button",
  "type": "ForwardRef",
  "props": {"variant": "primary", "children": "Sign up"},
  "state": null,
  "source": {
    "fileName": "src/components/Button.tsx",
    "lineNumber": 42,
    "columnNumber": 8
  }
}
```

#### `highlight_component`
Visually highlight a component in the browser.

**Arguments:**
- `id` (string) - Component ID from list_components

#### `take_snapshot`
Capture accessibility tree snapshot with backendDOMNodeId for every element.

**Arguments:**
- `verbose` (boolean, default: false) - Include all elements or only interactive ones

**Response:**
```json
{
  "root": {
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
}
```

#### `get_react_component_from_backend_node_id`
**Recommended:** Get React component using CDP backendDOMNodeId from snapshot.

**Arguments:**
- `backendDOMNodeId` (number) - From take_snapshot

**Why use this:**
- ✅ Faster and more deterministic than ARIA selectors
- ✅ Returns full component hierarchy from element to root
- ✅ Precise source locations for each component

**Example:**
```json
{"name": "get_react_component_from_backend_node_id", "arguments": {"backendDOMNodeId": 48}}
```

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

**Important:** backendDOMNodeId is only valid within the same browser session. Always use take_snapshot and this tool in the same MCP session.

#### `get_react_component_from_snapshot`
**Legacy:** Get React component using ARIA role and name.

**Arguments:**
- `role` (string) - Element role from snapshot
- `name` (string) - Element name/text from snapshot

**When to use:**
- Cross-session element tracking
- No backendDOMNodeId available

**Example:**
```json
{"name": "get_react_component_from_snapshot", "arguments": {"role": "button", "name": "Sign up"}}
```

## Common Workflows

### Workflow 1: Finding Component from UI Text

**Scenario:** Find the "Sign up" button and trace it to its React component and source file.

**Method 1: CDP backendDOMNodeId (Recommended)**

Fastest and most reliable - uses direct DOM node ID:

```typescript
// Step 1: Take snapshot (includes backendDOMNodeId for every element)
take_snapshot({ verbose: false })

// Step 2: Find your element in the snapshot JSON:
{
  "role": "button",
  "name": "Sign up",
  "backendDOMNodeId": 48  // ← Use this
}

// Step 3: Get complete component information
get_react_component_from_backend_node_id(48)
```

**Result:**
```json
{
  "success": true,
  "component": {
    "name": "Button",
    "type": "ForwardRef",
    "source": {
      "fileName": "src/design-system/atoms/Button/Button.tsx",
      "lineNumber": 42,
      "columnNumber": 8
    },
    "props": {
      "variant": "primary",
      "size": "large",
      "children": "Sign up"
    },
    "owners": [
      { "name": "OnboardingScreen", "source": "..." },
      { "name": "App", "source": "..." }
    ]
  }
}
```

**Method 2: ARIA Selector (Cross-Session)**

Works across different browser sessions:

```typescript
get_react_component_from_snapshot({
  role: "button",
  name: "Sign up"
})
```

**When to use each:**
- **CDP method:** Same browser session, faster, more deterministic
- **ARIA method:** Cross-session, automated testing, stale-resistant

---

### Workflow 2: Analyzing All Buttons on a Page

**Scenario:** Audit all buttons for design system compliance.

**Current approach (v0.1.0):**

```typescript
// Step 1: Get snapshot
take_snapshot({ verbose: true })

// Step 2: Manually find all button backendDOMNodeIds
// NodeIds: 48, 52, 67, 89, 102...

// Step 3: Inspect each individually
get_react_component_from_backend_node_id(48)
get_react_component_from_backend_node_id(52)
// ... repeat for all buttons
```

**Future approach (v0.2.0 - See Issue #10):**

```typescript
// Single call to get all buttons
get_react_components({
  componentName: "Button",
  includeProps: true
})

// Returns array of all Button components with props
// Can then filter by variant, source, etc.
```

**Use cases:**
- ✅ Design system compliance checking
- ✅ Finding deprecated prop usage
- ✅ Component usage auditing
- ✅ Generating component inventories

---

### Workflow 3: Multi-Page Navigation & Analysis

**Scenario:** Analyze a 6-screen signup flow for consistent TextField usage.

```typescript
// Page 1: Email screen
new_page("http://localhost:3000/signup/email")
take_snapshot()
get_react_component_from_backend_node_id(...)  // Email TextField

// Page 2: Personal info
navigate_page({ type: "url", url: "/signup/personal-info" })
take_snapshot()
// Inspect first name, last name TextFields

// Page 3: Password
navigate_page({ type: "url", url: "/signup/password" })
// Continue analysis...

// List all pages
list_pages()
// Shows: 0: /email [selected], 1: /personal-info, 2: /password

// Switch back to previous page
select_page(1)
```

**Real-world use case:**
- User analyzed 30+ components across 6 screens
- Found inconsistent TextField props
- Generated compliance report

---

### Workflow 4: Design System Migration

**Scenario:** Find all legacy components that need updating to design system.

```typescript
// Step 1: List all components on page
list_components({ depth: 10, maxNodes: 1000 })

// Step 2: Inspect each to check source path
get_component("1:0:0.2.1")
// Check if source.fileName starts with "src/design-system/"

// Step 3: Identify legacy components
// Legacy: src/components/OldButton.tsx
// Design System: src/design-system/atoms/Button.tsx
```

**Future capability (v0.3.0 - See Issue #16):**

```typescript
analyze_design_system({
  designSystemPath: "src/design-system",
  currentPage: true
})

// Returns:
{
  compliance: 93%,
  violations: [
    { component: "OldButton", source: "SignupScreen.tsx:120" }
  ]
}
```

---

### Workflow 5: Component Refactoring Safety Check

**Scenario:** Before refactoring TextField component, find all usages.

```typescript
// Step 1: Navigate to each major page
new_page("http://localhost:3000/signup")
new_page("http://localhost:3000/dashboard")
new_page("http://localhost:3000/settings")

// Step 2: On each page, find TextField usages
select_page(0)  // Signup page
take_snapshot()
// Find all textbox roles, inspect each
// Document current props

select_page(1)  // Dashboard
// Repeat analysis

// Step 3: Document prop patterns
// All TextFields use: label, required, type, autoComplete
// Safe to add new prop: helperText (optional)
```

**Result:**
- ✅ Found all TextField instances
- ✅ Documented current prop usage
- ✅ Safe refactoring plan created

---

### Workflow 6: Accessibility Audit

**Scenario:** Ensure all text inputs have proper labels.

```typescript
// Step 1: Get all interactive elements
take_snapshot({
  verbose: true,
  filterInteractive: true  // Future: Issue #11
})

// Step 2: Find all textbox elements
// Filter for role="textbox"

// Step 3: Check each for label
get_react_component_from_backend_node_id(nodeId)
// Verify props.label or props['aria-label'] exists

// Step 4: Generate report of unlabeled inputs
```

**Common findings:**
- Missing labels on password fields
- Missing aria-labels on search inputs
- Incorrect autocomplete attributes

---

### Workflow 7: Managing Browser Pages

**Scenario:** Test flows across multiple tabs.

```typescript
// List current pages
list_pages()
// Returns: "0: http://localhost:3000 [selected]"

// Open admin panel in new tab
new_page("http://localhost:3001/admin")

// Open docs in another tab
new_page("http://localhost:3002/docs")

// List all pages
list_pages()
// Returns:
// 0: http://localhost:3000
// 1: http://localhost:3001/admin [selected]
// 2: http://localhost:3002/docs

// Switch between pages
select_page(0)  // Back to main app
select_page(2)  // To docs

// Close admin tab
close_page(1)

// Navigate current page
navigate_page({ type: "back" })
navigate_page({ type: "forward" })
navigate_page({ type: "reload", ignoreCache: true })
```

---

### Workflow 8: Inspecting React Component Tree

**Scenario:** Understand the component hierarchy of a complex page.

```typescript
// Step 1: Ensure React DevTools backend is attached
ensure_react_attached()
// Returns: "React DevTools backend is installed. Renderers: react-dom v18.3.0"

// Step 2: List React roots
list_react_roots()
// Returns: "renderer=1(react-dom) root=1:0 idx=0 name=App nodes=156"

// Step 3: Browse component tree (starting from root)
list_components({ depth: 3, maxNodes: 50 })
// Returns component IDs like: "1:0:0.2.1"

// Step 4: Get detailed info for specific component
get_component("1:0:0.2.1")
// Returns full component details with props, state, source

// Step 5: Visually highlight component in browser
highlight_component("1:0:0.2.1")
// Component lights up with overlay in browser
```

**Component ID format:** `{rendererId}:{rootIndex}:{path}`
- rendererId: 1 (react-dom)
- rootIndex: 0 (first root)
- path: 0.2.1 (1st child → 3rd child → 2nd child)

---

## Pro Tips

### Reducing Token Usage

Snapshots can be large. Optimize by:

```typescript
// Instead of verbose snapshot (15k tokens):
take_snapshot({ verbose: true })

// Use compact snapshot (2k tokens):
take_snapshot({ verbose: false })
// Only includes interactive/interesting elements

// Future: Smart filtering (Issue #11)
take_snapshot({
  verbose: true,
  filterInteractive: true,
  maxDepth: 3
})
```

### Handling Stale backendDOMNodeIds

BackendDOMNodeIds become stale when:
1. Page navigates or reloads
2. DOM updates significantly
3. Different browser session

**Solution:** Always use snapshot + component lookup in same MCP session.

**Wrong (stale IDs):**
```typescript
// Session 1
take_snapshot()  // Returns nodeId: 48

// Session 2 (new browser instance)
get_react_component_from_backend_node_id(48)  // ❌ Error: stale ID
```

**Correct (same session):**
```typescript
// Single session
take_snapshot()  // Returns nodeId: 48
get_react_component_from_backend_node_id(48)  // ✅ Works
```

### Finding Components by Test IDs

If your components have `data-testid`:

```typescript
// Future: Issue #9
get_react_component({ dataTestId: "submit-button" })
```

**Current workaround:**
```typescript
// Use CSS selector in snapshot search
// Find element with data-testid="submit-button"
// Then use its backendDOMNodeId
```

## Manual Installation

For development or local installation:

```bash
git clone https://github.com/uxfreak/react-context-mcp.git
cd react-context-mcp
npm install
npm run build

# Link globally
npm link

# Now use in MCP config
claude mcp add react-context react-context-mcp
```

## Command-Line Options

```bash
# Auto-navigate on startup
TARGET_URL=http://localhost:3000 react-context-mcp

# Connect to existing Chrome
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

## Source Location Tracking

> **⚠️ IMPORTANT:** To get accurate component source locations (file name, line number), you **must** configure the Babel plugin in your React project.

### Why Is This Required?

React Context MCP extracts source locations from `data-inspector-*` DOM attributes added by Babel. **React 19 removed the `_debugSource` fiber property**, making the Babel plugin approach the only reliable method for source tracking across all React versions.

**Without the plugin configured:**
- ❌ Component source locations will show as `undefined`
- ❌ You'll only see component names and props (still useful!)
- ✅ All other features work normally

**With the plugin configured:**
- ✅ Exact file paths (e.g., `src/components/Button.tsx`)
- ✅ Precise line and column numbers
- ✅ Complete component hierarchy with sources

### Configuration

#### Vite

Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['@babel/plugin-transform-react-jsx-development']
      }
    })
  ]
})
```

#### Next.js / Create React App

✅ **Automatically included in development mode.** No configuration needed!

The plugin is built into Next.js and CRA's development builds.

#### Manual Babel Configuration

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

### React 19 Compatibility

✅ **Fully compatible with React 19**

React 19 removed `_debugSource` and `_debugOwner` from fiber objects for performance. React Context MCP uses `data-inspector-*` DOM attributes instead, which is:
- More reliable across React versions
- Future-proof (won't break with React updates)
- Recommended by the React team for tooling

### Development vs Production

| Build Type | Source Locations | Component Inspection |
|------------|------------------|---------------------|
| Development (with Babel plugin) | ✅ Full source info | ✅ Yes |
| Development (without plugin) | ❌ No sources | ✅ Yes |
| Production | ❌ No sources | ✅ Yes (but minified names) |

**Note:** Source tracking intentionally only works in development builds for performance and security.

### Troubleshooting

**"Source location is undefined"**
- Check that the Babel plugin is configured
- Verify you're running a development build
- Restart your dev server after config changes

**"Seeing minified component names"**
- You're connected to a production build
- Use a development build for readable names and sources

## Architecture

### React Backend Injection
1. Injects custom `__REACT_DEVTOOLS_GLOBAL_HOOK__` on page load
2. Intercepts `renderer.inject()` when React initializes
3. Captures fiber roots via `onCommitFiberRoot` hook
4. Stores fiber tree for inspection

### Component Tree Traversal
- Walks React fiber tree depth-first
- Starts from `root.current` fiber node
- Traverses via `fiber.child` and `fiber.sibling` pointers
- Generates stable path-based IDs

### Two Element-to-Component Mapping Methods

#### Method 1: CDP backendDOMNodeId (Recommended)
1. Get backendDOMNodeId from snapshot
2. Use `DOM.resolveNode({backendNodeId})` to get element reference
3. Execute `element.__reactFiber$...` in element context
4. Walk fiber tree to collect component hierarchy
5. Return complete chain with source locations

**Benefits:**
- ✅ Faster (direct access)
- ✅ More deterministic (unique numeric ID)
- ✅ Full component hierarchy
- ✅ Precise source locations

#### Method 2: ARIA Selectors (Legacy)
1. Use `aria/Name[role="button"]` selector
2. Find element via accessibility tree
3. Extract React fiber from element
4. Return component information

**Benefits:**
- ✅ Cross-session compatible
- ✅ No staleness issues
- ✅ Works with dynamic content

## Troubleshooting

### Browser Already Running
Use `--isolated` flag:
```bash
react-context-mcp --isolated
```

### No React Renderers Detected
- Ensure React is loaded on the page
- Try refreshing after backend injection
- Check browser console for errors

### Missing Source Locations
- Requires development build
- Add Babel plugin (see Source Location Tracking)
- Production builds strip this metadata

### backendDOMNodeId Not Found
- Only valid in same browser session
- Use take_snapshot and get_react_component_from_backend_node_id in same MCP session
- For cross-session tracking, use ARIA selectors instead

## License

Apache-2.0

## Links

- **npm Package:** https://www.npmjs.com/package/react-context-mcp
- **GitHub Repository:** https://github.com/uxfreak/react-context-mcp
- **Issues:** https://github.com/uxfreak/react-context-mcp/issues
- **Model Context Protocol:** https://modelcontextprotocol.io
