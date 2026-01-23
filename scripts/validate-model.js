#!/usr/bin/env node

/**
 * Validate a model file
 */

import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: npm run validate <model-file>');
  console.log('');
  console.log('Example:');
  console.log('  npm run validate workspace/model.js');
  process.exit(0);
}

const modelPath = resolve(process.cwd(), args[0]);

console.log('Validating:', modelPath);
console.log('');

// Check if file exists
if (!existsSync(modelPath)) {
  console.error('✗ File not found');
  process.exit(1);
}

// Read file content
let content;
try {
  content = readFileSync(modelPath, 'utf-8');
} catch (err) {
  console.error('✗ Failed to read file:', err.message);
  process.exit(1);
}

// Check for syntax errors
let hasErrors = false;

// Check for module.exports
if (!content.includes('module.exports')) {
  console.error('✗ Missing module.exports');
  console.error('  Add: module.exports = { main };');
  hasErrors = true;
} else {
  console.log('✓ Has module.exports');
}

// Check for main function
if (!content.includes('const main') && !content.includes('function main')) {
  console.error('✗ Missing main function');
  console.error('  Add: const main = () => { ... };');
  hasErrors = true;
} else {
  console.log('✓ Has main function');
}

// Check for require('@jbroll/jscad-fluent')
if (!content.includes("require('@jbroll/jscad-fluent')")) {
  console.warn('⚠ Warning: Not using jscad-fluent');
  console.warn('  Consider: const jf = require(\'@jbroll/jscad-fluent\');');
} else {
  console.log('✓ Uses jscad-fluent');
}

// Check for common mistakes
if (content.includes('* 180 / Math.PI') || content.includes('/ 180 * Math.PI')) {
  console.warn('⚠ Warning: Possible degree/radian conversion');
  console.warn('  JSCAD uses RADIANS, not degrees');
}

if (content.match(/colorize\(\[[\d\s,]+\d{2,3}/)) {
  console.warn('⚠ Warning: Possible color range issue');
  console.warn('  Colors should be 0-1 range, not 0-255');
}

// Try to parse as JS (basic check)
try {
  new Function(content);
  console.log('✓ JavaScript syntax is valid');
} catch (err) {
  console.error('✗ JavaScript syntax error:', err.message);
  hasErrors = true;
}

console.log('');

if (hasErrors) {
  console.error('Validation failed');
  process.exit(1);
} else {
  console.log('✓ Validation passed');
  console.log('');
  console.log('Load in viewer:');
  console.log(`  http://localhost:8080#${modelPath}`);
}
