#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Handle server output
serverProcess.stdout.on('data', (data) => {
  responseBuffer += data.toString();

  // Try to parse JSON-RPC messages
  const lines = responseBuffer.split('\n');
  responseBuffer = lines.pop() || ''; // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      try {
        const message = JSON.parse(line);
        console.log('📥 Received:', JSON.stringify(message, null, 2));
      } catch (e) {
        console.log('📄 Output:', line);
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
  console.log('📤 Sending:', JSON.stringify(request, null, 2));
  serverProcess.stdin.write(JSON.stringify(request) + '\n');
  return id;
}

// Wait for server to be ready
setTimeout(() => {
  console.log('🚀 Initializing MCP server...\n');

  // Step 1: Initialize
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  });

  // Step 2: Wait and ensure React attached
  setTimeout(() => {
    console.log('\n🔌 Ensuring React DevTools attached...\n');
    sendRequest('tools/call', {
      name: 'ensure_react_attached',
      arguments: {}
    });
  }, 2000);

  // Step 3: Get component map
  setTimeout(() => {
    console.log('\n🗺️  Getting component map...\n');
    sendRequest('tools/call', {
      name: 'get_component_map',
      arguments: {
        verbose: false,
        maxDepth: 3
      }
    });
  }, 4000);

  // Step 4: Exit after results
  setTimeout(() => {
    console.log('\n✅ Test complete. Exiting...\n');
    serverProcess.kill();
    process.exit(0);
  }, 10000);

}, 1000);

// Handle process exit
serverProcess.on('exit', (code) => {
  console.log(`\n🛑 Server process exited with code ${code}`);
  process.exit(code || 0);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  Interrupted. Cleaning up...');
  serverProcess.kill();
  process.exit(0);
});
