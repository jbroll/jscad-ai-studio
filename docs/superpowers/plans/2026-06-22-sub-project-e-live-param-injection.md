# Sub-project E — Live Parameter Injection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set jscadui viewer parameters from outside the page — in the AI's headless `render` and live in the user's open browser tab.

**Architecture:** A `window.jscadStudio.setParams` hook in the deployed jscadui app is the single foundation. Headless `render` calls it via `page.evaluate`. The live path adds an SSE relay: the plugin's viewer-server injects a bridge `<script>` into the proxied viewer HTML and exposes `GET /__studio/events` (SSE) + `POST /__studio/params` (broadcast); a `live_params` MCP tool POSTs to the running jscad-work server (discovered via `.jscad-studio`).

**Tech Stack:** Cross-repo — jscadui (`../jscadui/apps/jscad-web`, ESM, vitest) for the hook; the plugin (`mcp/lib/*`, ESM, vitest) for render/viewer-server/tool. Node `http`, Server-Sent Events.

## Global Constraints

- **Two repos, two commit streams.** Tasks 1 & 5 are in `../jscadui` (the jscadui repo). Tasks 2–4 are in the plugin `/home/john/src/jscad-ai-studio`. Never mix a commit across repos.
- **The viewer-server proxies `/` and unknown paths to `jscad.rkroll.com`** — the deployed jscadui app. Local files (models) are served from the working directory. The `window.jscadStudio` hook therefore must be in jscadui AND deployed before headless render-with-params or the live bridge work end-to-end.
- **`window.jscadStudio` API (exact):** `{ ready: true, getParams(): object, setParams(obj): Promise<object> }`. `setParams` applies each `[path,value]` via the controller, runs ONE model update, and resolves with the resulting params after the re-render. Unknown param paths are ignored (matches `paramsCtrl.setParam`).
- **`.jscad-studio`** (written by `jscad-work` in cwd) holds `{ serverPort, pid, currentModel, viewerUrl, workspace }`. The live tool reads `serverPort` from it.
- **SSE wire format:** `data: ` + `JSON.stringify({ params })` + `\n\n`.
- **Browser-dependent tests are gated behind `JSCAD_RENDER_TEST`.** SSE-relay and live-params tests are server-level and run ungated.
- **Code hygiene:** every commit passes org-hooks Lefthook AND `npm run knip` (the JS repo's knip is NOT enforced by the TS-only Lefthook glob — run it manually). 500-line file cap. `npm test` = `vitest run`.
- **Deploy (Task 5) is production and human-gated** — do not deploy from a subagent without the controller confirming with the user.

## File Structure

| Repo | File | Responsibility |
|---|---|---|
| jscadui | `apps/jscad-web/src/studioBridge.js` (create) | `installStudioBridge({ paramsCtrl, runModel, getParams, target })` — installs `window.jscadStudio`. Pure/testable. |
| jscadui | `apps/jscad-web/main.js` (modify) | call `installStudioBridge(...)` after the worker/deps are set up. |
| jscadui | `apps/jscad-web/src/studioBridge.test.js` (create) | unit test the bridge. |
| plugin | `mcp/lib/render.js` (modify) | `params` option → `page.evaluate(setParams)` → settle → screenshot. |
| plugin | `mcp/lib/viewer-server.js` (modify) | SSE endpoints + HTML bridge injection (`injectBridge` pure helper). |
| plugin | `mcp/lib/live-params.js` (create) | `liveParams(params, {cwd})` → read `.jscad-studio` → POST. |
| plugin | `mcp/lib/tools.js`, `mcp/server.js` (modify) | register `live_params` tool. |
| plugin | `test/viewer-server.test.js`, `test/live-params.test.js` (create), `test/render.test.js` (modify) | tests. |

---

### Task 1 (jscadui repo): `window.jscadStudio` hook

**Repo:** `/home/john/src/jscadui` — work in `apps/jscad-web`. Commit in this repo only.

**Files:**
- Create: `apps/jscad-web/src/studioBridge.js`, `apps/jscad-web/src/studioBridge.test.js`
- Modify: `apps/jscad-web/main.js`

**Interfaces:**
- Produces: `installStudioBridge({ paramsCtrl, runModel, getParams })` — sets `globalThis.jscadStudio = { ready, getParams, setParams }`. `runModel` is an async thunk that re-runs the model (the caller supplies it bound to the real deps). `setParams(obj)` returns `Promise<object>` (params after update).

- [ ] **Step 1: Write the failing test `apps/jscad-web/src/studioBridge.test.js`**

```js
import { afterEach, expect, test, vi } from 'vitest'
import { installStudioBridge } from './studioBridge.js'

afterEach(() => { delete globalThis.jscadStudio })

const makeCtrl = () => {
  const params = { size: 10, depth: 4 }
  return {
    setParam: vi.fn((path, value) => { params[path] = value; return [path] }),
    getState: () => ({ params: { ...params } }),
    _params: params,
  }
}

test('installs window.jscadStudio with ready flag and getParams', () => {
  const ctrl = makeCtrl()
  installStudioBridge({ paramsCtrl: ctrl, runModel: vi.fn(async () => {}), getParams: () => ctrl.getState().params })
  expect(globalThis.jscadStudio.ready).toBe(true)
  expect(globalThis.jscadStudio.getParams()).toEqual({ size: 10, depth: 4 })
})

test('setParams applies each entry via setParam then runs ONE model update', async () => {
  const ctrl = makeCtrl()
  const runModel = vi.fn(async () => {})
  installStudioBridge({ paramsCtrl: ctrl, runModel, getParams: () => ctrl.getState().params })
  const result = await globalThis.jscadStudio.setParams({ size: 25, depth: 8 })
  expect(ctrl.setParam).toHaveBeenCalledWith('size', 25)
  expect(ctrl.setParam).toHaveBeenCalledWith('depth', 8)
  expect(runModel).toHaveBeenCalledTimes(1)
  expect(result).toEqual({ size: 25, depth: 8 })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/john/src/jscadui && npx vitest run apps/jscad-web/src/studioBridge.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `apps/jscad-web/src/studioBridge.js`**

```js
/**
 * Expose a minimal external API for setting viewer parameters from outside the
 * page (headless render via page.evaluate, and the live SSE bridge). The viewer's
 * param system is otherwise module-internal.
 *
 * @param {object} deps
 * @param {{ setParam(path:string, value:unknown): string[] }} deps.paramsCtrl
 * @param {() => Promise<void>} deps.runModel  re-run the model + re-render (caller-bound)
 * @param {() => object} deps.getParams        current param values
 */
export function installStudioBridge({ paramsCtrl, runModel, getParams }) {
  globalThis.jscadStudio = {
    ready: true,
    getParams,
    async setParams(obj) {
      for (const [path, value] of Object.entries(obj || {})) {
        paramsCtrl.setParam(path, value)
      }
      await runModel()
      return getParams()
    },
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/john/src/jscadui && npx vitest run apps/jscad-web/src/studioBridge.test.js`
Expected: PASS (2).

- [ ] **Step 5: Wire it into `apps/jscad-web/main.js`**

Add the import near the other `src/` imports (alongside `import * as paramsUI from './src/paramsUI.js'` at line 48):
```js
import { installStudioBridge } from './src/studioBridge.js'
```
After the worker is created and `paramsCtrl`/`handlers`/`setError`/`stopCurrentAnim` are all in scope (after the `createWorker({...})` block around line 149–177), install the bridge, reusing the SAME deps shape used at the existing `runModelUpdate` call site (main.js ~344–349):
```js
installStudioBridge({
  paramsCtrl,
  getParams: () => paramsCtrl.getState().params,
  runModel: () => paramsUI.runModelUpdate({
    workerApi,
    handleEntities: handlers.entities,
    setError,
    stopCurrentAnim,
  }),
})
```
If `setError` or `handlers` are declared later than the chosen insertion point, place the `installStudioBridge(...)` call after their declarations (it only needs to run once at boot, before user interaction). Verify the file still builds: `cd /home/john/src/jscadui && node apps/jscad-web/build.js` (or the repo's documented build) exits 0.

- [ ] **Step 6: Run jscadui suite + commit (in jscadui repo)**

Run: `cd /home/john/src/jscadui && npx vitest run apps/jscad-web/src/studioBridge.test.js` → PASS, and the broader `apps/jscad-web` unit tests still pass.
```bash
cd /home/john/src/jscadui
git add apps/jscad-web/src/studioBridge.js apps/jscad-web/src/studioBridge.test.js apps/jscad-web/main.js
git commit -m "feat(jscad-web): expose window.jscadStudio.setParams for external param injection"
```
(Do NOT deploy yet — Task 5.)

---

### Task 2 (plugin repo): `render` honors `params`

**Repo:** `/home/john/src/jscad-ai-studio`.

**Files:**
- Modify: `mcp/lib/render.js`
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: `window.jscadStudio.setParams` (Task 1, deployed in Task 5).
- Produces: `renderModel(modelPath, { size, view, params })` — when `params` is set, applies it in the page before screenshotting; returns metadata including `params`.

- [ ] **Step 1: Read `mcp/lib/render.js`** to locate the post-settle point (after the canvas settle wait and the optional `view` gizmo block, before `page.screenshot`).

- [ ] **Step 2: Add the gated test to `test/render.test.js`**

```js
test.skipIf(!RUN)("renders with injected params to a non-empty PNG", async () => {
  const r = await renderModel(fx("cube.js"), { size: [400, 300], params: { size: 18 } });
  expect(existsSync(r.path)).toBe(true);
  expect(statSync(r.path).size).toBeGreaterThan(1000);
  expect(r.params).toEqual({ size: 18 });
}, 60000);
```
(`RUN`, `fx`, `existsSync`, `statSync` already exist in this test file from earlier tasks.)

- [ ] **Step 3: Implement the `params` branch in `render.js`**

After the canvas settle (and after the `view` block), before the screenshot, add:
```js
if (opts.params) {
  const hasBridge = await page.evaluate(() => !!(window.jscadStudio && window.jscadStudio.ready));
  if (!hasBridge) {
    throw new Error("viewer does not expose window.jscadStudio (deploy the jscadui hook — sub-project E Task 5)");
  }
  await page.evaluate((p) => window.jscadStudio.setParams(p), opts.params);
  await page.waitForTimeout(SETTLE_MS); // reuse the existing settle constant/value used elsewhere in render.js
}
```
Include `params: opts.params` in the returned metadata object (next to the existing `view` field), e.g. `...(opts.params ? { params: opts.params } : {})`. Use the same settle duration constant the file already uses after navigation; if it is an inline literal (e.g. `2500`), reuse that literal.

- [ ] **Step 4: Run the suite**

Run: `npm test` → green (the new render test SKIPS without `JSCAD_RENDER_TEST`).
If a browser is available: `JSCAD_RENDER_TEST=1 npx vitest run test/render.test.js` (note: requires the jscadui hook deployed — Task 5 — to actually pass; otherwise it throws the clear bridge error, which is expected pre-deploy). Record which case applies.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/render.js test/render.test.js
git commit -m "feat(e): render honors params via window.jscadStudio.setParams"
```

---

### Task 3 (plugin repo): viewer-server SSE relay + bridge injection

**Files:**
- Modify: `mcp/lib/viewer-server.js`
- Test: `test/viewer-server.test.js` (create)

**Interfaces:**
- Produces: `injectBridge(html) => html` (pure; inserts the SSE bridge `<script>` before `</body>`). New endpoints on the server: `GET /__studio/events` (SSE), `POST /__studio/params` (broadcast `{ params }` to SSE clients, respond `{ ok, clients }`).

- [ ] **Step 1: Write the failing test `test/viewer-server.test.js`**

```js
import { get, request } from "node:http";
import { afterAll, beforeAll, expect, test } from "vitest";
import { injectBridge, startViewerServer } from "../mcp/lib/viewer-server.js";

test("injectBridge inserts the EventSource bridge before </body>", () => {
  const out = injectBridge("<html><body><div>x</div></body></html>");
  expect(out).toMatch(/EventSource\('\/__studio\/events'\)/);
  expect(out.indexOf("__studio/events")).toBeLessThan(out.indexOf("</body>"));
});

let srv;
beforeAll(async () => { srv = await startViewerServer(process.cwd()); });
afterAll(() => srv.server.close());

test("SSE: a /__studio/params POST is delivered to connected /__studio/events clients", async () => {
  const received = await new Promise((resolve, reject) => {
    const req = get(
      { host: "127.0.0.1", port: srv.port, path: "/__studio/events" },
      (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          if (chunk.includes("data:")) resolve(chunk);
        });
      },
    );
    req.on("error", reject);
    // once connected, POST a param command
    setTimeout(() => {
      const post = request(
        { host: "127.0.0.1", port: srv.port, path: "/__studio/params", method: "POST", headers: { "content-type": "application/json" } },
        () => {},
      );
      post.end(JSON.stringify({ params: { size: 42 } }));
    }, 100);
  });
  expect(received).toContain('"size":42');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/viewer-server.test.js`
Expected: FAIL (`injectBridge` not exported; `/__studio/events` 404s/proxies).

- [ ] **Step 3: Implement in `mcp/lib/viewer-server.js`**

Add near the top (after imports):
```js
const BRIDGE = `<script>(()=>{try{const es=new EventSource('/__studio/events');es.onmessage=(e)=>{try{const d=JSON.parse(e.data);if(window.jscadStudio&&d.params)window.jscadStudio.setParams(d.params);}catch{}};}catch{}})()</script>`;

export const injectBridge = (html) =>
  html.includes("</body>") ? html.replace("</body>", `${BRIDGE}</body>`) : html + BRIDGE;

const sseClients = new Set();

const handleSse = (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write("\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
};

const handleParamsPost = (req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    let payload = {};
    try { payload = JSON.parse(body || "{}"); } catch { /* ignore malformed */ }
    const frame = `data: ${JSON.stringify({ params: payload.params ?? {} })}\n\n`;
    for (const client of sseClients) client.write(frame);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: sseClients.size }));
  });
};
```
Replace the `/` proxy so the HTML is buffered and injected. Add a buffering proxy used only for `/`:
```js
const proxyHtmlWithInjection = (req, res) => {
  const proxyReq = httpsRequest(
    { hostname: UPSTREAM_HOST, port: UPSTREAM_PORT, path: "/", method: req.method, headers: { ...req.headers, host: UPSTREAM_HOST } },
    (proxyRes) => {
      const chunks = [];
      proxyRes.on("data", (c) => chunks.push(c));
      proxyRes.on("end", () => {
        const html = injectBridge(Buffer.concat(chunks).toString("utf8"));
        const headers = { ...proxyRes.headers };
        delete headers["content-length"]; // body length changed by injection
        delete headers["content-encoding"]; // ensure we send plain (no gzip mismatch)
        res.writeHead(proxyRes.statusCode, headers);
        res.end(html);
      });
    },
  );
  proxyReq.on("error", (err) => { res.writeHead(502); res.end("Proxy error"); });
  req.pipe(proxyReq);
};
```
Note on `content-encoding`: to guarantee the upstream returns un-gzipped HTML we can buffer-decode, set the outgoing request's `accept-encoding` to `identity`. In `proxyHtmlWithInjection`, set `headers: { ...req.headers, host: UPSTREAM_HOST, "accept-encoding": "identity" }`.
In the `createServer` handler, route the new paths BEFORE the existing `pathname === "/"` branch:
```js
if (pathname === "/__studio/events") return handleSse(req, res);
if (pathname === "/__studio/params" && req.method === "POST") return handleParamsPost(req, res);
if (pathname === "/") return proxyHtmlWithInjection(req, res);
```
(Remove/replace the old `if (pathname === "/") return proxyToUpstream(req, res, "/");` line.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/viewer-server.test.js` → PASS (2).
Run: `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/viewer-server.js test/viewer-server.test.js
git commit -m "feat(e): viewer-server SSE relay + bridge injection for live params"
```

---

### Task 4 (plugin repo): `live-params` + `live_params` MCP tool

**Files:**
- Create: `mcp/lib/live-params.js`, `test/live-params.test.js`
- Modify: `mcp/lib/tools.js`, `mcp/server.js`

**Interfaces:**
- Consumes: `.jscad-studio` (`serverPort`); the viewer-server `POST /__studio/params` (Task 3).
- Produces: `liveParams(params, { cwd, fetchImpl }) => Promise<{ ok, clients }>`; MCP tool `live_params({ params })`.

- [ ] **Step 1: Write the failing test `test/live-params.test.js`**

```js
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { liveParams } from "../mcp/lib/live-params.js";

let srv;
let port;
let received;
beforeAll(async () => {
  srv = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => { b += c; });
    req.on("end", () => { received = JSON.parse(b); res.end(JSON.stringify({ ok: true, clients: 1 })); });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  port = srv.address().port;
});
afterAll(() => srv.close());

test("posts params to the server named in .jscad-studio", async () => {
  const dir = mkdtempSync(join(tmpdir(), "live-"));
  writeFileSync(join(dir, ".jscad-studio"), JSON.stringify({ serverPort: port }));
  const res = await liveParams({ size: 7 }, { cwd: dir });
  expect(received).toEqual({ params: { size: 7 } });
  expect(res).toEqual({ ok: true, clients: 1 });
  rmSync(dir, { recursive: true, force: true });
});

test("throws a clear error when no .jscad-studio is present", async () => {
  const dir = mkdtempSync(join(tmpdir(), "live-none-"));
  await expect(liveParams({ size: 1 }, { cwd: dir })).rejects.toThrow(/jscad-work/);
  rmSync(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/live-params.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `mcp/lib/live-params.js`**

```js
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Push parameter overrides into the running jscad-work viewer (the user's open
// tab) via the viewer-server's /__studio/params broadcast. Requires a jscad-work
// session (it writes .jscad-studio with the server port).
export const liveParams = async (params, { cwd = process.cwd(), fetchImpl = fetch } = {}) => {
  const cfgPath = resolve(cwd, ".jscad-studio");
  if (!existsSync(cfgPath)) {
    throw new Error("no running jscad-work server (.jscad-studio not found) — run jscad-work first");
  }
  const { serverPort } = JSON.parse(readFileSync(cfgPath, "utf8"));
  let res;
  try {
    res = await fetchImpl(`http://127.0.0.1:${serverPort}/__studio/params`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ params }),
    });
  } catch (e) {
    throw new Error(`jscad-work server unreachable on port ${serverPort}: ${e.message}`);
  }
  if (!res.ok) throw new Error(`live params POST failed: ${res.status}`);
  return res.json();
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/live-params.test.js` → PASS (2).

- [ ] **Step 5: Register the `live_params` tool**

In `mcp/lib/tools.js` add (using the existing `wrap` helper):
```js
import { liveParams } from "./live-params.js";
// ...in the handlers object:
  live_params: async ({ params }) => wrap(await liveParams(params)),
```
In `mcp/server.js`, register it (define a `params` zod next to the existing shared schemas):
```js
const paramsSchema = z.record(z.string(), z.unknown());
server.registerTool("live_params", {
  description: "Push parameter overrides into the running jscad-work viewer (the user's open browser tab). Requires an active `jscad-work` session with the viewer open.",
  inputSchema: { params: paramsSchema },
}, handlers.live_params);
```

- [ ] **Step 6: Verify boot + suite + knip, commit**

Run: `node -e "import('./mcp/server.js').then(()=>setTimeout(()=>process.exit(0),300))"` → exits 0.
Run: `npm test` → green. Run: `npm run knip` → clean.
```bash
git add mcp/lib/live-params.js test/live-params.test.js mcp/lib/tools.js mcp/server.js
git commit -m "feat(e): live_params MCP tool — push params into the user's open viewer"
```

---

### Task 5 (jscadui repo): build + deploy + end-to-end verification — HUMAN-GATED

**Repo:** `/home/john/src/jscadui`. **The controller coordinates the deploy with the user; do NOT deploy from a subagent.**

**Files:** none (build/deploy/verify only).

- [ ] **Step 1: Build the jscadui app**

Run the repo's build: `cd /home/john/src/jscadui && node apps/jscad-web/build.js` (or the documented `npm run build` for that app). Expected: exits 0, produces the deployable bundle.

- [ ] **Step 2: Deploy to jscad.rkroll.com**

Controller: confirm the deploy command with the user (this is production), then run it. After deploy, verify the hook is live:
```bash
# the deployed app should now reference jscadStudio
curl -s https://jscad.rkroll.com/ | grep -c "jscadStudio" || echo "NOT FOUND — bundle may inline; verify in a browser instead"
```
If the symbol is bundled/minified out of the HTML, verify in a browser console: load jscad.rkroll.com, run a model with a slider, then `await window.jscadStudio.setParams({ <param>: <value> })` and confirm the geometry/slider updates.

- [ ] **Step 3: End-to-end headless render-with-params**

```bash
cd /home/john/src/jscad-ai-studio
JSCAD_RENDER_TEST=1 npx vitest run test/render.test.js
```
Expected: the "renders with injected params" case PASSES (now that the hook is deployed). If Chromium is unavailable in the environment, record that and verify manually via the MCP `render` tool with `params`.

- [ ] **Step 4: End-to-end live injection**

In a scratch dir: `jscad-work demo.js` (starts the viewer-server, writes `.jscad-studio`), open the printed viewer URL in a browser, then from that dir invoke the MCP `live_params` tool (or `node -e` calling `liveParams`) with a param override and confirm the open tab updates live.

- [ ] **Step 5: Record results**

No commit (verification only). Record in the report: build result, deploy confirmation, headless e2e result, live e2e result.

---

## Self-Review

**Spec coverage:**
- E.1 `window.jscadStudio` hook → Task 1 (verified wiring: `paramsCtrl` main.js:106, deps `{workerApi, handleEntities: handlers.entities, setError, stopCurrentAnim}` from main.js:344-349). ✓
- E.1 deploy → Task 5 (human-gated). ✓
- E.1 `render` `params` → Task 2. ✓
- E.2 viewer-server SSE bridge + endpoints + injection → Task 3. ✓
- E.2 `live_params` tool + `.jscad-studio` discovery → Task 4. ✓
- Testing: SSE relay server-level ungated (Task 3), live-params unit (Task 4), render gated (Task 2), jscadui unit (Task 1). ✓
- Error handling: render throws when no bridge (Task 2 Step 3); live-params clear throws (Task 4 Step 3); malformed SSE swallowed in BRIDGE (Task 3); unknown paths ignored (Task 1 — setParam mock returns, real setParam ignores). ✓

**Placeholder scan:** none. Task 5 deploy is intentionally human-gated with a verification fallback (browser console) — a real instruction, not a placeholder.

**Type consistency:** `window.jscadStudio.setParams(obj): Promise<params>` used identically in render.js (Task 2) and the BRIDGE (Task 3). `liveParams(params, {cwd, fetchImpl})` (Task 4) ↔ test (Task 4 Step 1). SSE frame `data: {"params":{...}}\n\n` produced by `handleParamsPost` (Task 3) and consumed by both the viewer-server test (Task 3) and the BRIDGE. `.jscad-studio` `serverPort` written by jscad-work ↔ read by `liveParams`. Consistent.

**Knip note:** `injectBridge` is exported and consumed by its test (entry); `liveParams` consumed by tools.js. No dead exports introduced. Run `npm run knip` in Tasks 4 (and any plugin task) since Lefthook's TS-glob does not gate it.
