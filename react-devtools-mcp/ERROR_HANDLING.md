# Error Handling

This document describes how React DevTools MCP handles edge cases and error scenarios.

## Tool Error Responses

All tools return a consistent error format when something goes wrong:

```json
{
  "success": false,
  "error": "Error description",
  "additionalInfo": "..."
}
```

## Common Error Scenarios

### 1. Element Not Found

**ARIA Approach** (`get_react_component_from_snapshot`):
```json
{
  "success": false,
  "error": "No element found with role=\"button\" and name=\"Submit\"",
  "ariaSelector": "aria/Submit[role=\"button\"]"
}
```

**CDP Approach** (`get_react_component_from_backend_node_id`):
```json
{
  "success": false,
  "error": "Failed to resolve backendNodeId to DOM element",
  "backendDOMNodeId": 42
}
```

**Common causes:**
- Element doesn't exist on the page
- Role or name doesn't match (ARIA)
- backendDOMNodeId is stale from a previous page load (CDP)
- Element was removed after snapshot was taken

**How to fix:**
- Verify the element exists using `take_snapshot`
- Check role and name match exactly (case-sensitive)
- Take a fresh snapshot if using backendDOMNodeId

### 2. Element Has No React Fiber

```json
{
  "success": false,
  "error": "Element found but has no React fiber"
}
```

**Common causes:**
- Element is not rendered by React (plain HTML)
- React DevTools backend not properly injected
- React version incompatibility

**How to fix:**
- Use `ensure_react_attached` to verify React is loaded
- Check that the element is actually part of the React component tree
- Verify React is using a supported version (16.8+)

### 3. No Component Found in Fiber Tree

```json
{
  "success": false,
  "error": "No React component found in fiber tree"
}
```

**Common causes:**
- Element is a host component (e.g., `<div>`, `<button>`) with no authored React component parent
- Deep nesting exceeded safety limit (20 steps)

**How to fix:**
- Try selecting a child element that's closer to an authored component
- Check if the element is rendered directly in the root without a component wrapper

### 4. CDP Protocol Errors

```json
{
  "success": false,
  "error": "No node with given id found",
  "stack": "..."
}
```

**Common causes:**
- backendDOMNodeId from a different page/session
- DOM node was removed after snapshot
- Browser tab was closed or navigated away

**How to fix:**
- Take a fresh snapshot in the same session
- Ensure the page hasn't navigated since the snapshot
- Don't reuse node IDs across different browser sessions

## Built-in Safety Limits

To prevent performance issues and crashes, the tools enforce these limits:

### Fiber Tree Navigation
- **Max steps**: 20 levels up the fiber tree
- Prevents infinite loops and deep recursion

### Owner Chain
- **Max owners**: 10 components
- Limits the ancestor component chain length

### Props/State Serialization
- **Max depth**: 3 levels for props, 2 levels for state
- **Max properties**: 50 per object
- **Max array items**: 100 items
- **Circular references**: Detected and replaced with `"[Circular]"`
- **React elements**: Replaced with `"[React Element]"`
- **DOM nodes**: Replaced with `"[DOM Node]"`
- **Functions**: Replaced with `"[Function: name]"`

### Example of Limited Serialization

```json
{
  "props": {
    "onClick": "[Function: handleClick]",
    "children": "[React Element]",
    "style": {
      "color": "blue",
      "nested": {
        "deep": {
          "tooDeep": "[Max Depth]"
        }
      }
    },
    "ref": "[Circular]"
  }
}
```

## Error Recovery Strategies

### Strategy 1: Progressive Fallback

If CDP approach fails, fall back to ARIA:

```javascript
// Try CDP first (faster)
let result = await get_react_component_from_backend_node_id({
  backendDOMNodeId: nodeId
});

if (!result.success) {
  // Fall back to ARIA
  result = await get_react_component_from_snapshot({
    role: 'button',
    name: 'Submit'
  });
}
```

### Strategy 2: Fresh Snapshot on Stale IDs

If you suspect stale node IDs:

```javascript
// Take a fresh snapshot
const snapshot = await take_snapshot({verbose: true});

// Find the element again
const element = findInSnapshot(snapshot, 'button', 'Submit');

// Use the fresh backendDOMNodeId
const component = await get_react_component_from_backend_node_id({
  backendDOMNodeId: element.backendDOMNodeId
});
```

### Strategy 3: Validate Before Use

Always check success before using results:

```javascript
const result = await get_react_component_from_snapshot({
  role: 'button',
  name: 'Submit'
});

if (!result.success) {
  console.error('Failed:', result.error);
  return;
}

// Safe to use result.component
console.log(result.component.name);
```

## Debugging Tips

1. **Enable verbose snapshots**: Use `{verbose: true}` to see all elements
2. **Check React attachment**: Call `ensure_react_attached` first
3. **Verify element exists**: Use `take_snapshot` to confirm element is present
4. **Test in browser console**: Try `document.querySelector('button')` to verify selectors
5. **Check React DevTools**: Open React DevTools to see if components are detected

## Known Limitations

1. **Stale Node IDs**: CDP backendDOMNodeIds are only valid within the same page load
2. **Cross-frame**: Elements in iframes require separate handling
3. **Shadow DOM**: Limited support for elements in shadow DOM
4. **Dynamic content**: Elements added after snapshot may not be found
5. **Non-React elements**: Plain HTML elements without React don't have fiber data
