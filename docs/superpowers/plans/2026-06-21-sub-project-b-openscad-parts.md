# Sub-project B — OpenSCAD Transparent Parts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenSCAD `.scad` files first-class, `require`-able parts in the `jscad-studio` MCP — evaluable, measurable, exportable, checkable, and renderable at parity with jscad-fluent, and composable into jscad-fluent assemblies.

**Architecture:** Convert `.scad` to one canonical type at the require boundary: `parse`→`transpile`→eval on the Manifold runtime → `manifoldToGeom3()` → `new FluentGeom3(geom3)`. Registering `require.extensions['.scad']` makes `.scad` require-able transparently at any depth; the worker pre-initializes the Manifold runtime once so those requires resolve synchronously (`main()` is synchronous). All of Sub-project A's tools then operate on the resulting `FluentGeom3` unchanged.

**Tech Stack:** Node 22 ESM; `@jscadui/openscad` (transpiler + `run` helpers), `@jscadui/openscad-runtime`, `@jscadui/manifold` (+ `manifold-3d` WASM), `@jscadui/jscad-text`; `@jbroll/jscad-fluent` (gains `FluentGeom3`/`FluentGeom2` exports); vitest.

## Global Constraints

- **Module system:** ESM. Models and `.scad`-transpiled code execute via `vm`/`new Function`, never `import`.
- **Canonical geometry:** every model/part — `.js` or `.scad` — yields a `FluentGeom3` (or array) so A's tools work unchanged. `.scad` → `manifoldToGeom3()` → `new FluentGeom3(geom3)`.
- **`main()` is synchronous;** the Manifold runtime is pre-initialized once per worker (`await initOpenscad()`) BEFORE model evaluation, so `.scad` `require`s resolve synchronously.
- **Transparent require:** `require.extensions['.scad']` is registered once; `.scad` is then require-able from any `.js`/`.scad` model at any depth. The require-shim needs no per-`.scad` case (it already delegates non-fluent ids to `createRequire`, which honors `require.extensions`).
- **`@jscad/modeling` inside `.scad`:** resolved to the **Manifold runtime** by the transpiler's own `createMakeRequire` (NOT to jscad-fluent). A's top-level shim mapping `@jscad/modeling`→fluent applies only to the top `.js` model's direct requires; it never reaches `.scad`-internal requires.
- **Errors never throw to the MCP layer:** parse/transpile/eval errors are returned as `{ ok:false, error, line? }`. The worker-thread timeout still bounds runaway `.scad`.
- **Deferred:** OpenSCAD customizer parameter override (values baked into transpiled code; `params` returns `[]` for `.scad`); 2D `.scad`→SVG; the LLM catalog.
- **Code hygiene (org-hooks):** every commit runs gitleaks/biome/tsc/knip/size-cap (500-line source cap). New deps go in `knip.json` `ignoreDependencies` until an import makes them visible.

## Upstream changes (sibling repos we own)
- `jscad-fluent`: export `FluentGeom3`/`FluentGeom2` from `src/index.ts`; rebuild.
- `jscadui` `@jscadui/openscad`: factor `bin/run-jscad.js` into reusable `initScadRuntime()` + `evalScadSolidSync()`, re-export `manifoldToGeom3`, and expose them via a `./run` package export.

## File Structure

| File | Responsibility |
|---|---|
| `../jscad-fluent/src/index.ts` | add `export { FluentGeom3 }` / `export { FluentGeom2 }`; rebuild dist. |
| `../jscadui/packages/openscad/bin/run-jscad.js` | add `initScadRuntime()`, `evalScadSolidSync()`, re-export `manifoldToGeom3`; refactor `runScadToStl` to use them. |
| `../jscadui/packages/openscad/package.json` | add `"./run": "./bin/run-jscad.js"` to `exports`. |
| `mcp/lib/openscad.js` | `initOpenscad()` (async, memoized), `registerScadRequire()`, `evalScadModel(path)` → `FluentGeom3`. |
| `mcp/lib/model-loader.js` (modify) | route top-level `.scad` to `evalScadModel`; keep `.js` path. |
| `mcp/lib/worker.js` (modify) | `await initOpenscad()` + `registerScadRequire()` before evaluating any model. |
| `mcp/README.md`, `README.md`, `bin/jscad-work.js` (modify) | document `.scad` support. |
| `test/fixtures/*.scad`, `test/fixtures/combo.js`, `test/openscad.test.js` | fixtures + tests. |
| `package.json` | new deps. |

---

### Task 1: Dependencies + jscad-fluent wrapper export

**Files:**
- Modify: `package.json` (deps), `knip.json`
- Modify (upstream): `../jscad-fluent/src/index.ts`
- Test: `test/openscad-deps.test.js`

**Interfaces:**
- Produces: `import { FluentGeom3, FluentGeom2 } from "@jbroll/jscad-fluent"` resolves to constructable classes; the four `@jscadui/*` packages + `manifold-3d` resolve from the plugin.

- [ ] **Step 1: Create the branch**

```bash
cd /home/john/src/jscad-ai-studio && git checkout -b feat/sub-project-b
```

- [ ] **Step 2: Export the wrapper classes from jscad-fluent**

Edit `/home/john/src/jscad-fluent/src/index.ts`. After the existing `import { FluentGeom3 } from './gen/FluentGeom3';` / `FluentGeom2` imports, add public re-exports near the other exports (the file ends with `export default jscadFluent;`):
```ts
export { FluentGeom3 } from './gen/FluentGeom3';
export { FluentGeom2 } from './gen/FluentGeom2';
```
Then rebuild:
```bash
cd /home/john/src/jscad-fluent && npm run build
```
Expected: build succeeds (Vite + tsc emit). Commit it in the jscad-fluent repo:
```bash
cd /home/john/src/jscad-fluent && git add -A && git commit -m "feat: export FluentGeom3/FluentGeom2 wrapper classes for embedders"
```

- [ ] **Step 3: Add dependencies to the plugin**

```bash
cd /home/john/src/jscad-ai-studio
npm install manifold-3d@^3.3.2
```
Then edit `package.json` `dependencies` to add the four file-linked packages:
```json
"@jscadui/openscad": "file:../jscadui/packages/openscad",
"@jscadui/openscad-runtime": "file:../jscadui/packages/openscad-runtime",
"@jscadui/manifold": "file:../jscadui/packages/manifold",
"@jscadui/jscad-text": "file:../jscadui/packages/jscad-text"
```
Run `npm install`. Add these five names to `knip.json` `ignoreDependencies` (alongside the existing entries) so knip stays green until imports land:
```json
"@jscadui/openscad", "@jscadui/openscad-runtime", "@jscadui/manifold", "@jscadui/jscad-text", "manifold-3d"
```

- [ ] **Step 4: Write the dependency-resolution test `test/openscad-deps.test.js`**

```js
import { test, expect } from "vitest";
import { createRequire } from "node:module";

test("FluentGeom3 wrapper is exported and constructable", async () => {
  const jf = (await import("@jbroll/jscad-fluent")).default ?? (await import("@jbroll/jscad-fluent"));
  const mod = await import("@jbroll/jscad-fluent");
  expect(typeof mod.FluentGeom3).toBe("function");
  const cube = jf.cube({ size: 6 });
  const raw = { polygons: cube.toPolygons().map((p) => ({ vertices: p.vertices })), transforms: cube.transforms };
  const wrapped = new mod.FluentGeom3(raw);
  expect(typeof wrapped.union).toBe("function");
  expect(wrapped.measureDimensions()).toEqual([6, 6, 6]);
});

test("openscad + manifold packages resolve", () => {
  const require = createRequire(import.meta.url);
  expect(() => require.resolve("manifold-3d")).not.toThrow();
});
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run test/openscad-deps.test.js`
Expected: PASS (2 tests). If `mod.FluentGeom3` is undefined, the jscad-fluent rebuild (Step 2) didn't publish the export — re-run `npm run build` in jscad-fluent and `npm install` in the plugin.

- [ ] **Step 6: Commit (plugin)**

```bash
git add package.json package-lock.json knip.json test/openscad-deps.test.js
git commit -m "feat(b): deps + jscad-fluent wrapper export"
```

---

### Task 2: Upstream — reusable scad eval helpers in jscadui

**Files:**
- Modify: `../jscadui/packages/openscad/bin/run-jscad.js`
- Modify: `../jscadui/packages/openscad/package.json`

**Interfaces:**
- Produces (importable from `@jscadui/openscad/run`):
  - `initScadRuntime() => Promise<{ jscadModeling, openscadRuntime }>` — awaits fonts + Manifold runtime + `j$.init`; memoized.
  - `evalScadSolidSync(scadPath, ctx, opts?) => manifoldSolid | null` — synchronous transpile + eval; `ctx` is the object from `initScadRuntime`; `opts` = `{ fn?, libPaths?, sharedCache? }`. Returns the Manifold solid (array results unioned), or `null` for empty geometry.
  - `manifoldToGeom3(manifold) => { polygons, transforms }` (re-export).

- [ ] **Step 1: Add the helpers to `run-jscad.js`**

`run-jscad.js` already defines `_systemFontsReady`, `_getManifoldRuntime()`, `_getOpenscadRuntime()`, `transpileScad()`, `createMakeRequire()`, `createParamsProxy()`, `createJ$Instance`, `setGlobalFn`. Add near `runScadToStl`:
```js
export async function initScadRuntime() {
  await _systemFontsReady;
  const jscadModeling = await _getManifoldRuntime();
  const openscadRuntime = await _getOpenscadRuntime();
  openscadRuntime.j$.init(jscadModeling);
  return { jscadModeling, openscadRuntime };
}

export function evalScadSolidSync(scadPath, ctx, { fn = 0, libPaths = [], sharedCache } = {}) {
  const { jscadModeling, openscadRuntime } = ctx;
  const inputPath = resolve(scadPath);
  const fileDir = dirname(inputPath);
  const source = readFileSync(inputPath, "utf8");
  const { code, moduleCache } = transpileScad(source, inputPath, fileDir, fn, false, libPaths, sharedCache, false);
  const j$Instance = createJ$Instance();
  j$Instance.jscad = jscadModeling;
  if (fn > 0) setGlobalFn(fn);
  const customRequire = createMakeRequire(jscadModeling, openscadRuntime, moduleCache, fn, libPaths, sharedCache, j$Instance, false)(fileDir);
  const moduleObj = { exports: {} };
  new Function("require", "module", "exports", "j$", code)(customRequire, moduleObj, moduleObj.exports, j$Instance);
  if (typeof moduleObj.exports.main !== "function") throw new Error("No main() function in " + scadPath);
  const result = moduleObj.exports.main(createParamsProxy());
  if (!result || (Array.isArray(result) && result.length === 0)) return null;
  return Array.isArray(result) ? jscadModeling.booleans.union(result) : result;
}

export { manifoldToGeom3 } from "../../manifold/src/conversions/index.js";
```
Refactor `runScadToStl` to reuse them (optional but preferred — keeps one code path):
```js
export async function runScadToStl(scadPath, stlPath, fn, libPaths, sharedCache, preview = false) {
  const ctx = await initScadRuntime();
  const geometry = evalScadSolidSync(scadPath, ctx, { fn, libPaths, sharedCache });
  writeFileSync(stlPath, geometry ? exportStl(geometry) : "solid JSCAD\nendsolid JSCAD\n");
}
```

- [ ] **Step 2: Export the `./run` subpath in `package.json`**

Edit `/home/john/src/jscadui/packages/openscad/package.json` `exports`:
```json
"exports": {
  ".": { "types": "./esm/index.d.ts", "import": "./esm/index.js" },
  "./run": "./bin/run-jscad.js"
}
```

- [ ] **Step 3: Verify the Node smoke (sync eval of a cube)**

```bash
cd /home/john/src/jscadui && mkdir -p /tmp/btask2 && printf 'cube(10);\n' > /tmp/btask2/cube.scad
node --input-type=module -e "
import { initScadRuntime, evalScadSolidSync, manifoldToGeom3 } from '@jscadui/openscad/run';
const ctx = await initScadRuntime();
const solid = evalScadSolidSync('/tmp/btask2/cube.scad', ctx);
const g = manifoldToGeom3(solid.manifold ?? solid);
console.log('triangles:', g.polygons.length);
"
```
Expected: prints `triangles: 12`.

- [ ] **Step 4: Commit (jscadui)**

```bash
cd /home/john/src/jscadui && git add packages/openscad/bin/run-jscad.js packages/openscad/package.json
git commit -m "feat(openscad): reusable initScadRuntime + evalScadSolidSync + ./run export"
```

---

### Task 3: OpenSCAD eval bridge (`mcp/lib/openscad.js`)

**Files:**
- Create: `mcp/lib/openscad.js`, `test/openscad.test.js`
- Create: `test/fixtures/cube.scad`, `test/fixtures/broken.scad`

**Interfaces:**
- Consumes: `@jscadui/openscad/run` (`initScadRuntime`, `evalScadSolidSync`, `manifoldToGeom3`), `@jbroll/jscad-fluent` (`FluentGeom3`).
- Produces:
  - `initOpenscad() => Promise<void>` — memoized; initializes + stores the runtime ctx.
  - `registerScadRequire() => void` — registers `require.extensions['.scad']` once (requires `initOpenscad` first).
  - `evalScadModel(scadPath) => FluentGeom3` — evaluate a top-level `.scad` to a fluent geometry (empty `FluentGeom3` for null/empty result). Throws on parse/eval error (callers convert to structured error).

- [ ] **Step 1: Create the fixtures**

`test/fixtures/cube.scad`:
```scad
cube(10);
```
`test/fixtures/broken.scad`:
```scad
cube(10)
this is not valid scad @@@
```

- [ ] **Step 2: Write the failing test `test/openscad.test.js`**

```js
import { test, expect, beforeAll } from "vitest";
import { initOpenscad, registerScadRequire, evalScadModel } from "../mcp/lib/openscad.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

beforeAll(async () => {
  await initOpenscad();
  registerScadRequire();
});

test("evaluates a top-level .scad model to a fluent geometry", () => {
  const g = evalScadModel(fx("cube.scad"));
  expect(typeof g.union).toBe("function");
  expect(g.measureDimensions()).toEqual([10, 10, 10]);
  expect(g.measureVolume()).toBeCloseTo(1000, 3);
});

test("a .scad is require-able and composes with fluent", async () => {
  const require = (await import("node:module")).createRequire(import.meta.url);
  const part = require(fx("cube.scad")); // resolves via require.extensions['.scad']
  expect(part.measureDimensions()).toEqual([10, 10, 10]);
});

test("a malformed .scad throws (caller converts to structured error)", () => {
  expect(() => evalScadModel(fx("broken.scad"))).toThrow();
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/openscad.test.js`
Expected: FAIL ("Cannot find module '../mcp/lib/openscad.js'").

- [ ] **Step 4: Create `mcp/lib/openscad.js`**

```js
import Module from "node:module";
import { initScadRuntime, evalScadSolidSync, manifoldToGeom3 } from "@jscadui/openscad/run";
import { FluentGeom3 } from "@jbroll/jscad-fluent";

let ctx = null;
let registered = false;

export const initOpenscad = async () => {
  if (!ctx) ctx = await initScadRuntime();
};

const toFluent = (scadPath) => {
  const solid = evalScadSolidSync(scadPath, ctx);
  if (!solid) return new FluentGeom3();
  return new FluentGeom3(manifoldToGeom3(solid.manifold ?? solid));
};

export const evalScadModel = (scadPath) => {
  if (!ctx) throw new Error("initOpenscad() must be awaited before evalScadModel");
  return toFluent(scadPath);
};

export const registerScadRequire = () => {
  if (registered) return;
  registered = true;
  Module._extensions[".scad"] = (module, filename) => {
    module.exports = toFluent(filename);
  };
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/openscad.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add mcp/lib/openscad.js test/openscad.test.js test/fixtures/cube.scad test/fixtures/broken.scad
git commit -m "feat(b): OpenSCAD eval bridge (.scad -> FluentGeom3) + require.extensions"
```

---

### Task 4: Runner integration (top-level + nested `.scad`)

**Files:**
- Modify: `mcp/lib/model-loader.js` (route top-level `.scad`)
- Modify: `mcp/lib/worker.js` (pre-init + register before eval)
- Create: `test/fixtures/combo.js`
- Test: `test/openscad-runner.test.js`

**Interfaces:**
- Consumes: `openscad.js` (`initOpenscad`, `registerScadRequire`, `evalScadModel`); A's `loadAndRun`, `runModel`.
- Produces: `runModel(path)` and `loadAndRun(path)` accept `.scad` top-level models and `.js` models that `require('*.scad')`. Result shape unchanged (A's).

- [ ] **Step 1: Create the mixed-assembly fixture `test/fixtures/combo.js`**

```js
const jf = require("@jbroll/jscad-fluent");
const main = () => {
  const block = require("./cube.scad"); // FluentGeom3 (10mm cube at origin)
  return jf.cube({ size: 4 }).translate([20, 0, 0]).union(block);
};
module.exports = { main };
```

- [ ] **Step 2: Write the failing test `test/openscad-runner.test.js`**

```js
import { test, expect } from "vitest";
import { runModel } from "../mcp/lib/runner.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("runModel evaluates a top-level .scad", async () => {
  const r = await runModel(fx("cube.scad"), { outputs: ["eval", "measure"] });
  expect(r.ok).toBe(true);
  expect(r.geomType).toBe("geom3");
  expect(r.measure.dimensions).toEqual([10, 10, 10]);
});

test("a .js model can require a .scad part and union it", async () => {
  const r = await runModel(fx("combo.js"), { outputs: ["measure"] });
  expect(r.ok).toBe(true);
  // cube.scad spans -5..5; the size-4 cube at x=20 spans 18..22 → union x = -5..22 = 27
  expect(r.measure.dimensions).toEqual([27, 10, 10]);
});

test("a malformed .scad returns a structured error", async () => {
  const r = await runModel(fx("broken.scad"), { outputs: ["eval"] });
  expect(r.ok).toBe(false);
  expect(typeof r.error).toBe("string");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/openscad-runner.test.js`
Expected: FAIL (`.scad` not handled — loader throws or geomType wrong).

- [ ] **Step 4: Route top-level `.scad` in `mcp/lib/model-loader.js`**

At the top of `loadAndRun`, before the existing `.js` logic, add an extension branch. The existing function signature/return shape is unchanged (`{ ok, error?, line?, geomType, geom?, params }`). Insert near the start of the `try`:
```js
import { evalScadModel } from "./openscad.js";
// ...inside loadAndRun, before loadModel():
if (modelPath.endsWith(".scad")) {
  try {
    const geom = evalScadModel(modelPath);
    return { ok: true, geomType: "geom3", geom, params: [] };
  } catch (err) {
    return { ok: false, error: String(err.message || err), line: 0, geomType: "unknown", params: [] };
  }
}
```
(`params: []` because OpenSCAD customizer override is deferred.)

- [ ] **Step 5: Pre-init + register in `mcp/lib/worker.js`**

`worker.js` currently calls `runModelSync` synchronously. Make it `await initOpenscad()` + `registerScadRequire()` first, so `.scad` (top-level and nested) resolves:
```js
import { parentPort, workerData } from "node:worker_threads";
import { initOpenscad, registerScadRequire } from "./openscad.js";
import { runModelSync } from "./run-model.js";

const run = async () => {
  await initOpenscad();
  registerScadRequire();
  return runModelSync(workerData.modelPath, workerData.opts);
};

run()
  .then((result) => parentPort.postMessage(result))
  .catch((err) => parentPort.postMessage({ ok: false, error: String(err.message || err), geomType: "unknown" }));
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run test/openscad-runner.test.js`
Expected: PASS (3 tests). The combo test proves transparent interop (dimensions `[27,10,10]`).

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all suites green (render skipped). The pre-init adds Manifold WASM load to each worker; eval timing stays within the default timeout.

- [ ] **Step 8: Commit**

```bash
git add mcp/lib/model-loader.js mcp/lib/worker.js test/fixtures/combo.js test/openscad-runner.test.js
git commit -m "feat(b): route .scad through the runner; transparent require interop"
```

---

### Task 5: Tool parity + real corpus part + render

**Files:**
- Test: `test/openscad-tools.test.js`, `test/render.test.js` (extend, gated)

**Interfaces:**
- Consumes: A's `handlers` (`measure`/`export`/`check`), `renderModel`.
- Produces: no new code if Tasks 3–4 suffice; this task is verification + a real-corpus regression guard. If a gap surfaces, fix it in the owning file and note it.

- [ ] **Step 1: Write `test/openscad-tools.test.js`**

```js
import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { handlers } from "../mcp/lib/tools.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const parse = (res) => JSON.parse(res.content[0].text);

test("export produces a binary STL for a .scad", async () => {
  const res = await handlers.export({ modelPath: fx("cube.scad"), format: "stl" });
  const r = parse(res);
  expect(r.export.mime).toMatch(/stl/);
  expect(r.export.triangleCount).toBeGreaterThanOrEqual(12);
});

test("check reports watertight for a .scad solid", async () => {
  const res = await handlers.check({ modelPath: fx("cube.scad") });
  expect(parse(res).check.watertight).toBe(true);
});

test("a real mcad corpus part evaluates and exports", async () => {
  const part = "/home/john/src/jscadui/apps/jscad-web/examples/openscad/mcad/involute_gears.scad";
  if (!existsSync(part)) return; // corpus optional in some checkouts
  const res = await handlers.export({ modelPath: part, format: "stl" });
  const r = parse(res);
  expect(r.ok ?? true).not.toBe(false);
  expect(r.export.bytes).toBeGreaterThan(84);
});
```
Note: if `involute_gears.scad` is not present or is a library-only file with no top-level geometry, replace it with any `mcad`/`bosl2` file that produces geometry — pick one by listing the dir and checking it isn't on a skip-list. Log the chosen file in the report.

- [ ] **Step 2: Run it**

Run: `npx vitest run test/openscad-tools.test.js`
Expected: PASS (3 tests). If `export`/`check` fail on `.scad`, the gap is in how A's serializer/check handles the converted geom3 — fix in `export-geom.js`/`check.js` and note it.

- [ ] **Step 3: Extend the gated render test for `.scad`**

Add to `test/render.test.js`:
```js
test.skipIf(!RUN)("renders a non-empty PNG of a .scad model", async () => {
  const r = await renderModel(fx("cube.scad"), { size: [640, 480] });
  expect(existsSync(r.path)).toBe(true);
  expect(statSync(r.path).size).toBeGreaterThan(1000);
}, 60000);
```

- [ ] **Step 4: Run the gated render test (if a browser is available)**

Run: `JSCAD_RENDER_TEST=1 npx vitest run test/render.test.js`
Expected: PASS — a `.scad` PNG > 1KB. The local viewer-server must serve `cube.scad` to the viewer's transpile handler; if the viewer shows nothing, confirm the served content-type for `.scad` (add `.scad` to `viewer-server.js` `MIME_TYPES` as `text/plain` if missing) and that the viewer transpiles by extension. If no browser/network, record that and proceed (the default `npm test` skips it).

- [ ] **Step 5: Commit**

```bash
git add test/openscad-tools.test.js test/render.test.js
git commit -m "test(b): tool parity for .scad + real corpus part + gated .scad render"
```

---

### Task 6: Documentation

**Files:**
- Modify: `mcp/README.md`, `README.md`, `bin/jscad-work.js`

**Interfaces:** docs only.

- [ ] **Step 1: Update `mcp/README.md`**

Add a "Model languages" section: every tool accepts `.js` (jscad-fluent) and `.scad` (OpenSCAD) `modelPath`. State that `.scad` is transpiled + evaluated on the Manifold backend and converted to a fluent geometry, that `.scad` files are `require`-able from any model (transparent parts), and that OpenSCAD customizer parameter override is not yet supported (`params` returns `[]` for `.scad`). Note ~90% corpus coverage and that unsupported files return structured errors.

- [ ] **Step 2: Update top-level `README.md`**

In the headless-loop section, note `.scad` models and parts are first-class alongside jscad-fluent.

- [ ] **Step 3: Update the `JSCAD.md` template in `bin/jscad-work.js`**

In `createJscadMd`, add under the model/notes section:
```
- **OpenSCAD parts**: .scad files are first-class — eval/measure/export/check/render work, and any model can `require('./part.scad')` to compose OpenSCAD and jscad-fluent parts.
```

- [ ] **Step 4: Verify + commit**

Run: `npm test` (green, render skipped); `lefthook run pre-commit` (clean).
```bash
git add mcp/README.md README.md bin/jscad-work.js
git commit -m "docs(b): document first-class OpenSCAD .scad models and parts"
```

---

## Self-Review

**Spec coverage:**
- B.1 unified canonical type at require boundary — Tasks 3 (bridge) + 4 (routing). ✓
- B.2 reuse A's tools unchanged — Task 5 verifies measure/export/check/render on `.scad`. ✓
- B.3 synchronous interop via pre-init — Task 4 worker pre-init; Task 3 `initOpenscad`/`registerScadRequire`. ✓
- B.4 directionality (JS→scad, scad→scad includes; scad→js out of scope) — covered by `require.extensions` + transpiler `createMakeRequire`; combo test proves JS→scad. ✓
- Wrapper export + deps — Task 1. Upstream eval helpers — Task 2. ✓
- Deferred (params override, 2D→SVG, catalog) — `params: []` for `.scad` (Task 4); not implemented elsewhere. ✓
- Tests incl. mixed assembly — Task 4 combo. ✓

**Placeholder scan:** none — all code concrete. The one variable (Task 5 corpus filename) has an explicit fallback instruction (pick a geometry-producing, non-skip-listed file and log it), not a silent TBD.

**Type consistency:** `initScadRuntime() → {jscadModeling, openscadRuntime}` consumed by `evalScadSolidSync(path, ctx)`; `manifoldToGeom3(solid.manifold ?? solid) → geom3` consumed by `new FluentGeom3(geom3)`; `loadAndRun` returns A's `{ok, geomType, geom, params}` so `run-model`/`measure`/`export`/`check` work unchanged; `evalScadModel`/`toFluent` both return `FluentGeom3`. Consistent across tasks.
