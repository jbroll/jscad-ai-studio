#!/usr/bin/env node

/**
 * Set up workspace for a specific model
 * Creates the model if needed and outputs the viewer URL
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, basename } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npm run work <model-name> [template]');
  console.log('');
  console.log('This command:');
  console.log('  1. Creates the model if it doesn\'t exist');
  console.log('  2. Shows you the viewer URL to open');
  console.log('  3. Creates a .current-model file for Claude Code');
  console.log('');
  console.log('Examples:');
  console.log('  npm run work my-gear');
  console.log('  npm run work my-box parametric-model');
  process.exit(0);
}

const modelName = args[0];
const templateName = args[1] || 'basic-model';
const modelFile = `${modelName}.js`;
const modelPath = resolve(__dirname, `../workspace/${modelFile}`);
const templatePath = resolve(__dirname, `../templates/${templateName}.js`);
const currentModelPath = resolve(__dirname, '../.current-model');

console.log('Setting up workspace...');
console.log('');

// Create model if it doesn't exist
if (!existsSync(modelPath)) {
  if (!existsSync(templatePath)) {
    console.error(`Error: Template '${templateName}' not found`);
    process.exit(1);
  }

  let content = readFileSync(templatePath, 'utf-8');
  content = content.replace(/\[Model Name\]/g, modelName);
  writeFileSync(modelPath, content);
  console.log(`✓ Created ${modelFile} from ${templateName} template`);
} else {
  console.log(`✓ Using existing ${modelFile}`);
}

// Save current model info
const currentModel = {
  name: modelName,
  file: modelFile,
  path: modelPath,
  viewerUrl: `http://127.0.0.1:5120#jscad-ai-studio/${modelFile}`
};

writeFileSync(currentModelPath, JSON.stringify(currentModel, null, 2));

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log(`  Working on: ${modelFile}`);
console.log('');
console.log('  1. Make sure the viewer is running:');
console.log('     npm run dev');
console.log('');
console.log('  2. Open this URL in your browser:');
console.log(`     ${currentModel.viewerUrl}`);
console.log('');
console.log('  3. Edit the file:');
console.log(`     ${modelPath}`);
console.log('');
console.log('  4. Tell Claude Code:');
console.log(`     "Work on ${modelFile}" or just "continue"`);
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('The file will auto-reload in the browser when you save!');
console.log('');
