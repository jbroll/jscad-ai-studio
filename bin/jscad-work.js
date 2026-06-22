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
import {
  isServerRunning,
  modelTemplate,
  readConfig,
  scaffoldWorkspace,
  stopServer,
} from "../mcp/lib/workspace.js";

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

## Two Loops (same files, same server)

Both loops read from the same directory via this viewer-server:

- **Interactive loop** — your browser tab at ${viewerUrl} — drag to orbit, scrub sliders, reload to pick up edits.
- **Headless MCP loop** — \`eval\` to catch errors fast, \`measure\` to verify dimensions, \`render\` to snapshot a PNG from any view preset (with \`params\` overrides) — no browser reload needed.
- **Bridge** — \`live_params\` pushes parameter overrides into your OPEN browser tab live (the model updates in front of the user), so both loops share one view.

Use the headless loop for rapid iteration, drive the open tab with \`live_params\` for collaborative review, then switch to the browser for final inspection.

## Edit-Preview Workflow

1. **Edit model files** in this directory - changes are served immediately
2. **Reload browser** to see changes using \`mcp__chrome-devtools__navigate_page\` with \`type: "reload"\`
- **Inner loop (no browser)**: use the jscad-studio MCP tools — \`eval\` to catch errors, \`measure\` to verify dimensions, \`render\` for a PNG — then reload the browser only for final visual confirmation.

## Key Constraints

- **Angles**: Always radians, use \`Math.PI\` (e.g., \`Math.PI / 2\` for 90°)
- **Colors**: 0-1 range, not 0-255 (e.g., \`[0.3, 0.6, 0.8]\`)
- **Booleans**: All inputs must be same type (all 2D or all 3D)
- **Immutable**: All operations return new objects
- **OpenSCAD parts**: .scad files are first-class — eval/measure/export/check/render work, and any model can \`require('./part.scad')\` to compose OpenSCAD and jscad-fluent parts.
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
  if (command === "init") {
    const res = scaffoldWorkspace(cwd, args[1] === "--force" ? undefined : args[1], {
      force: args.includes("--force"),
    });
    for (const f of res.created) console.log(`✓ created ${f}`);
    for (const f of res.kept) console.log(`• kept existing ${f}`);
    console.log(`\nModel: ${res.model}`);
    console.log("Now run:  claude        (or: opencode)");
    console.log("The agent reads AGENTS.md, starts the server in the background, and begins.");
    process.exit(0);
  }

  if (command === "stop") {
    const res = stopServer(cwd);
    if (res.status === "stopped")
      console.log(`✓ stopped server (pid ${res.pid}, port ${res.port})`);
    else if (res.status === "stale")
      console.log("• removed stale .jscad-studio (server was not running)");
    else console.log("no running server");
    process.exit(0);
  }

  if (!command) {
    console.log("Usage:");
    console.log(
      "  jscad-work init [model.js]   Scaffold AGENTS.md/CLAUDE.md + starter model (one-time)",
    );
    console.log("  jscad-work <model.js>        Start the work server for a model");
    console.log("  jscad-work stop              Stop the running server");
    console.log("");
    console.log(
      "Single-command flow:  jscad-work init   then   claude   (agent starts the server)",
    );
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
    writeFileSync(modelPath, modelTemplate(modelName));
    console.log(`✓ Created ${modelName} from template`);
  }

  if (isServerRunning(cwd)) {
    const cfg = readConfig(cwd);
    console.log(`✓ server already running on port ${cfg.serverPort} (${cfg.viewerUrl})`);
    console.log("  Reusing it. Run 'jscad-work stop' to stop it.");
    process.exit(0);
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
  console.log("  This server is running in the foreground (Ctrl+C to stop).");
  console.log("  For single-command startup instead: jscad-work init, then run claude.");
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
