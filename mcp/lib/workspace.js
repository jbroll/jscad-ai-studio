import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = ".jscad-studio";

// The generated prompts live in the user's model directory, so every repo file
// they point at must be an absolute path into this install.
export const STUDIO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const LLM_TXT = resolve(STUDIO_ROOT, "docs/reference/jscad-fluent-llm.txt");
export const WORKFLOW_DOC = resolve(STUDIO_ROOT, "docs/interactive-workflow.md");
export const TOOLS_DOC = resolve(STUDIO_ROOT, "mcp/README.md");
export const EXAMPLE_DIR = resolve(STUDIO_ROOT, "examples/motor-fun");

const LLM_TXT_URL = "https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt";

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

export const NOTES_MD = `# Design notes

Targets, decisions, and findings for this project. \`jscad-work\` never overwrites this file.

## Targets

<!-- Dimensions and fits the model must meet, e.g. "bore 22.0 mm, press fit on a 608 bearing". -->

## Decisions

## Printer and material

<!-- Printer, bed size, nozzle, material, print orientation. -->

## Open questions
`;

export const agentsMd = (modelName) => `# JSCAD AI Studio workspace

On startup, before anything else:

1. **Ensure the work server is running.** If \`.jscad-studio\` is missing or its \`pid\` is not
   alive, start the server detached in the background:
       nohup jscad-work ${modelName} > /tmp/jscad-work.log 2>&1 &
   (or the .js model in this directory), then wait until \`.jscad-studio\` exists.
   If that command is denied or fails, do not retry it. Ask the user to run
   \`jscad-work ${modelName}\` in another terminal and carry on: the headless MCP tools
   (\`eval\`, \`measure\`, \`check\`, \`render\`, \`export\`) work without the server. Only the
   browser tab and \`live_params\` need it.
2. **Read \`JSCAD.md\`** and complete its startup actions. It holds the modeling rules.
3. **Keep design notes in \`NOTES.md\`.** \`JSCAD.md\` is rewritten on every server start.

To stop the server when done: \`jscad-work stop\`.
`;

export const jscadMd = (modelName, serverPort) => {
  const viewerUrl = serverPort ? `http://127.0.0.1:${serverPort}/#${modelName}` : null;
  const viewer = viewerUrl ?? `not running (start it with \`jscad-work ${modelName}\`)`;
  const navigate = viewerUrl
    ? `\n4. **Navigate the browser** to \`${viewerUrl}\` if a browser tool is available.`
    : "";

  return `# JSCAD Context

**Current model**: ${modelName}
**Viewer**: ${viewer}

## Startup actions (do these now)

1. **Fetch the API reference**: \`@url ${LLM_TXT_URL}\`. If the fetch fails, read \`${LLM_TXT}\`.
2. **Read \`NOTES.md\`** for the project's targets and decisions. Record new ones there, not here.
3. **Read the current model**: \`${modelName}\`${navigate}

## Tools

- **Headless MCP** (no browser, no server): \`eval\`, \`params\`, \`measure\`, \`check\`, \`render\` (PNG from a \`view\` preset, with \`params\` overrides), \`export\`, \`parts\`.
- **Catalog**: \`library_search\` and \`library_get\` cover ~500 existing models (bearings, gears, motors, fasteners). Search before modeling a standard part.
- **Browser tab**: edits to served \`*.js\`/\`*.scad\` files reload it automatically. \`live_params\` pushes parameter values into it.
- Workflow: \`${WORKFLOW_DOC}\`. Tool inputs and results: \`${TOOLS_DOC}\`.

## Definition of done

1. After every edit: \`eval\` returns \`ok: true\`, then \`measure\` and compare \`dimensions\` with the target from the user or \`NOTES.md\`. Report target and measured values.
2. Before saying a change is done: \`check\` (\`empty: false\`; pass \`bed\` and require \`fitsBed: true\`), then \`render\` every view (\`front\`, \`back\`, \`left\`, \`right\`, \`top\`, \`bottom\`, \`iso\`) and look at each PNG.
3. \`check\` counts T-junctions left by booleans as \`openEdges\`, so \`watertight: false\` after a boolean is not proof of a defect. Compare \`openEdges\` and \`volume\` with the previous run.

## Design conventions

- Units are millimeters.
- Model each part in its own frame: mounting face or bed face on Z=0, main axis along Z, centered on X/Y. Assemblies place parts with \`rotate\`/\`translate\`.
- Every dimension derives from a named constant (\`NEMA17.boltSpacing\`) or a named clearance (\`CLEARANCES.platformToClip\`). No bare numbers in geometry calls.
- Reference pattern: \`${EXAMPLE_DIR}\`: \`constants.js\` (shared hardware sizes), \`layout.js\` (clearances and derived positions), part factories with presets (\`bearing.js\`: \`create(dims, p)\` with \`BEARING_608\`), and a standalone \`main\` in each part file.

## Parameters

\`main(p)\` receives a params proxy. Assigning an object with \`default\` declares a control; reading \`p.name\` returns the current value.

- \`p.width = { type: 'slider', default: 40, min: 10, max: 100, step: 1, label: 'Width' }\`
- Types: \`slider\`, \`int\`, \`number\` (\`float\` is an alias), \`checkbox\`, \`choice\` and \`radio\` (need \`values: [...]\`, optional \`captions\`), \`color\` (hex string), \`text\`, \`date\`, \`email\`, \`url\`, \`password\`. Without \`type\`: \`values\` gives \`choice\`, a fractional \`step\` gives \`number\`, otherwise the \`default\` decides (boolean, integer, other number, string). Array defaults get no control.
- A plain value (\`p.width = 40\`) shows as read-only. Use it only to pass a computed value into a sub-part.
- \`p.motor\` is a child proxy: pass it to a part factory (\`nema17.motor(p.motor)\`) to get a nested group. Override nested values with dotted names (\`{ 'motor.stackHeight': 30 }\`).
- \`p._type = 'NEMA 17 Motor'\` labels the group. Names starting with \`_\` are hidden. \`p._class = 'wheel'\` links parts with the same \`_type\` so an edit to one applies to all.
- \`live\`: sliders are live by default, re-running the whole model on each drag step (50 ms debounce). Set \`live: false\` when \`main\` takes more than ~100 ms so it runs on release.

## 3D printing (FDM, 0.4 mm nozzle)

- Fit clearance per side: 0.1 mm press, 0.2 mm sliding, 0.3-0.4 mm for print-in-place moving parts. Keep each in a named constant.
- Overhangs up to 45° from vertical and bridges up to 10 mm print without support. Horizontal holes over 8 mm: teardrop or flat-topped.
- Minimum wall 1.2 mm (three perimeters), 2 mm or more for load-bearing walls. Chamfer bed-side edges instead of filleting them.
- Screw clearance holes: M2 2.4, M2.5 2.9, M3 3.4, M4 4.5, M5 5.5 mm. Thread-forming into plastic: M2 1.7, M3 2.5, M4 3.3 mm. Nut traps: across-flats + 0.3 mm (M3: 5.8 mm).
- Heat-set insert holes: M2 3.2, M3 4.0, M4 5.6, M5 6.4 mm, depth = insert length + 1 mm, 2 mm wall around the insert.
- Orientation: largest flat face on the bed. Layers are weakest in Z, so do not load thin features across layer lines. Holes along Z print round.

## API hazards

- Angles are radians (\`Math.PI / 2\`). Colors are 0-1. Boolean inputs must all be 2D or all 3D. Operations return new objects.
- Extend cutters 0.5 mm past every face they cut through, and overlap unioned parts instead of letting them touch. Coincident faces can leave zero-thickness skins, and solids touching only along an edge give a non-manifold edge.
- \`segments\` is expensive. Cylinder polygons grow linearly with it, sphere and torus polygons with its square, and boolean time faster still: 25 holes in a plate took 0.2 s at 64, 0.8 s at 128, 3.5 s at 256; a hollow sphere took 3.6 s at 128. \`eval\` times out at 10 s. Use one \`SEGMENTS\` constant: 32-64, up to 128 for large visible curves.
- Degenerate booleans: zero sizes throw (\`height must be greater then zero\`). \`intersect\` of solids that do not overlap returns empty geometry without an error (\`measure\` gives \`dimensions: [0, 0, 0]\`), and a \`subtract\` whose cutter misses silently changes nothing. Give size parameters a \`min\` above zero and confirm \`volume\` changed after a cut.
- OpenSCAD \`.scad\` files are first-class (\`require('./part.scad')\`), but take no parameter overrides.
`;
};

const firstModel = (cwd) =>
  readdirSync(cwd)
    .filter((f) => f.endsWith(".js") && !f.startsWith("."))
    .sort()[0];

// Returns true when NOTES.md was created. An existing file holds the user's notes.
export const ensureNotes = (cwd) => {
  const path = resolve(cwd, "NOTES.md");
  if (existsSync(path)) return false;
  writeFileSync(path, NOTES_MD);
  return true;
};

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

  if (ensureNotes(cwd)) created.push("NOTES.md");
  else kept.push("NOTES.md");

  // A running server's JSCAD.md carries the live viewer URL. Otherwise write one
  // now so the rules are readable even if the agent cannot start the server.
  if (!isServerRunning(cwd)) {
    writeFileSync(resolve(cwd, "JSCAD.md"), jscadMd(modelName, null));
    created.push("JSCAD.md");
  }
  return { model: modelName, created, kept };
};
