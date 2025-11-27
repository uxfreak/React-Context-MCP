#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
let componentMap = null;

serverProcess.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const message = JSON.parse(line);
        if (message.id === 3 && message.result) {
          const content = message.result.content?.[0]?.text;
          if (content) {
            componentMap = JSON.parse(content);
            console.log('\n✅ Component map received! Saving to file...\n');
          }
        }
      } catch (e) {
        // Ignore non-JSON
      }
    }
  }
});

function sendRequest(method, params = {}) {
  const id = ++requestId;
  const request = { jsonrpc: '2.0', id, method, params };
  serverProcess.stdin.write(JSON.stringify(request) + '\n');
  return id;
}

setTimeout(() => {
  console.log('🚀 Getting minimal component map...\n');

  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });

  setTimeout(() => sendRequest('tools/call', { name: 'ensure_react_attached', arguments: {} }), 2000);

  setTimeout(() => {
    console.log('📸 Getting component map (minimal format)...\n');
    sendRequest('tools/call', {
      name: 'get_component_map',
      arguments: { verbose: true }
    });
  }, 4000);

  setTimeout(() => {
    if (componentMap) {
      const outputPath = join(__dirname, 'minimal-map-result.json');
      writeFileSync(outputPath, JSON.stringify(componentMap, null, 2));
      console.log(`💾 Saved component map to: ${outputPath}\n`);

      // Also print a sample node with React data
      const findNodeWithReact = (node) => {
        if (node.react) return node;
        if (node.children) {
          for (const child of node.children) {
            const found = findNodeWithReact(child);
            if (found) return found;
          }
        }
        return null;
      };

      const sampleNode = findNodeWithReact(componentMap.root);
      if (sampleNode) {
        console.log('📦 Sample node with React data:');
        console.log(JSON.stringify({
          role: sampleNode.role,
          name: sampleNode.name,
          backendDOMNodeId: sampleNode.backendDOMNodeId,
          react: sampleNode.react
        }, null, 2));
      }
    }

    serverProcess.kill();
    process.exit(0);
  }, 8000);

}, 1000);

serverProcess.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => { serverProcess.kill(); process.exit(0); });
