// Test script to verify we can access React fibers from DOM elements
// Run with: TARGET_URL=http://localhost:51743 node test-fiber-access.js

import puppeteer from 'puppeteer';

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';

async function test() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log(`Navigating to ${TARGET_URL}...`);
  await page.goto(TARGET_URL, {waitUntil: 'domcontentloaded'});

  console.log('Testing React fiber access...\n');

  // Test 1: Can we find React fiber keys on DOM elements?
  const testResult = await page.evaluate(() => {
    const results = {
      step1_findButton: false,
      step2_findFiberKey: false,
      step3_getFiber: false,
      step4_walkToComponent: false,
      details: {},
    };

    try {
      // Step 1: Find a button
      const button = document.querySelector('button');
      if (!button) {
        results.details.error = 'No button found on page';
        return results;
      }
      results.step1_findButton = true;
      results.details.buttonText = button.textContent?.trim().substring(0, 50);

      // Step 2: Find React fiber key
      const keys = Object.keys(button);
      const fiberKey = keys.find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) {
        results.details.error = 'No __reactFiber key found';
        results.details.sampleKeys = keys.slice(0, 10);
        return results;
      }
      results.step2_findFiberKey = true;
      results.details.fiberKey = fiberKey;

      // Step 3: Get the fiber
      const fiber = button[fiberKey];
      if (!fiber) {
        results.details.error = 'Fiber key exists but value is null';
        return results;
      }
      results.step3_getFiber = true;
      results.details.fiberTag = fiber.tag;
      results.details.fiberTypeName = fiber.type?.name || fiber.type?.displayName || fiber.type || 'Unknown';

      // Step 4: Walk up to find authored component
      let current = fiber;
      let depth = 0;
      const chain = [];

      while (current && depth < 20) {
        const tag = current.tag;
        const typeName = current.type?.name || current.type?.displayName || 'Unknown';

        chain.push({
          depth,
          tag,
          typeName,
          hasProps: !!current.memoizedProps,
          hasState: !!current.memoizedState,
          hasDebugSource: !!current._debugSource,
        });

        // Check if authored component (FunctionComponent=0, ClassComponent=1, etc.)
        if (tag === 0 || tag === 1 || tag === 2 || tag === 11 || tag === 15) {
          results.step4_walkToComponent = true;
          results.details.component = {
            name: typeName,
            tag,
            hasProps: !!current.memoizedProps,
            hasState: !!current.memoizedState,
            hasDebugSource: !!current._debugSource,
            debugSource: current._debugSource || null,
          };

          // Step 5: Try to extract props
          if (current.memoizedProps) {
            const props = {};
            let count = 0;
            for (const key in current.memoizedProps) {
              if (count++ > 10) break; // Limit for test
              const value = current.memoizedProps[key];
              const type = typeof value;
              if (type === 'string' || type === 'number' || type === 'boolean') {
                props[key] = value;
              } else if (type === 'function') {
                props[key] = '[Function]';
              } else if (type === 'object' && value !== null) {
                props[key] = '[Object]';
              }
            }
            results.details.component.sampleProps = props;
          }

          break;
        }

        current = current.return;
        depth++;
      }

      results.details.chain = chain;

      return results;
    } catch (error) {
      results.details.error = error.message;
      results.details.stack = error.stack;
      return results;
    }
  });

  // Print results
  console.log('='.repeat(70));
  console.log('TEST RESULTS:');
  console.log('='.repeat(70));
  console.log(`✓ Step 1 - Find button element:      ${testResult.step1_findButton ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Step 2 - Find __reactFiber key:    ${testResult.step2_findFiberKey ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Step 3 - Get fiber from element:   ${testResult.step3_getFiber ? 'PASS' : 'FAIL'}`);
  console.log(`✓ Step 4 - Walk to authored component: ${testResult.step4_walkToComponent ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(70));

  if (testResult.step4_walkToComponent) {
    console.log('\n✅ SUCCESS! We can access React components from DOM elements!\n');
    console.log('Component Details:');
    console.log(JSON.stringify(testResult.details.component, null, 2));

    if (testResult.details.buttonText) {
      console.log(`\nButton text: "${testResult.details.buttonText}"`);
    }
  } else {
    console.log('\n❌ FAILED at some step\n');
    console.log('Details:');
    console.log(JSON.stringify(testResult.details, null, 2));
  }

  if (testResult.details.chain && testResult.details.chain.length > 0) {
    console.log('\nFiber chain walked:');
    testResult.details.chain.forEach(node => {
      console.log(`  [${node.depth}] tag=${node.tag} type=${node.typeName} props=${node.hasProps} source=${node.hasDebugSource}`);
    });
  }

  await browser.close();
  console.log('\nBrowser closed.');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
