# Live-Reload on File Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a served `*.js`/`*.scad` file changes, push a reload to the connected viewer tab over the existing SSE bridge.

**Architecture:** `viewer-server.js` watches its served directory (`fs.watch` recursive, 150 ms debounce) and broadcasts `{ reload: true }` to SSE clients; the injected bridge calls `location.reload()`. The viewer restores its camera from `localStorage`, so the view is preserved. Plugin-only — no jscadui change.

**Tech Stack:** Node 22 ESM; `node:fs` `watch`; Server-Sent Events (existing); vitest.

## Global Constraints

- **ESM**, Node built-ins only (no new deps).
- **Reuse the existing E SSE channel:** `sseClients` set + `/__studio/events`. Reload frame wire format: `data: ` + `JSON.stringify({ reload: true })` + `\n\n`.
- **Watch scope:** react only to `*.js`/`*.scad`; ignore dotfiles (incl. `.jscad-studio`), `JSCAD.md`, and `null` filenames — so the watcher never self-triggers.
- **Debounce** ~150 ms to coalesce editor write-bursts into a single reload.
- **A failed/unsupported watcher must never break serving or `live_params`** — wrap watch setup in try/catch, log a warning, continue.
- **Watcher lifecycle:** closed on server `close`; debounce timer cleared on close.
- **Bridge:** a `reload` message calls `location.reload()` and takes precedence over `params`.
- Hygiene: commit passes Lefthook + `npm run knip` clean. `npm test` = `vitest run`.

## File Structure

| File | Responsibility |
|---|---|
| `mcp/lib/viewer-server.js` (modify) | `shouldReload(filename)` pure helper; `fs.watch` + debounce + reload broadcast in `startViewerServer`; `BRIDGE` reload branch. |
| `test/viewer-server.test.js` (modify) | add `shouldReload` cases + watch→SSE-reload + debounce + no-trigger tests. |
| `README.md`, `bin/jscad-work.js` (modify) | one-line note that served-file edits auto-reload the tab. |

---

### Task 1: Live-reload watcher + bridge reload branch

**Files:**
- Modify: `mcp/lib/viewer-server.js`, `test/viewer-server.test.js`, `README.md`, `bin/jscad-work.js`

**Interfaces:**
- Consumes: existing `sseClients`, `/__studio/events`, `injectBridge`, `startViewerServer(directory) => { server, port, viewerUrl }`.
- Produces: `shouldReload(filename) => boolean` (exported, pure); `startViewerServer` additionally watches `directory` and broadcasts `{reload:true}` on qualifying changes.

- [ ] **Step 1: Add the failing tests to `test/viewer-server.test.js`**

Append these tests (the file already imports from `../mcp/lib/viewer-server.js` and has `startViewerServer`; add `shouldReload` to the import):

```js
import { get } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldReload, startViewerServer } from "../mcp/lib/viewer-server.js";

test("shouldReload: true for js/scad, false for dotfiles/JSCAD.md/null", () => {
  expect(shouldReload("model.js")).toBe(true);
  expect(shouldReload("parts/bearing.scad")).toBe(true);
  expect(shouldReload(".jscad-studio")).toBe(false);
  expect(shouldReload("JSCAD.md")).toBe(false);
  expect(shouldReload(".hidden.js")).toBe(false);
  expect(shouldReload(null)).toBe(false);
});

// Collect SSE frames containing a substring, for `ms`, then resolve the matches.
const collectFrames = (port, match, ms) =>
  new Promise((resolve) => {
    const hits = [];
    const req = get({ host: "127.0.0.1", port, path: "/__studio/events" }, (res) => {
      res.setEncoding("utf8");
      res.on("data", (c) => { if (c.includes(match)) hits.push(c); });
    });
    setTimeout(() => { req.destroy(); resolve(hits); }, ms);
  });

test("editing a served .js file broadcasts a reload; editing .jscad-studio does not", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lr-"));
  const srv = await startViewerServer(dir);
  try {
    // .js change → exactly one reload (debounced) within the window
    const jsHits = collectFrames(srv.port, '"reload":true', 1200);
    await new Promise((r) => setTimeout(r, 150)); // let the SSE client connect
    writeFileSync(join(dir, "model.js"), "// v1");
    writeFileSync(join(dir, "model.js"), "// v2");
    writeFileSync(join(dir, "model.js"), "// v3");
    expect((await jsHits).length).toBe(1);

    // .jscad-studio change → no reload
    const cfgHits = collectFrames(srv.port, '"reload":true', 800);
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(join(dir, ".jscad-studio"), '{"pid":1}');
    expect((await cfgHits).length).toBe(0);
  } finally {
    srv.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/viewer-server.test.js`
Expected: FAIL (`shouldReload` is not exported; no reload frames are broadcast).

- [ ] **Step 3: Implement in `mcp/lib/viewer-server.js`**

(a) Add the `watch` import — change line 1 area to also import `watch`:
```js
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
```

(b) Extend the `BRIDGE` script with a reload branch (replace the existing `BRIDGE` const):
```js
const BRIDGE = `<script>(()=>{try{const es=new EventSource('/__studio/events');es.onmessage=(e)=>{try{const d=JSON.parse(e.data);if(d.reload){location.reload();return;}if(window.jscadStudio&&d.params)window.jscadStudio.setParams(d.params);}catch{}};}catch{}})()</script>`;
```

(c) Add the pure `shouldReload` helper (near `injectBridge`):
```js
export const shouldReload = (filename) => {
  if (!filename) return false;
  const base = filename.split("/").pop();
  if (base.startsWith(".") || base === "JSCAD.md") return false;
  return base.endsWith(".js") || base.endsWith(".scad");
};
```

(d) In `startViewerServer`, after `server.listen(...)` resolves (inside the `listen` callback, before/after `resolve(...)`), set up the watcher + debounced broadcast. Replace the `server.listen` block with:
```js
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();

      let reloadTimer = null;
      const scheduleReload = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          const frame = `data: ${JSON.stringify({ reload: true })}\n\n`;
          for (const client of sseClients) client.write(frame);
        }, 150);
      };
      let watcher = null;
      try {
        watcher = watch(directory, { recursive: true }, (_event, filename) => {
          if (shouldReload(filename)) scheduleReload();
        });
        watcher.on("error", (err) => console.error("file watch error:", err.message));
      } catch (err) {
        console.error("file watch unavailable, auto-reload disabled:", err.message);
      }
      server.on("close", () => {
        if (watcher) watcher.close();
        clearTimeout(reloadTimer);
      });

      resolve({ server, port, viewerUrl: (model) => `http://127.0.0.1:${port}/#${model}` });
    });
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/viewer-server.test.js` → PASS (existing E tests + the 2 new ones).
Run: `npm test` → green; `npm run knip` → clean (`shouldReload` consumed by the test).
Note: the watch test depends on `fs.watch` timing; if the single-reload assertion is flaky in the CI env, widen the collection window — but on Linux/Node 22 recursive watch is prompt and the 150 ms debounce + 1200 ms window are comfortable.

- [ ] **Step 5: Docs note**

In `README.md` under "### The two loops", add a bullet after the Browser bullet:
```markdown
- **Live-reload** — editing a served `*.js`/`*.scad` file auto-reloads the open tab (camera preserved) within ~150 ms; no manual reload needed.
```
In `bin/jscad-work.js`, in the `createJscadMd` template's "Edit-Preview Workflow" section, update step 2 to note auto-reload:
```js
console; // (template string) — change the "Reload browser" line to:
```
Specifically, replace the template line
`2. **Reload browser** to see changes using \`mcp__chrome-devtools__navigate_page\` with \`type: "reload"\``
with
`2. **Auto-reload**: edits to served \`*.js\`/\`*.scad\` files reload the open tab automatically (camera preserved). Manual reload (\`mcp__chrome-devtools__navigate_page\` \`type: "reload"\`) is only needed if the tab is disconnected.`

- [ ] **Step 6: Commit**

Run: `npm test` (green), `npm run knip` (clean), `lefthook run pre-commit` (clean).
```bash
git add mcp/lib/viewer-server.js test/viewer-server.test.js README.md bin/jscad-work.js
git commit -m "feat: live-reload — viewer-server watches served files, pushes reload over SSE"
```

---

## Self-Review

**Spec coverage:**
- Server-side `fs.watch` + debounce + `{reload:true}` broadcast → Step 3(d). ✓
- Bridge reload branch (`location.reload()`, precedence over params) → Step 3(b). ✓
- `shouldReload` watch-scope (js/scad only; ignore dotfiles/.jscad-studio/JSCAD.md/null) → Step 3(c) + tested Step 1. ✓
- Watcher never breaks serving (try/catch + log) → Step 3(d). ✓
- Watcher/timer lifecycle on close → Step 3(d). ✓
- Tests: shouldReload pure cases, watch→reload, debounce-coalesce, no-trigger-on-.jscad-studio → Step 1. ✓ (Browser Playwright e2e is deferred-optional per spec; server-level tests are the gate.)
- Docs note → Step 5. ✓

**Placeholder scan:** the Step 5 `console; // (template string)` line is an editing hint, not code to insert — the actual replacement text is given verbatim below it. No TBDs.

**Type consistency:** `shouldReload(filename)→boolean` used in test + watcher callback identically. Reload frame `data: {"reload":true}\n\n` produced in `scheduleReload` and matched by the test substring `'"reload":true'` and parsed by the BRIDGE `d.reload`. `startViewerServer` still returns `{ server, port, viewerUrl }` (unchanged shape). Consistent.
