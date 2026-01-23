#!/usr/bin/env node

/**
 * Start the jscadui viewer for previewing models
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const viewerPath = resolve(__dirname, '../../jscadui/apps/jscad-web');
const workspacePath = resolve(__dirname, '../workspace');

console.log('Starting jscadui viewer...');
console.log('Viewer path:', viewerPath);
console.log('Workspace:', workspacePath);
console.log('');

// Check if viewer path exists
if (!existsSync(viewerPath)) {
  console.error('Error: jscadui viewer not found at:', viewerPath);
  console.error('');
  console.error('Make sure jscadui is installed at:');
  console.error('  /home/john/src/jscadui/');
  console.error('');
  console.error('Install with:');
  console.error('  cd /home/john/src/jscadui');
  console.error('  npm install');
  process.exit(1);
}

const viewer = spawn('npm', ['start'], {
  cwd: viewerPath,
  stdio: 'inherit'
});

viewer.on('error', (err) => {
  console.error('Failed to start viewer:', err.message);
  console.error('');
  console.error('Make sure jscadui is installed:');
  console.error('  cd ../jscadui');
  console.error('  npm install');
  process.exit(1);
});

viewer.on('close', (code) => {
  if (code !== 0) {
    console.log(`Viewer exited with code ${code}`);
  }
});

console.log('');
console.log('Once the viewer starts, look for "Serving" message above.');
console.log('The viewer typically runs at: http://127.0.0.1:5120');
console.log('');
console.log('Then load your model at:');
console.log('  http://127.0.0.1:5120#jscad-ai-studio/model.js');
console.log('');
console.log('Or use: npm run work <model-name>');
console.log('');
console.log('Press Ctrl+C to stop the viewer');
