#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Start the MCP server
const serverProcess = spawn('node', [
  join(__dirname, 'build/src/main.js'),
  '--headless=false'
], {
  env: {
    ...process.env,
    TARGET_URL: 'http://localhost:61585'
  },
  stdio: ['pipe', 'pipe', 'inherit']
});

let responseBuffer = '';
let requestId = 0;
let componentMapResult = null;

// Handle server output
serverProcess.stdout.on('data', (data) => {
  responseBuffer += data.toString();

  // Try to parse JSON-RPC messages
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const message = JSON.parse(line);
        console.log('📥 Received:', message.method || `Response for ID ${message.id}`);

        // Save component map result
        if (message.id === 3 && message.result) {
          const content = message.result.content?.[0]?.text;
          if (content) {
            componentMapResult = JSON.parse(content);
            console.log('\n✅ Component map received! Saving to file...\n');
          }
        }
      } catch (e) {
        // Ignore non-JSON output
      }
    }
  }
});

// Send JSON-RPC request
function sendRequest(method, params = {}) {
  const id = ++requestId;
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
  console.log(`📤 Sending ${method}...`);
  serverProcess.stdin.write(JSON.stringify(request) + '\n');
  return id;
}

// Wait for server to be ready
setTimeout(() => {
  console.log('🚀 Testing get_component_map with verbose=true...\n');

  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });

  setTimeout(() => sendRequest('tools/call', { name: 'ensure_react_attached', arguments: {} }), 2000);

  setTimeout(() => {
    console.log('\n🗺️  Fetching VERBOSE component map...\n');
    sendRequest('tools/call', {
      name: 'get_component_map',
      arguments: { verbose: true, maxDepth: 3 }
    });
  }, 4000);

  setTimeout(() => {
    if (componentMapResult) {
      const outputPath = join(__dirname, 'component-map-result.json');
      writeFileSync(outputPath, JSON.stringify(componentMapResult, null, 2));
      console.log(`💾 Saved component map to: ${outputPath}\n`);

      // Analyze results
      const countNodes = (node) => {
        let count = 1;
        if (node.children) {
          count += node.children.reduce((sum, child) => sum + countNodes(child), 0);
        }
        return count;
      };

      const countReactComponents = (node) => {
        let count = node.react ? 1 : 0;
        if (node.children) {
          count += node.children.reduce((sum, child) => sum + countReactComponents(child), 0);
        }
        return count;
      };

      const totalNodes = countNodes(componentMapResult.root);
      const reactNodes = countReactComponents(componentMapResult.root);

      console.log('📊 Statistics:');
      console.log(`   - Total nodes: ${totalNodes}`);
      console.log(`   - Nodes with React data: ${reactNodes}`);
      console.log(`   - Snapshot ID: ${componentMapResult.snapshotId}\n`);
    }

    serverProcess.kill();
    process.exit(0);
  }, 8000);

}, 1000);

serverProcess.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => { serverProcess.kill(); process.exit(0); });
