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
let componentTree = null;

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
            componentTree = content;
            console.log('\n✅ Component tree received!\n');
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
  console.log('🚀 Getting component tree...\n');

  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  });

  setTimeout(() => sendRequest('tools/call', { name: 'ensure_react_attached', arguments: {} }), 2000);

  setTimeout(() => {
    console.log('🌳 Getting component tree (markdown format)...\n');
    sendRequest('tools/call', {
      name: 'get_component_map',
      arguments: { verbose: true }
    });
  }, 4000);

  setTimeout(() => {
    if (componentTree) {
      const outputPath = join(__dirname, 'tree-map-result.txt');
      writeFileSync(outputPath, componentTree);
      console.log(`💾 Saved tree to: ${outputPath}\n`);
      console.log('📋 Component Tree:\n');
      console.log(componentTree);
    }

    serverProcess.kill();
    process.exit(0);
  }, 8000);

}, 1000);

serverProcess.on('exit', (code) => process.exit(code || 0));
process.on('SIGINT', () => { serverProcess.kill(); process.exit(0); });
