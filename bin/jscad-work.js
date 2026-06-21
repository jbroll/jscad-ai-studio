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

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve as pathResolve } from "node:path";
import { startViewerServer } from "../mcp/lib/viewer-server.js";

const cwd = process.cwd();
const args = process.argv.slice(2);
const command = args[0];

// Find .js files in current directory
const findModels = () => {
  if (!existsSync(cwd)) return [];
  return readdirSync(cwd)
    .filter((f) => f.endsWith(".js") && !f.startsWith("."))
    .sort();
};

// Create JSCAD.md context file (always overwritten)
const createJscadMd = (currentModel, serverPort) => {
  const jscadMdPath = pathResolve(cwd, "JSCAD.md");
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const viewerUrl = `${baseUrl}/#${currentModel}`;

  const content = `# JSCAD Context

**Current model**: ${currentModel}
**Viewer**: ${viewerUrl}

## Startup Actions (do these now)

1. **Fetch API reference**: \`@url https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt\` (condensed for AI agents - complete as-is)
2. **Read current model**: \`${currentModel}\`
3. **Navigate browser** to viewer: \`${viewerUrl}\` (no snapshot needed if navigation succeeds)

## Edit-Preview Workflow

1. **Edit model files** in this directory - changes are served immediately
2. **Reload browser** to see changes using \`mcp__chrome-devtools__navigate_page\` with \`type: "reload"\`
- **Inner loop (no browser)**: use the jscad-studio MCP tools — \`eval\` to catch errors, \`measure\` to verify dimensions, \`render\` for a PNG — then reload the browser only for final visual confirmation.

## Key Constraints

- **Angles**: Always radians, use \`Math.PI\` (e.g., \`Math.PI / 2\` for 90°)
- **Colors**: 0-1 range, not 0-255 (e.g., \`[0.3, 0.6, 0.8]\`)
- **Booleans**: All inputs must be same type (all 2D or all 3D)
- **Immutable**: All operations return new objects
`;

  writeFileSync(jscadMdPath, content);
  console.log("✓ Created JSCAD.md");
};

// Create .jscad-studio config
const createConfig = (modelName, serverPort) => {
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  const config = {
    workspace: basename(cwd),
    currentModel: modelName,
    serverPort: serverPort,
    pid: process.pid,
    viewerUrl: `${baseUrl}/#${modelName}`,
  };

  writeFileSync(pathResolve(cwd, ".jscad-studio"), JSON.stringify(config, null, 2));
  console.log(`✓ Created .jscad-studio config`);
  return config;
};

// Main command logic (async IIFE to support await)
(async () => {
  if (!command) {
    console.log("Usage:");
    console.log("  jscad-work <model.js>     Create/work on model");
    console.log("");
    console.log("Example:");
    console.log("  jscad-work my-gear.js     Create new model or work on existing");
    console.log("");
    const models = findModels();
    if (models.length > 0) {
      console.log("Models in current directory:");
      models.forEach((m) => {
        console.log(`  - ${m}`);
      });
    } else {
      console.log("No .js models found in current directory.");
    }
    process.exit(0);
  }

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  JSCAD AI Studio - Work Mode");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");

  const models = findModels();

  let modelName = command;
  if (!modelName) {
    if (models.length === 0) {
      console.error("No .js files found in current directory.");
      console.error("Create a model file first, then run: jscad-work <model-name>");
      process.exit(1);
    }
    modelName = models[0];
    console.log(`Using first model found: ${modelName}`);
  }

  if (!modelName.endsWith(".js")) {
    modelName = `${modelName}.js`;
  }

  const modelPath = pathResolve(cwd, modelName);
  if (!existsSync(modelPath)) {
    console.log(`Creating new model: ${modelName}`);
    const templateContent = `/**
 * ${modelName.replace(".js", "")}
 *
 * Description: [Add description here]
 */

const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = '${modelName
    .replace(".js", "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())}';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, step: 1, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
`;
    writeFileSync(modelPath, templateContent);
    console.log(`✓ Created ${modelName} from template`);
  }

  // Start HTTP server to serve model files
  console.log("Starting HTTP server...");
  const { server, port } = await startViewerServer(cwd);
  console.log(`✓ HTTP server running on port ${port}`);

  createJscadMd(modelName, port);
  const config = createConfig(modelName, port);

  console.log("");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Working on: ${modelName}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("");
  console.log(`  ✓ Model: ${modelName}`);
  console.log(`  ✓ Server: http://127.0.0.1:${port}`);
  console.log(`  ✓ Viewer: ${config.viewerUrl}`);
  console.log("");
  console.log("  Press Ctrl+C to stop the server.");
  console.log("");
  console.log("───────────────────────────────────────────────────────────");
  console.log("  Start Claude with this prompt:");
  console.log("");
  console.log("  Read ./JSCAD.md and complete the startup actions.");
  console.log("");
  console.log("═══════════════════════════════════════════════════════════");

  // Keep process running
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    server.close();
    process.exit(0);
  });
})().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
