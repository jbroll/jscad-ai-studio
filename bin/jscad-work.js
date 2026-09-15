#!/usr/bin/env node

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { basename, resolve as pathResolve } from "node:path";
import { commandSummary, runCli, SUBCOMMANDS } from "../lib/cli.js";
import { startViewerServer } from "../lib/viewer-server.js";
import {
  ALLOW_RULE,
  ensureNotes,
  isServerRunning,
  jscadMd,
  modelTemplate,
  readConfig,
  STUDIO_ROOT,
  scaffoldWorkspace,
  stopServer,
} from "../lib/workspace.js";

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

// JSCAD.md is always overwritten; NOTES.md is created once and never touched again.
const createJscadMd = (currentModel, serverPort) => {
  writeFileSync(pathResolve(cwd, "JSCAD.md"), jscadMd(currentModel, serverPort));
  console.log("✓ Created JSCAD.md");
  if (ensureNotes(cwd)) console.log("✓ Created NOTES.md");
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
  // process.exitCode rather than process.exit(), so large JSON on a pipe is not cut off.
  if (SUBCOMMANDS.has(command)) {
    process.exitCode = await runCli(args);
    return;
  }

  if (command === "init") {
    const modelArg = args.slice(1).find((a) => a !== "--force");
    const res = scaffoldWorkspace(cwd, modelArg, { force: args.includes("--force") });
    for (const f of res.created) console.log(`✓ created ${f}`);
    for (const f of res.kept) console.log(`• kept existing ${f}`);
    if (res.allowRule === "present")
      console.log(`• .claude/settings.json already allows ${ALLOW_RULE}`);
    else console.log(`✓ .claude/settings.json allows ${ALLOW_RULE}`);
    for (const r of res.localPackageEnv) {
      if (r.status === "set") console.log(`✓ .claude/settings.json sets env.${r.name}`);
      else if (r.status === "kept")
        console.log(`• .claude/settings.json already sets env.${r.name}`);
      else
        console.log(
          `• env.${r.name} not set: ${r.files.join(", ")} missing (npm run build:siblings builds it)`,
        );
    }
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

  // The Claude Code marketplace entry runs this to find the plugin directory.
  if (command === "plugin-root") {
    console.log(STUDIO_ROOT);
    process.exit(0);
  }

  if (!command) {
    console.log("Usage:");
    console.log(
      "  jscad-work init [model.js]   Scaffold AGENTS.md/CLAUDE.md + starter model (one-time)",
    );
    console.log("  jscad-work <model.js>        Start the work server for a model");
    console.log("  jscad-work stop              Stop the running server");
    console.log("  jscad-work plugin-root       Print the Claude Code plugin directory");
    console.log("");
    console.log("Model tools (JSON on stdout; add --help to any of them):");
    for (const line of commandSummary()) console.log(line);
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

  let modelName = command;
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
  const { server, port, localPackages } = await startViewerServer(cwd);
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
  for (const pkg of localPackages)
    console.log(`  ✓ Local package: ${pkg.name} (${pkg.dir}/${pkg.file})`);
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
