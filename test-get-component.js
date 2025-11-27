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
let componentResult = null;

serverProcess.stdout.on('data', (data) => {
  responseBuffer += data.toString();
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || '';

  for (const line of lines) {
    if (line.trim()) {
      try {
        const message = JSON.parse(line);
        console.log('📥 Response:', JSON.stringify(message, null, 2));
        if (message.id === 4 && message.result) {
          const content = message.result.content?.[0]?.text;
          if (content) {
            componentResult = content;
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
  console.log('📤 Sending:', JSON.stringify(request, null, 2));
  serverProcess.stdin.write(JSON.stringify(request) + '\n');
  return id;
}

setTimeout(() => {
  console.log('🚀 Testing get_react_component_from_backend_node_id...\n');

  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });

  setTimeout(() => sendRequest('tools/call', { name: 'ensure_react_attached', arguments: {} }), 2000);

  setTimeout(() => sendRequest('tools/call', { name: 'take_snapshot', arguments: { verbose: true } }), 4000);

  // Try getting a component by backend node ID (using ID 42 from the "Install app" button)
  setTimeout(() => {
    console.log('\n🔍 Getting component for backendDOMNodeId 42...\n');
    sendRequest('tools/call', {
      name: 'get_react_component_from_backend_node_id',
      arguments: { backendDOMNodeId: 42 }
    });
  }, 6000);

  setTimeout(() => {
    if (componentResult) {
      console.log('\n✅ Component result:\n', componentResult);
      writeFileSync(join(__dirname, 'get-component-result.txt'), componentResult);
    }
    serverProcess.kill();
    process.exit(0);
  }, 10000);

}, 1000);

serverProcess.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => { serverProcess.kill(); process.exit(0); });
