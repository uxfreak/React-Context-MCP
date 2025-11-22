# Finding Text on Page: "log in" Example

This guide shows how to find specific text (like "log in") on a page and trace it back to the React component source.

## Quick Start

### 1. Start the MCP Server with Your App

```bash
cd react-devtools-mcp
TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless
```

This will:
- Launch Chrome in headless mode with an isolated profile
- Navigate to your app at `http://localhost:51743`
- Inject the React DevTools backend
- Wait for MCP tool calls via stdin

### 2. Send JSON-RPC Commands

#### Option A: Interactive Test (Recommended)

Create a test script:

```bash
cat <<'EOF' > find-login-text.sh
#!/bin/bash
(cat <<'COMMANDS'
{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"take_snapshot","arguments":{"verbose":true}}}
COMMANDS
sleep 15) | TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless 2>&1
EOF

chmod +x find-login-text.sh
./find-login-text.sh > snapshot-output.json
```

#### Option B: One-liner

```bash
(echo '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"take_snapshot","arguments":{"verbose":true}}}'; sleep 15) | \
TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless 2>&1 | \
grep -A 1000 '"id":"1"' > snapshot.json
```

### 3. Find "Log in" in the Snapshot

Search the output for the text:

```bash
cat snapshot.json | jq -r '.result.content[0].text' | jq '.root' | grep -B2 -A5 '"Log in"'
```

**Example output:**
```json
{
  "role": "button",
  "name": "Log in",
  "uid": "1763797635548_46",
  "children": [
    {
      "role": "none",
      "uid": "1763797635548_47",
      "children": [
        {
          "role": "StaticText",
          "name": "Log in",
          "uid": "1763797635548_48"
        }
      ]
    }
  ]
}
```

**Key information:**
- **UID**: `1763797635548_46` - Unique identifier for this element
- **Role**: `button` - It's a button element
- **Name**: `Log in` - The visible text
- **Parent hierarchy**: Can trace up the tree using the snapshot

### 4. Extract UID for "Log in" Button

```bash
cat snapshot.json | \
  jq -r '.result.content[0].text' | \
  jq '.. | objects | select(.name == "Log in" and .role == "button") | .uid' | \
  head -1
```

Output: `1763797635548_46`

## Understanding the Accessibility Tree

The snapshot returns a hierarchical tree where each node has:

- **role**: ARIA role (button, link, heading, StaticText, etc.)
- **name**: Accessible name (visible text for most elements)
- **uid**: Unique identifier in format `{snapshotId}_{nodeIndex}`
- **children**: Nested elements (if any)
- **value**: Form input values (if applicable)
- **description**: Additional descriptive text
- **disabled/focused/checked**: State flags for interactive elements

### Common Roles to Look For

| Role | Description | Example |
|------|-------------|---------|
| `button` | Clickable buttons | "Log in", "Submit" |
| `link` | Hyperlinks | Navigation links |
| `heading` | Headings (h1-h6) | Page titles |
| `textbox` | Input fields | Email, password fields |
| `StaticText` | Text content | Paragraphs, labels |
| `InlineTextBox` | Inline text runs | Text within elements |

## Current Limitations & Roadmap

### ✅ What Works Now

- ✅ Find any visible text on the page
- ✅ Get unique UID for each UI element
- ✅ Inspect React component tree separately
- ✅ Get component props, state, and source location by component ID

### 🚧 What's Next

The current implementation can:
1. **Find text via a11y tree** → Get UID (e.g., "Log in" → `1763797635548_46`)
2. **Inspect React components** → Get source (e.g., component `1:0:0.0.0` → `src/LoginButton.tsx:42`)

**Missing link:** Map UID → React Component ID

To complete the workflow, we need to:

```
Text "Log in"
  → UID (1763797635548_46)
  → DOM Element
  → React Fiber
  → Component ID (1:0:0.0.0)
  → Source Location (src/LoginButton.tsx:42)
```

### Workaround (Manual)

For now, you can:

1. **Get the snapshot** to find text UID
2. **List all components** with `list_components`
3. **Manually correlate** by component names or structure
4. **Get component details** once you find the right component ID

**Example:**

```bash
# Step 1: Find "Log in" UID from snapshot
# UID: 1763797635548_46

# Step 2: List components and look for Button/Login-related names
echo '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"list_components","arguments":{"depth":20,"maxNodes":500,"nameFilter":"Button"}}}' | \
TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless

# Step 3: Get component details for matching IDs
echo '{"jsonrpc":"2.0","id":"init","method":"initialize","params":{"protocolVersion":"2024-12-19","capabilities":{},"clientInfo":{"name":"cli","version":"0.0.0"}}}
{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"get_component","arguments":{"id":"1:0:0.0.0.0.0.0"}}}' | \
TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless
```

## Advanced: Combining Tools

### Find All Buttons on Page

```bash
cat snapshot.json | \
  jq -r '.result.content[0].text' | \
  jq '.. | objects | select(.role == "button") | {uid, name}'
```

### Find Text in Specific Section

```bash
# Search within a specific UID subtree
cat snapshot.json | \
  jq -r '.result.content[0].text' | \
  jq '.. | objects | select(.uid == "1763797635548_34") | .. | objects | select(.name != null and .name != "") | {role, name, uid}'
```

### Count Elements by Role

```bash
cat snapshot.json | \
  jq -r '.result.content[0].text' | \
  jq '.. | objects | select(.role != null) | .role' | \
  sort | uniq -c | sort -rn
```

## Tips & Tricks

1. **Use `verbose: false` for cleaner output** - Only shows "interesting" elements
2. **Search by substring** - Use `jq` filters to find partial matches
3. **Save snapshots** - Compare snapshots over time to debug UI changes
4. **Combine with component inspection** - Cross-reference findings with React tree

## Next Steps

Once UID → Component mapping is implemented, you'll be able to:

```bash
# Future tool (not yet implemented)
echo '{"jsonrpc":"2.0","id":"4","method":"tools/call","params":{"name":"get_component_by_uid","arguments":{"uid":"1763797635548_46"}}}' | \
TARGET_URL=http://localhost:51743 node build/src/main.js --isolated --headless
```

**Expected response:**
```json
{
  "uid": "1763797635548_46",
  "reactComponent": {
    "id": "1:0:0.0.0.0.0.0",
    "name": "LoginButton",
    "type": "FunctionComponent",
    "source": {
      "fileName": "src/components/LoginButton.tsx",
      "lineNumber": 42,
      "columnNumber": 10
    }
  }
}
```

## Feedback & Issues

This is a prototype implementation. If you encounter issues or have feature requests, please document them for future improvements.
