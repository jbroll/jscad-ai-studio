#!/usr/bin/env node

/**
 * Create a new model from a template
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, basename } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npm run new <model-name> [template]');
  console.log('');
  console.log('Available templates:');
  console.log('  basic-model (default) - Simple model template');
  console.log('  parametric-model      - Model with interactive parameters');
  console.log('  multi-part           - Assembly with multiple parts');
  console.log('');
  console.log('Examples:');
  console.log('  npm run new my-gear');
  console.log('  npm run new my-box parametric-model');
  process.exit(0);
}

const modelName = args[0];
const templateName = args[1] || 'basic-model';
const templatePath = resolve(__dirname, `../templates/${templateName}.js`);
const outputPath = resolve(__dirname, `../workspace/${modelName}.js`);

// Check if template exists
if (!existsSync(templatePath)) {
  console.error(`Error: Template '${templateName}' not found`);
  console.error(`Looking for: ${templatePath}`);
  process.exit(1);
}

// Check if output file already exists
if (existsSync(outputPath)) {
  console.error(`Error: File '${modelName}.js' already exists in workspace/`);
  console.error(`Remove it first or choose a different name`);
  process.exit(1);
}

// Read template and replace placeholder
let content = readFileSync(templatePath, 'utf-8');
content = content.replace(/\[Model Name\]/g, modelName);

// Write output file
writeFileSync(outputPath, content);

console.log(`✓ Created ${modelName}.js from ${templateName} template`);
console.log(`  Location: workspace/${modelName}.js`);
console.log('');
console.log('Load in viewer:');
console.log(`  http://127.0.0.1:5120#jscad-ai-studio/${modelName}.js`);
