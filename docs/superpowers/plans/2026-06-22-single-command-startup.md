# Single-Command Startup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce startup to a single command — after a one-time `jscad-work init`, the user runs only `claude`/`opencode` and the agent starts the work server itself.

**Architecture:** Extract the testable workspace logic (server-alive guard, scaffold, stop, templates) into `mcp/lib/workspace.js`. `bin/jscad-work.js` gains `init` and `stop` subcommands and an idempotent guard, and keeps the server lifecycle. `init` scaffolds `AGENTS.md` (bootstrap pointer) + `CLAUDE.md` (`@file AGENTS.md`) + a starter model; the agent reads AGENTS.md and starts `jscad-work` detached (`nohup … &`).

**Tech Stack:** Node 22 ESM; `node:fs`, `node:child_process`, `process.kill(pid, 0)` for liveness; vitest.

## Global Constraints

- **ESM** (`"type":"module"`). Node built-ins only — no new dependencies.
- **`.jscad-studio`** JSON shape (written by run-mode): `{ workspace, currentModel, serverPort, pid, viewerUrl }`. The guard/stop read `serverPort` + `pid`.
- **Liveness check:** `process.kill(pid, 0)` — returns normally if alive, throws `ESRCH` if dead (→ not running), `EPERM` if owned by another user (→ treat as running).
- **Detached launch is OS-level** (`nohup jscad-work <model> > /tmp/jscad-work.log 2>&1 &`) so Claude Code and OpenCode behave identically; the server persists across agent sessions until `jscad-work stop`.
- **Scaffold is non-clobbering:** never overwrite an existing `AGENTS.md`/`CLAUDE.md` unless `--force`; create a starter model only if the dir has no `*.js` model.
- **`AGENTS.md`/`CLAUDE.md`/`JSCAD.md`/`.jscad-studio`** are workspace artifacts. `JSCAD.md` and `.jscad-studio` are already git-ignored. (The scaffolded `AGENTS.md`/`CLAUDE.md` live in the *user's* model dir, not this repo — no repo .gitignore change needed.)
- **Hygiene:** every commit passes org-hooks Lefthook AND `npm run knip` (run knip manually — the TS-glob hook does not gate this JS repo). `npm test` = `vitest run`.

## File Structure

| File | Responsibility |
|---|---|
| `mcp/lib/workspace.js` (create) | `readConfig`, `isServerRunning`, `stopServer`, `scaffoldWorkspace`, `modelTemplate`, `agentsMd`, `CLAUDE_MD`. Pure/testable; no server start. |
| `test/workspace.test.js` (create) | unit tests for the above (guard, scaffold, stop). |
| `bin/jscad-work.js` (modify) | dispatch `init`/`stop`/run; idempotent guard; reuse `modelTemplate`; updated help/prompt. |
| `README.md` (modify) | lead with the single-command flow; document `init`/`stop` + persistent server. |

---

### Task 1: `workspace.js` — guard, scaffold, stop, templates

**Files:**
- Create: `mcp/lib/workspace.js`, `test/workspace.test.js`

**Interfaces:**
- Produces:
  - `readConfig(cwd) => object | null` — parse `<cwd>/.jscad-studio`; `null` if missing/malformed.
  - `isServerRunning(cwd) => boolean` — true iff config exists and `config.pid` is alive.
  - `stopServer(cwd) => { status: "stopped" | "stale" | "none", pid?, port? }` — kill a live pid + remove the file (`stopped`); remove file for a dead pid (`stale`); no file → `none`.
  - `scaffoldWorkspace(cwd, model, { force = false } = {}) => { model, created: string[], kept: string[] }` — resolve the model name, create starter model if no `*.js` present, write `AGENTS.md`/`CLAUDE.md` (skip existing unless `force`).
  - `modelTemplate(name) => string`, `agentsMd(modelName) => string`, `CLAUDE_MD` (string `"@file AGENTS.md\n"`).

- [ ] **Step 1: Write the failing test `test/workspace.test.js`**

```js
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  CLAUDE_MD,
  agentsMd,
  isServerRunning,
  modelTemplate,
  scaffoldWorkspace,
  stopServer,
} from "../mcp/lib/workspace.js";

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "ws-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const writeCfg = (dir, pid) =>
  writeFileSync(join(dir, ".jscad-studio"), JSON.stringify({ serverPort: 1234, pid }));

test("isServerRunning: true for a live pid, false for missing/dead/malformed", () => {
  const a = tmp();
  expect(isServerRunning(a)).toBe(false); // no file
  writeCfg(a, process.pid);
  expect(isServerRunning(a)).toBe(true); // this process is alive
  const b = tmp();
  writeFileSync(join(b, ".jscad-studio"), "not json");
  expect(isServerRunning(b)).toBe(false); // malformed
});

test("isServerRunning: false for a dead pid", async () => {
  const dir = tmp();
  const child = spawn("node", ["-e", "setTimeout(()=>{},100000)"]);
  await new Promise((r) => setTimeout(r, 50));
  const pid = child.pid;
  child.kill("SIGKILL");
  await new Promise((r) => child.on("exit", r));
  writeCfg(dir, pid);
  expect(isServerRunning(dir)).toBe(false);
});

test("stopServer: kills a live pid and removes the file", async () => {
  const dir = tmp();
  const child = spawn("node", ["-e", "setTimeout(()=>{},100000)"]);
  await new Promise((r) => setTimeout(r, 50));
  writeCfg(dir, child.pid);
  const res = stopServer(dir);
  expect(res.status).toBe("stopped");
  expect(existsSync(join(dir, ".jscad-studio"))).toBe(false);
  await new Promise((r) => setTimeout(r, 50));
  expect(child.killed || child.exitCode !== null || child.signalCode !== null).toBe(true);
});

test("stopServer: none when no config, stale when pid dead", () => {
  const dir = tmp();
  expect(stopServer(dir).status).toBe("none");
  writeCfg(dir, 2 ** 30); // implausible pid
  expect(stopServer(dir).status).toBe("stale");
  expect(existsSync(join(dir, ".jscad-studio"))).toBe(false);
});

test("scaffoldWorkspace: writes AGENTS.md, CLAUDE.md, and a starter model in an empty dir", () => {
  const dir = tmp();
  const res = scaffoldWorkspace(dir, "widget.js");
  expect(res.model).toBe("widget.js");
  expect(res.created.sort()).toEqual(["AGENTS.md", "CLAUDE.md", "widget.js"]);
  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(CLAUDE_MD);
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  expect(agents).toMatch(/nohup jscad-work widget\.js/);
  expect(agents).toMatch(/Read `JSCAD\.md`/);
  expect(readFileSync(join(dir, "widget.js"), "utf8")).toMatch(/module\.exports = \{ main \}/);
});

test("scaffoldWorkspace: keeps existing pointer files and reuses an existing model", () => {
  const dir = tmp();
  writeFileSync(join(dir, "AGENTS.md"), "MINE");
  writeFileSync(join(dir, "gear.js"), "// existing");
  const res = scaffoldWorkspace(dir); // no model arg → use existing gear.js
  expect(res.model).toBe("gear.js");
  expect(res.kept).toContain("AGENTS.md");
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("MINE"); // not clobbered
  expect(res.created).toContain("CLAUDE.md"); // CLAUDE.md was absent → created
  expect(res.created).not.toContain("gear.js"); // existing model not recreated
});

test("scaffoldWorkspace --force overwrites pointer files", () => {
  const dir = tmp();
  writeFileSync(join(dir, "AGENTS.md"), "MINE");
  const res = scaffoldWorkspace(dir, "m.js", { force: true });
  expect(res.created).toContain("AGENTS.md");
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).not.toBe("MINE");
});

test("modelTemplate + agentsMd contain the essentials", () => {
  expect(modelTemplate("my-part.js")).toMatch(/require\('@jbroll\/jscad-fluent'\)/);
  expect(agentsMd("m.js")).toMatch(/jscad-work stop/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/workspace.test.js`
Expected: FAIL ("Cannot find module '../mcp/lib/workspace.js'").

- [ ] **Step 3: Create `mcp/lib/workspace.js`**

```js
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/workspace.test.js` → PASS (8).
Run: `npm test` → green; `npm run knip` → clean (all exports consumed by the test now, and by bin/jscad-work.js after Task 2).

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/workspace.js test/workspace.test.js
git commit -m "feat(startup): workspace module — server guard, scaffold, stop, templates"
```

---

### Task 2: `jscad-work` CLI — `init`, `stop`, idempotent guard

**Files:**
- Modify: `bin/jscad-work.js`

**Interfaces:**
- Consumes: `isServerRunning`, `stopServer`, `scaffoldWorkspace`, `modelTemplate` from `mcp/lib/workspace.js`.

- [ ] **Step 1: Import the workspace helpers**

At the top of `bin/jscad-work.js`, add to the imports:
```js
import { isServerRunning, modelTemplate, scaffoldWorkspace, stopServer } from "../mcp/lib/workspace.js";
```

- [ ] **Step 2: Add `init` and `stop` dispatch + the guard**

Replace the no-arg help block and add command handling at the top of the async IIFE (after `const models = ...` is computed, but the simplest is to branch on `command` first). Insert this near the start of the IIFE, before the "Work Mode" banner:
```js
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
  if (res.status === "stopped") console.log(`✓ stopped server (pid ${res.pid}, port ${res.port})`);
  else if (res.status === "stale") console.log("• removed stale .jscad-studio (server was not running)");
  else console.log("no running server");
  process.exit(0);
}
```

- [ ] **Step 3: Idempotent guard in run mode**

After `modelName` is finalized (right before `console.log("Starting HTTP server...")` at the current line ~163), add:
```js
if (isServerRunning(cwd)) {
  const { readConfig } = await import("../mcp/lib/workspace.js");
  const cfg = readConfig(cwd);
  console.log(`✓ server already running on port ${cfg.serverPort} (${cfg.viewerUrl})`);
  console.log("  Reusing it. Run 'jscad-work stop' to stop it.");
  process.exit(0);
}
```
(Importing `readConfig` lazily here keeps the top import line short; alternatively add `readConfig` to the Step-1 import — either is fine, prefer adding it to the Step-1 import list and dropping the dynamic import.)

- [ ] **Step 4: DRY the starter-model template**

Replace the inline `templateContent` literal in run mode (current lines ~139-158) with the shared helper:
```js
const modelPath = pathResolve(cwd, modelName);
if (!existsSync(modelPath)) {
  console.log(`Creating new model: ${modelName}`);
  writeFileSync(modelPath, modelTemplate(modelName));
  console.log(`✓ Created ${modelName} from template`);
}
```

- [ ] **Step 5: Update help + the printed prompt**

Update the no-`command` help block to mention the new flow:
```js
if (!command) {
  console.log("Usage:");
  console.log("  jscad-work init [model.js]   Scaffold AGENTS.md/CLAUDE.md + starter model (one-time)");
  console.log("  jscad-work <model.js>        Start the work server for a model");
  console.log("  jscad-work stop              Stop the running server");
  console.log("");
  console.log("Single-command flow:  jscad-work init   then   claude   (agent starts the server)");
  // ...keep the existing 'Models in current directory' listing below...
```
And in the run-mode footer, replace the "Start Claude with this prompt" lines with:
```js
console.log("  This server is running in the foreground (Ctrl+C to stop).");
console.log("  For single-command startup instead: jscad-work init, then run claude.");
```

- [ ] **Step 6: Verify the CLI end-to-end (manual, in a temp dir)**

```bash
T=$(mktemp -d); ( cd "$T" && node /home/john/src/jscad-ai-studio/bin/jscad-work.js init demo.js )
ls "$T"                      # AGENTS.md CLAUDE.md demo.js
cat "$T/CLAUDE.md"           # @file AGENTS.md
grep -q "nohup jscad-work demo.js" "$T/AGENTS.md" && echo "AGENTS bootstrap OK"
( cd "$T" && node /home/john/src/jscad-ai-studio/bin/jscad-work.js stop )   # "no running server"
rm -rf "$T"
```
Expected: files scaffolded; CLAUDE.md is `@file AGENTS.md`; AGENTS.md has the bootstrap line; `stop` reports no server. Run `npm test` (green) and `npm run knip` (clean — `modelTemplate`/guard/scaffold/stop now all consumed).

- [ ] **Step 7: Commit**

```bash
git add bin/jscad-work.js
git commit -m "feat(startup): jscad-work init/stop + idempotent server guard"
```

---

### Task 3: README — single-command flow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Lead the Operating instructions with the single-command flow**

In `README.md` under "## Operating instructions", make "Starting work" present the single-command flow first, keeping the explicit two-terminal flow as an alternative. Replace the start of that subsection with:
```markdown
### Starting work (single command)

One-time per workspace, scaffold the agent pointer + a starter model:
```bash
jscad-work init my-model.js
```
Then just start your agent — no second terminal, no typed prompt:
```bash
claude        # or: opencode
```
`init` writes `AGENTS.md` (the startup pointer, auto-loaded by Claude Code and OpenCode) and `CLAUDE.md` (`@file AGENTS.md`). On startup the agent reads it, starts the `jscad-work` server **in the background** if one isn't already running, then reads `JSCAD.md` and begins. The server persists across sessions; stop it with:
```bash
jscad-work stop
```

### Starting work (explicit two terminals)

If you prefer to run the server yourself:
```

Keep the existing two-terminal instructions (Terminal 1 `jscad-work my-model.js`, Terminal 2 `claude` + the "Read ./JSCAD.md" prompt) as the body of this second subsection.
```

- [ ] **Step 2: Update the "Resuming work" subsection**

Add a sentence to the existing "Resuming work" subsection noting the single-command path:
```markdown
- With the single-command flow, just re-run `claude`/`opencode`: the agent reuses a live server (idempotent) or starts a fresh one. Use `jscad-work stop` to tear the server down.
```

- [ ] **Step 3: Verify links + commit**

Confirm the doc renders (no broken fences). Run `lefthook run pre-commit` (docs hooks pass).
```bash
git add README.md
git commit -m "docs(readme): lead with single-command startup (jscad-work init + agent bootstrap)"
```

---

## Self-Review

**Spec coverage:**
- `jscad-work init` scaffolding (AGENTS.md + CLAUDE.md + starter model, non-clobber, `--force`) → Task 1 `scaffoldWorkspace` + Task 2 dispatch. ✓
- AGENTS.md bootstrap content (detached `nohup` launch + read JSCAD.md + constraints + stop) → Task 1 `agentsMd`. ✓
- Idempotent live-server guard → Task 1 `isServerRunning` + Task 2 Step 3. ✓
- `jscad-work stop` → Task 1 `stopServer` + Task 2 dispatch. ✓
- Testable `workspace.js` module → Task 1. ✓
- README update → Task 3. ✓
- Liveness via `process.kill(pid,0)` (ESRCH/EPERM handling) → Task 1 `pidAlive`. ✓
- OpenCode parity (AGENTS.md + OS-level detach) → Task 1 `agentsMd` content; verified manually (no unit test for the live agent launch, per spec). ✓

**Placeholder scan:** none. Task 2 Step 6 is a real manual CLI verification (the CLI dispatch is thin; the logic it calls is unit-tested in Task 1).

**Type consistency:** `scaffoldWorkspace(cwd, model, {force})→{model,created,kept}`, `isServerRunning(cwd)→bool`, `stopServer(cwd)→{status,...}`, `modelTemplate(name)→string`, `agentsMd(modelName)→string`, `CLAUDE_MD` string — all used identically in Task 1 tests and Task 2 CLI. `.jscad-studio` `{serverPort,pid,viewerUrl}` written by run-mode (`createConfig`, unchanged) and read by `readConfig`/guard. Consistent.
