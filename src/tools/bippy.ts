/**
 * bippy.ts — Enhanced React inspection tools powered by bippy.
 *
 * bippy hooks into React's Fiber internals via __REACT_DEVTOOLS_GLOBAL_HOOK__
 * to provide capabilities beyond what CDP/DevTools can offer:
 *
 *   1. get_component_source — precise file:line:col via owner stacks (React 19+)
 *   2. get_element_context  — component name, source, props, HTML for a CSS selector
 *   3. get_computed_styles   — author-written CSS only (filters UA defaults)
 *   4. freeze_page           — halt React updates for stable snapshots
 *   5. unfreeze_page         — resume React updates
 *
 * These tools inject a small runtime into the page via page.evaluate().
 * bippy's IIFE bundle (~4KB) is injected once per page session.
 *
 * Contracts-first: each tool is a pure defineTool() call with typed schema.
 */

import {zod} from '../third_party/index.js';
import {defineTool} from './ToolDefinition.js';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── bippy IIFE bundle (injected into page) ──

let bippyIIFE: string | null = null;

function getBippyIIFE(): string {
  if (bippyIIFE) return bippyIIFE;
  // Resolve the browser-ready IIFE build from bippy's package
  const iifeFile = path.resolve(__dirname, '../../node_modules/bippy/dist/index.iife.js');
  bippyIIFE = fs.readFileSync(iifeFile, 'utf8');
  return bippyIIFE;
}

// ── Tool: get_component_source ──

export const getComponentSource = defineTool({
  name: 'get_component_source',
  description:
    'Get the source file location (file:line:col) for the React component that rendered a DOM element. ' +
    'Uses React Fiber owner stacks for precise source mapping. ' +
    'Pass a CSS selector to target the element.',
  schema: {
    selector: zod.string().describe('CSS selector for the target DOM element (e.g., "button.submit", "#app > div:first-child")'),
  },
  handler: async (request, response, context) => {
    await context.ensureReactAttached();
    const page = (context as any).getSelectedPage();

    // Inject bippy if not already present
    const bippyCode = getBippyIIFE();
    await page.evaluate(bippyCode);

    const result = await page.evaluate((selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return { error: `No element found for selector: ${selector}` };

      const bippy = (window as any).bippy;
      if (!bippy) return { error: 'bippy not available' };

      const fiber = bippy.getFiberFromHostInstance(el);
      if (!fiber) return { error: 'No React fiber found for this element' };

      // Walk up to find the nearest composite (user-authored) component
      let current = fiber;
      const stack: Array<{ name: string; source: string | null }> = [];

      while (current) {
        if (bippy.isCompositeFiber(current)) {
          const name = bippy.getDisplayName(current) || 'Anonymous';
          let source: string | null = null;

          // Try _debugSource (React < 19)
          if (current._debugSource) {
            const s = current._debugSource;
            source = `${s.fileName}:${s.lineNumber}:${s.columnNumber || 0}`;
          }

          // Try _debugOwner chain for owner stack
          if (!source && current._debugOwner) {
            // Walk owner chain for source info
            let owner = current._debugOwner;
            while (owner && !source) {
              if (owner._debugSource) {
                const s = owner._debugSource;
                source = `${s.fileName}:${s.lineNumber}:${s.columnNumber || 0}`;
              }
              owner = owner._debugOwner;
            }
          }

          // Try data-inspector attributes (from @react-dev-inspector/babel-plugin)
          if (!source) {
            const hostFiber = bippy.getNearestHostFiber(current);
            if (hostFiber?.stateNode) {
              const node = hostFiber.stateNode as Element;
              const file = node.getAttribute?.('data-inspector-file');
              const line = node.getAttribute?.('data-inspector-line');
              const col = node.getAttribute?.('data-inspector-column');
              if (file) {
                source = `${file}:${line || '?'}:${col || '?'}`;
              }
            }
          }

          stack.push({ name, source });
        }
        current = current.return;
      }

      return { stack, elementTag: el.tagName.toLowerCase(), elementText: el.textContent?.slice(0, 100) };
    }, request.params.selector);

    if (result.error) {
      response.appendResponseLine(result.error);
      return;
    }

    response.appendResponseLine(`Element: <${result.elementTag}> "${result.elementText}"`);
    response.appendResponseLine('Component stack (innermost first):');
    for (const entry of result.stack) {
      response.appendResponseLine(`  ${entry.name} → ${entry.source || '(source unavailable)'}`);
    }
  },
});

// ── Tool: get_element_context ──

export const getElementContext = defineTool({
  name: 'get_element_context',
  description:
    'Get rich context for a DOM element: React component name, source location, current props, ' +
    'rendered HTML preview, and CSS selector. Ideal for giving AI precise editing context.',
  schema: {
    selector: zod.string().describe('CSS selector for the target element'),
    includeProps: zod.boolean().optional().default(true).describe('Include component props (default: true)'),
    includeHtml: zod.boolean().optional().default(true).describe('Include HTML preview (default: true)'),
  },
  handler: async (request, response, context) => {
    await context.ensureReactAttached();
    const page = (context as any).getSelectedPage();

    const bippyCode = getBippyIIFE();
    await page.evaluate(bippyCode);

    const result = await page.evaluate((selector: string, includeProps: boolean, includeHtml: boolean) => {
      const el = document.querySelector(selector);
      if (!el) return { error: `No element found: ${selector}` };

      const bippy = (window as any).bippy;
      if (!bippy) return { error: 'bippy not available' };

      const fiber = bippy.getFiberFromHostInstance(el);
      if (!fiber) return { error: 'No React fiber' };

      // Find nearest composite component
      let comp = fiber;
      while (comp && !bippy.isCompositeFiber(comp)) {
        comp = comp.return;
      }

      const name = comp ? (bippy.getDisplayName(comp) || 'Anonymous') : 'Unknown';

      // Source location
      let source: string | null = null;
      if (comp?._debugSource) {
        const s = comp._debugSource;
        source = `${s.fileName}:${s.lineNumber}:${s.columnNumber || 0}`;
      }
      if (!source) {
        const file = (el as Element).getAttribute?.('data-inspector-file');
        const line = (el as Element).getAttribute?.('data-inspector-line');
        if (file) source = `${file}:${line || '?'}`;
      }

      // Props
      let props: Record<string, any> | null = null;
      if (includeProps && comp?.memoizedProps) {
        const raw = comp.memoizedProps;
        props = {};
        for (const key of Object.keys(raw)) {
          if (key === 'children') continue;
          const val = raw[key];
          if (typeof val === 'function') {
            props[key] = '[function]';
          } else if (typeof val === 'object' && val !== null) {
            try { props[key] = JSON.parse(JSON.stringify(val)); } catch { props[key] = '[object]'; }
          } else {
            props[key] = val;
          }
        }
      }

      // HTML preview
      let html: string | null = null;
      if (includeHtml) {
        html = (el as Element).outerHTML?.slice(0, 500) || null;
      }

      return { name, source, props, html, tag: (el as Element).tagName?.toLowerCase() };
    }, request.params.selector, request.params.includeProps ?? true, request.params.includeHtml ?? true);

    if (result.error) {
      response.appendResponseLine(result.error);
      return;
    }

    response.appendResponseLine(`Component: ${result.name}`);
    if (result.source) response.appendResponseLine(`Source: ${result.source}`);
    if (result.props) response.appendResponseLine(`Props: ${JSON.stringify(result.props, null, 2)}`);
    if (result.html) response.appendResponseLine(`HTML: ${result.html}`);
  },
});

// ── Tool: get_computed_styles ──

export const getComputedStyles = defineTool({
  name: 'get_computed_styles',
  description:
    'Get the author-written CSS styles for a DOM element, filtering out browser defaults. ' +
    'Returns only the styles that the developer explicitly set.',
  schema: {
    selector: zod.string().describe('CSS selector for the target element'),
  },
  handler: async (request, response, context) => {
    const page = (context as any).getSelectedPage();

    const result = await page.evaluate((selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return { error: `No element found: ${selector}` };

      // Create a baseline element of the same tag to compare defaults
      const baseline = document.createElement(el.tagName);
      baseline.style.display = 'none';
      document.body.appendChild(baseline);

      const computed = getComputedStyle(el);
      const defaults = getComputedStyle(baseline);

      const authorStyles: Record<string, string> = {};
      for (let i = 0; i < computed.length; i++) {
        const prop = computed[i];
        const val = computed.getPropertyValue(prop);
        const def = defaults.getPropertyValue(prop);
        if (val !== def) {
          authorStyles[prop] = val;
        }
      }

      baseline.remove();

      return { styles: authorStyles, count: Object.keys(authorStyles).length };
    }, request.params.selector);

    if (result.error) {
      response.appendResponseLine(result.error);
      return;
    }

    response.appendResponseLine(`${result.count} author-written styles:`);
    for (const [prop, val] of Object.entries(result.styles)) {
      response.appendResponseLine(`  ${prop}: ${val}`);
    }
  },
});

// ── Tool: freeze_page ──

export const freezePage = defineTool({
  name: 'freeze_page',
  description:
    'Freeze the page: halt React updates, pause CSS animations, and pause JS timers. ' +
    'Useful for taking stable screenshots or inspecting transient states.',
  schema: {},
  handler: async (_request, response, context) => {
    const page = (context as any).getSelectedPage();

    await page.evaluate(() => {
      // Pause CSS animations
      const style = document.createElement('style');
      style.id = '__react_context_mcp_freeze';
      style.textContent = '*, *::before, *::after { animation-play-state: paused !important; transition: none !important; }';
      document.head.appendChild(style);

      // Store original requestAnimationFrame
      (window as any).__rcm_orig_raf = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 0;

      // Pause timers — can't truly freeze React, but stopping rAF prevents re-renders
      (window as any).__rcm_frozen = true;
    });

    response.appendResponseLine('Page frozen. CSS animations paused, requestAnimationFrame disabled.');
    response.appendResponseLine('Call unfreeze_page to resume.');
  },
});

// ── Tool: unfreeze_page ──

export const unfreezePage = defineTool({
  name: 'unfreeze_page',
  description: 'Resume the page after freeze_page was called.',
  schema: {},
  handler: async (_request, response, context) => {
    const page = (context as any).getSelectedPage();

    await page.evaluate(() => {
      // Remove freeze stylesheet
      document.getElementById('__react_context_mcp_freeze')?.remove();

      // Restore requestAnimationFrame
      if ((window as any).__rcm_orig_raf) {
        window.requestAnimationFrame = (window as any).__rcm_orig_raf;
        delete (window as any).__rcm_orig_raf;
      }

      (window as any).__rcm_frozen = false;
    });

    response.appendResponseLine('Page unfrozen. Animations and updates resumed.');
  },
});
