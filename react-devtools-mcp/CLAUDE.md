# CLAUDE.md - Context Restoration Guide

This file documents the development process and serves as a source of truth for context restoration after memory compaction.

## Project Overview
React DevTools MCP (Model Context Protocol) server for inspecting React applications via accessibility tree and Chrome DevTools Protocol.

## Key Decision: Use GitHub Issues as Memory
- **GitHub Issues**: Source of truth for tasks, progress, and technical decisions
- **Issue Comments**: Detailed logs of implementation, test results, and findings
- **When context is lost**: Read through GitHub issues and comments to restore understanding

## Current Status

### ✅ Completed
- **Issue #1**: Navigate fiber tree to find React component from host element
  - Implemented full component hierarchy navigation
  - Collects ALL components (FunctionComponent, ClassComponent, ForwardRef)
  - Returns array from closest to farthest component
  - Test results: 18 components from Button → OnboardingScreen → App

- **Issue #2**: Create production tool `getReactComponentFromBackendNodeId`
  - Created CDP-based production tool accepting backendDOMNodeId
  - Returns full component metadata (name, type, props, state, source, owners)
  - Matches output format of ARIA-based tool
  - Uses DOM.resolveNode + Runtime.callFunctionOn

- **Issue #3**: Integrate backendDOMNodeId into takeSnapshot workflow
  - Replaced Puppeteer accessibility API with CDP Accessibility.getFullAXTree
  - Added backendDOMNodeId to every element in snapshot
  - Rebuilt hierarchy from flat CDP node array
  - **Testing Results**: ✅ PASSED
    - Heading test: Text component at OnboardingScreen.tsx:222:12
    - Button test: Button component at OnboardingScreen.tsx:361:10
    - Both returned full owner chains and component metadata

### 🔄 In Progress
- **Issue #4**: Add integration test comparing CDP vs ARIA approaches

### 📋 Pending
- Issue #5: Handle edge cases and error scenarios
- Issue #6: Documentation for CDP vs ARIA approaches
- Issue #7: Update README with project overview
- Issue #8: Package and publish to npm (HOLD - not publishing yet)

## Technical Approach

### Two Methods for Mapping Elements to React Components

#### 1. ARIA Selectors (Existing, Working)
```typescript
// Find element by accessibility role and name
const element = await page.$('aria/Sign up[role="button"]');
// Extract React fiber from element
const fiber = element.__reactFiber$...;
```

**Pros**: Works with current implementation
**Cons**: Requires re-searching page each time, less deterministic

#### 2. CDP backendDOMNodeId (New, Preferred)
```typescript
// Get from accessibility tree
const axTree = await CDP.Accessibility.getFullAXTree();
const backendNodeId = axNode.backendDOMNodeId; // e.g., 53

// Resolve to DOM element
const {object} = await CDP.DOM.resolveNode({ backendNodeId });

// Extract React fiber
const fiber = await CDP.Runtime.callFunctionOn({
  objectId: object.objectId,
  functionDeclaration: "function() { return this.__reactFiber$...; }"
});
```

**Pros**: Direct reference, faster, more deterministic
**Cons**: Requires CDP integration, more complex

### Key CDP Commands Used
- `Accessibility.enable` - Enable accessibility domain
- `Accessibility.getFullAXTree` - Get full accessibility tree with backendDOMNodeId
- `DOM.enable` - Enable DOM domain
- `DOM.getDocument` - Ensure DOM tree is loaded
- `DOM.resolveNode({ backendNodeId })` - Convert backendNodeId to RemoteObject
- `Runtime.callFunctionOn({ objectId, functionDeclaration })` - Execute JS in element context

### React Fiber Tags
- `tag 0`: FunctionComponent
- `tag 1`: ClassComponent
- `tag 5`: HostComponent (DOM elements like button, div)
- `tag 11`: ForwardRef or Memo wrapper
- `tag 10`: Context Provider/Consumer
- `tag 8`: StrictMode

### Component Hierarchy Example
```
button (tag 5, HostComponent)
  ↓ fiber.return
Button (tag 11, ForwardRef, displayName="Button")
  ↓ fiber.return
Box (tag 11, ForwardRef, displayName="Box")
  ↓ fiber.return
...
OnboardingScreen (tag 0, FunctionComponent)
  ↓ fiber.return
OnboardingPage (tag 0, FunctionComponent)
  ↓ fiber.return
...
App (tag 0, FunctionComponent)
```

## Test Files
All test files are in `/tmp/` directory:
- `/tmp/test-cdp-1.jsonl` - Test 1 input (get backendDOMNodeId)
- `/tmp/cdp-test-1-v2.json` - Test 1 results (PASSED)
- `/tmp/test-cdp-4.jsonl` - Test 4 input (extract fiber + navigate)
- `/tmp/cdp-test-4-v4.json` - Test 4 results (PASSED - full hierarchy)

## Common Errors Encountered

### 1. "Object couldn't be returned by value"
**Cause**: Trying to serialize functions or circular references with `returnByValue: true`
**Fix**: Explicitly convert all values to String/Number before returning

### 2. "Runtime.getExecutionContexts wasn't found"
**Cause**: This CDP method doesn't exist in Puppeteer's CDP client
**Fix**: Don't need executionContextId for DOM.resolveNode - it's optional

### 3. "No node with given id found"
**Cause**: backendNodeId is stale from different page load
**Fix**: Get backendNodeId and resolve it in same execution (don't separate tests)

## Development Server
- URL: `http://localhost:5174`
- Must be running for tests to work
- User starts it manually when needed

## Commit Message Format
- Use conventional commits: `feat:`, `fix:`, `docs:`, etc.
- **DO NOT include Claude Code signature** (user request)
- Keep messages concise and descriptive

## Repository
- GitHub: https://github.com/uxfreak/React-Devtools-MCP
- Issues: Use for tracking AND logging progress
- Comments: Detailed technical findings and test results

## After Context Restoration
1. Read this CLAUDE.md file first
2. Check GitHub issues: https://github.com/uxfreak/React-Devtools-MCP/issues
3. Read issue comments for latest progress and findings
4. Check which issues are open/closed
5. Continue from where left off

## Dev Server Location
Dev server runs from: `/Users/kasa/faux-projects/banking-template`
URL: `http://localhost:5174`

## Last Updated
2025-11-22 - After completing Issues #1, #2, #3 (implementation done, testing pending)
