import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const CONFIG = ".jscad-studio";

export const CLAUDE_MD = "@file AGENTS.md\n";

export const readConfig = (cwd) => {
  const path = resolve(cwd, CONFIG);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

const pidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM"; // exists but owned by another user
  }
};

export const isServerRunning = (cwd) => {
  const cfg = readConfig(cwd);
  return !!cfg && pidAlive(cfg.pid);
};

export const stopServer = (cwd) => {
  const cfg = readConfig(cwd);
  const path = resolve(cwd, CONFIG);
  if (!cfg) return { status: "none" };
  const alive = pidAlive(cfg.pid);
  if (alive) {
    try {
      process.kill(cfg.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  if (existsSync(path)) unlinkSync(path);
  return alive
    ? { status: "stopped", pid: cfg.pid, port: cfg.serverPort }
    : { status: "stale", pid: cfg.pid };
};

const titleCase = (name) =>
  name
    .replace(/\.js$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

export const modelTemplate = (name) => `/**
 * ${name.replace(/\.js$/, "")}
 *
 * Description: [Add description here]
 */

const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = '${titleCase(name)}';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, step: 1, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
`;

export const agentsMd = (modelName) => `# JSCAD AI Studio workspace

On startup, before anything else:

1. **Ensure the work server is running.** Check \`.jscad-studio\`: if it is missing,
   or its \`pid\` is not alive, start the server DETACHED in the background:
       nohup jscad-work ${modelName} > /tmp/jscad-work.log 2>&1 &
   (or the .js model in this directory). Then wait until \`JSCAD.md\` exists — the
   server writes it on startup.
2. **Read \`JSCAD.md\`** and complete its startup actions.

Reference: jscad-fluent API — https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt

Key constraints: angles in radians (\`Math.PI\`); colors 0–1; boolean inputs same-type; operations are immutable. OpenSCAD \`.scad\` parts are first-class (\`require('./part.scad')\`).

To stop the server when done: \`jscad-work stop\`.
`;

const firstModel = (cwd) =>
  readdirSync(cwd)
    .filter((f) => f.endsWith(".js") && !f.startsWith("."))
    .sort()[0];

export const scaffoldWorkspace = (cwd, model, { force = false } = {}) => {
  const created = [];
  const kept = [];
  let modelName = model || firstModel(cwd) || "model.js";
  if (!modelName.endsWith(".js")) modelName = `${modelName}.js`;

  const modelPath = resolve(cwd, modelName);
  if (!existsSync(modelPath)) {
    writeFileSync(modelPath, modelTemplate(modelName));
    created.push(modelName);
  }

  for (const [file, content] of [
    ["AGENTS.md", agentsMd(modelName)],
    ["CLAUDE.md", CLAUDE_MD],
  ]) {
    const path = resolve(cwd, file);
    if (existsSync(path) && !force) {
      kept.push(file);
    } else {
      writeFileSync(path, content);
      created.push(file);
    }
  }
  return { model: modelName, created, kept };
};
