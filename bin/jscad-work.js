#!/usr/bin/env node

/**
 * Global command to work on JSCAD models from any directory
 *
 * Usage:
 *   jscad-work                    # Show help and list models
 *   jscad-work <model-name>       # Work on specific model
 */

import { existsSync, writeFileSync, symlinkSync, unlinkSync, readdirSync } from 'fs';
import { resolve, basename, dirname } from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STUDIO_ROOT = resolve(__dirname, '..');
const JSCADUI_ROOT = resolve(STUDIO_ROOT, '../jscadui/apps/jscad-web');
const JSCADUI_WORKSPACE = resolve(JSCADUI_ROOT, 'build_dev');

const cwd = process.cwd();
const args = process.argv.slice(2);
const command = args[0];

// Find .js files in current directory
const findModels = () => {
  if (!existsSync(cwd)) return [];
  return readdirSync(cwd)
    .filter(f => f.endsWith('.js') && !f.startsWith('.'))
    .sort();
};

// Check if viewer is running on port 5120
const isViewerRunning = () => {
  try {
    const result = execSync('lsof -i :5120 -sTCP:LISTEN 2>/dev/null || true', { encoding: 'utf8' });
    return result.trim().length > 0;
  } catch {
    return false;
  }
};

// Start viewer in background
const startViewerBackground = () => {
  if (!existsSync(JSCADUI_ROOT)) {
    console.error('Error: jscadui not found at:', JSCADUI_ROOT);
    return false;
  }

  console.log('Starting jscadui viewer in background...');
  const viewer = spawn('npm', ['start'], {
    cwd: JSCADUI_ROOT,
    detached: true,
    stdio: 'ignore'
  });
  viewer.unref();
  console.log('✓ Viewer starting (will be ready in a few seconds)');
  return true;
};

// Find Chrome/Chromium executable
const findChrome = () => {
  const chromePaths = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];

  for (const path of chromePaths) {
    try {
      execSync(`which ${path} 2>/dev/null || command -v ${path} 2>/dev/null`);
      return path;
    } catch {
      continue;
    }
  }
  return null;
};

// Open URL in browser (prefer Chrome)
const openInBrowser = (url) => {
  const chrome = findChrome();

  if (chrome) {
    console.log(`✓ Opening in Chrome: ${url}`);
    spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    // Fallback to xdg-open (uses default browser)
    console.log(`Chrome not found, opening in default browser: ${url}`);
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
};

// Create symlink from jscadui workspace to current directory
const createSymlink = () => {
  const linkName = basename(cwd);
  const linkPath = resolve(JSCADUI_WORKSPACE, linkName);

  // Remove existing symlink if present
  if (existsSync(linkPath)) {
    unlinkSync(linkPath);
  }

  // Create new symlink
  symlinkSync(cwd, linkPath, 'dir');
  console.log(`✓ Created symlink: jscadui → ${linkName}/`);
  return linkName;
};

// Create CLAUDE.md for this directory
const createClaudeMd = (currentModel) => {
  const claudeMdPath = resolve(cwd, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    console.log('✓ CLAUDE.md already exists');
    return;
  }

  const content = `# JSCAD Model Development

This directory contains JSCAD models developed using jscad-ai-studio.

## Project Context

**Current model**: ${currentModel}
**Viewer URL**: http://127.0.0.1:5120#${basename(cwd)}/${currentModel}

## Workflow

You are working with the JSCAD AI Studio workflow. Key points:

1. **Models are .js files** in this directory that export a \`main\` function
2. **Live preview** at http://127.0.0.1:5120 (viewer must be running)
3. **Use jscad-fluent API** - see ${STUDIO_ROOT}/llm.txt for full API reference
4. **Parametric models** - use \`main(p)\` with parameter declarations for interactive UI controls

## API Reference

The jscad-fluent API is available at: ${STUDIO_ROOT}/llm.txt

Key imports:
\`\`\`javascript
const jf = require('@jbroll/jscad-fluent');
\`\`\`

## Parameter Format

For parametric models with UI controls:
\`\`\`javascript
const main = (p) => {
  p._type = 'Model Name';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, step: 1, label: 'Size', live: true };

  return jf.sphere({ radius: p.size / 2 });
};
\`\`\`

Use compact one-line parameter declarations.

## Code Style

- Use short parameter name \`p\` not \`params\`
- No local copies - use \`p.size\` directly in code
- Prefer fluent chaining: \`jf.cube().translate([1,2,3]).colorize([1,0,0])\`
- Keep code brief and expressive

## Available Models

${findModels().map(m => m === currentModel ? `- **${m}** ← current` : `- ${m}`).join('\n') || '(no .js files found yet)'}

## Creating New Models

Just create a .js file with:
\`\`\`javascript
const jf = require('@jbroll/jscad-fluent');
const main = () => jf.cube({ size: 10 });
module.exports = { main };
\`\`\`

Then load in browser at: http://127.0.0.1:5120#${basename(cwd)}/yourmodel.js
`;

  writeFileSync(claudeMdPath, content);
  console.log('✓ Created CLAUDE.md with workflow instructions');
};

// Create .jscad-studio config
const createConfig = (modelName) => {
  const config = {
    studioRoot: STUDIO_ROOT,
    jscaduiRoot: JSCADUI_ROOT,
    workspace: basename(cwd),
    currentModel: modelName,
    viewerUrl: `http://127.0.0.1:5120#${basename(cwd)}/${modelName}`
  };

  writeFileSync(resolve(cwd, '.jscad-studio'), JSON.stringify(config, null, 2));
  console.log(`✓ Created .jscad-studio config`);
  return config;
};

// Main command logic (async IIFE to support await)
(async () => {
if (!command) {
  console.log('Usage:');
  console.log('  jscad-work <model.js>     Create/work on model');
  console.log('');
  console.log('Example:');
  console.log('  jscad-work my-gear.js     Create new model or work on existing');
  console.log('');
  const models = findModels();
  if (models.length > 0) {
    console.log('Models in current directory:');
    models.forEach(m => console.log(`  - ${m}`));
  } else {
    console.log('No .js models found in current directory.');
  }
  process.exit(0);
}

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  JSCAD AI Studio - Work Mode');
console.log('═══════════════════════════════════════════════════════════');
console.log('');

// Initialize current directory
createSymlink();
const models = findModels();

let modelName = command;
if (!modelName) {
  if (models.length === 0) {
    console.error('No .js files found in current directory.');
    console.error('Create a model file first, then run: jscad-work <model-name>');
    process.exit(1);
  }
  modelName = models[0];
  console.log(`Using first model found: ${modelName}`);
}

if (!modelName.endsWith('.js')) {
  modelName = `${modelName}.js`;
}

const modelPath = resolve(cwd, modelName);
if (!existsSync(modelPath)) {
  console.log(`Creating new model: ${modelName}`);
  const templateContent = `/**
 * ${modelName.replace('.js', '')}
 *
 * Description: [Add description here]
 */

const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = '${modelName.replace('.js', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, step: 1, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
`;
  writeFileSync(modelPath, templateContent);
  console.log(`✓ Created ${modelName} from template`);
}

createClaudeMd(modelName);
const config = createConfig(modelName);

// Check if viewer is running, start if needed
const viewerRunning = isViewerRunning();
if (!viewerRunning) {
  console.log('Viewer not detected on port 5120');
  if (startViewerBackground()) {
    console.log('Waiting 3 seconds for viewer to start...');
    // Give viewer time to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
} else {
  console.log('✓ Viewer already running on port 5120');
}

// Open in browser (prefer Chrome)
console.log('');
openInBrowser(config.viewerUrl);

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Working on: ${modelName}`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log(`  ✓ Model: ${modelName}`);
console.log(`  ✓ Viewer: ${config.viewerUrl}`);
console.log(`  ✓ Browser: Opening automatically`);
console.log('');
console.log('  Next: Start NEW Claude Code session in this directory:');
console.log(`     cd ${cwd}`);
console.log('     claude-code');
console.log('');
console.log('     (The new session will read CLAUDE.md automatically)');
console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('Available models in this directory:');
models.forEach(m => console.log(`  - ${m}`));
console.log('');

})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
