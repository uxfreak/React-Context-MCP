# Implementation Plan for getComponentMap with A11y

## Goal
Show a tree that combines:
1. React component hierarchy (from Fiber tree)
2. Accessibility information (role + name) for each node

## Algorithm
1. Get accessibility snapshot
2. Walk the accessibility tree
3. For each a11y node with backendDOMNodeId:
   - Try to get its React component using existing logic
   - If found: Show React component with [role="..." name="..."]
   - If not found but has role/name: Show just as a11y node with role+name
4. Use tree connectors (├─, └─, │) to show hierarchy

## Key insight from user
- Use existing `getComponentById` logic that traverses Fiber to find parent
- Walk a11y tree, enriching each node with React info if available
- "Based on which component you find it under, just place it" - means accessibility nodes become children of their parent React component

## Next step
Look at existing code that does this traversal and adapt it
