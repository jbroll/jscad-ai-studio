#!/usr/bin/env node

/**
 * Global command to work on JSCAD models from any directory
 *
 * Usage:
 *   jscad-work                    # Show help and list models
 *   jscad-work <model-name>       # Work on specific model
 *
 * Starts an HTTP server to serve model files. Claude navigates
 * to the viewer URL via Chrome DevTools MCP.
 */

import { existsSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { resolve as pathResolve, basename } from 'path';
import { createServer } from 'http';
import { request as httpsRequest } from 'https';
import { readFile } from 'fs/promises';

const UPSTREAM_HOST = 'jscad.rkroll.com';
const UPSTREAM_PORT = 443;

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


// MIME types for serving files
const MIME_TYPES = {
  // Code and data
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  // 3D model formats
  '.stl': 'model/stl',
  '.obj': 'text/plain',
  '.mtl': 'text/plain',
  '.3mf': 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml',
  '.amf': 'application/x-amf',
  '.dxf': 'application/dxf',
  '.svg': 'image/svg+xml',
  '.x3d': 'model/x3d+xml',
};

// Proxy request to upstream jscad.rkroll.com
const proxyToUpstream = (req, res, pathname) => {
  const options = {
    hostname: UPSTREAM_HOST,
    port: UPSTREAM_PORT,
    path: pathname,
    method: req.method,
    headers: {
      ...req.headers,
      host: UPSTREAM_HOST
    }
  };

  const proxyReq = httpsRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502);
    res.end('Proxy error');
  });

  req.pipe(proxyReq);
};

// Start HTTP server to serve model files + proxy jscadui
const startHttpServer = (directory) => {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = url.pathname;

      // Serve index.html with model hash for root
      if (pathname === '/') {
        proxyToUpstream(req, res, '/');
        return;
      }

      // Try to serve local file first
      const localPath = pathResolve(directory, '.' + pathname);
      try {
        const content = await readFile(localPath);
        const ext = localPath.substring(localPath.lastIndexOf('.'));
        const contentType = MIME_TYPES[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
        return;
      } catch (err) {
        // File doesn't exist locally, proxy to upstream
        if (err.code === 'ENOENT') {
          proxyToUpstream(req, res, pathname);
          return;
        }
        res.writeHead(500);
        res.end('Server error');
      }
    });

    // Listen on port 0 to get ephemeral port
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });

    server.on('error', reject);
  });
};


// Create JSCAD.md context file (always overwritten)
const createJscadMd = (currentModel, serverPort) => {
  const jscadMdPath = pathResolve(cwd, 'JSCAD.md');
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const viewerUrl = `${baseUrl}/#${currentModel}`;

  const content = `# JSCAD Context

**Current model**: ${currentModel}
**Viewer**: ${viewerUrl}

## Workflow for Claude

1. **Navigate browser** to the viewer URL above using \`mcp__chrome-devtools__navigate_page\`
2. **Edit model files** in this directory - changes are served immediately
3. **Reload browser** to see changes using \`mcp__chrome-devtools__navigate_page\` with \`type: "reload"\`

The local server proxies jscadui from jscad.rkroll.com and serves model files from this directory.

## API Reference

@url https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt

## Model Format

\`\`\`javascript
const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'Model Name';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
\`\`\`
`;

  writeFileSync(jscadMdPath, content);
  console.log('✓ Created JSCAD.md');
};

// Update CLAUDE.md to reference JSCAD.md
const updateClaudeMd = () => {
  const claudeMdPath = pathResolve(cwd, 'CLAUDE.md');
  const reference = '@file JSCAD.md';

  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf8');
    if (!content.includes(reference)) {
      writeFileSync(claudeMdPath, content.trimEnd() + '\n\n' + reference + '\n');
      console.log('✓ Updated CLAUDE.md to reference JSCAD.md');
    } else {
      console.log('✓ CLAUDE.md already references JSCAD.md');
    }
  } else {
    writeFileSync(claudeMdPath, reference + '\n');
    console.log('✓ Created CLAUDE.md referencing JSCAD.md');
  }
};

// Create .jscad-studio config
const createConfig = (modelName, serverPort) => {
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const config = {
    workspace: basename(cwd),
    currentModel: modelName,
    serverPort: serverPort,
    pid: process.pid,
    viewerUrl: `${baseUrl}/#${modelName}`
  };

  writeFileSync(pathResolve(cwd, '.jscad-studio'), JSON.stringify(config, null, 2));
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

const modelPath = pathResolve(cwd, modelName);
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

// Start HTTP server to serve model files
console.log('Starting HTTP server...');
const { server, port } = await startHttpServer(cwd);
console.log(`✓ HTTP server running on port ${port}`);

createJscadMd(modelName, port);
updateClaudeMd();
const config = createConfig(modelName, port);

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log(`  Working on: ${modelName}`);
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log(`  ✓ Model: ${modelName}`);
console.log(`  ✓ Server: http://127.0.0.1:${port}`);
console.log(`  ✓ Viewer: ${config.viewerUrl}`);
console.log('');
console.log('  Press Ctrl+C to stop the server.');
console.log('');
console.log('───────────────────────────────────────────────────────────');
console.log('  Start Claude with this prompt:');
console.log('');
console.log('  Read JSCAD.md and fetch the jscad-fluent API reference.');
console.log('');
console.log('═══════════════════════════════════════════════════════════');

// Keep process running
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
  process.exit(0);
});

})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
