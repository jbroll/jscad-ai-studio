# Sub-project A — Core MCP Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Claude Code plugin with a stdio MCP server `jscad-studio` that evaluates, introspects, measures, renders, exports, and checks `jscad-fluent` models headlessly in Node.

**Architecture:** A worker-thread runner loads a CommonJS model via `vm.compileFunction` with a `require` shim (so `@jbroll/jscad-fluent` resolves from the plugin regardless of model location), runs `main(p)` with a jscadui `params-core` proxy that records parameter descriptors and applies value overrides, then computes plain-data outputs (eval status, params, measurements, serialized bytes, manifold check). A separate Playwright-driven `render` tool screenshots the **same** local viewer the interactive loop uses. Tools are thin MCP adapters over the runner.

**Tech Stack:** Node 22 (ESM), `@modelcontextprotocol/sdk` ^1.29, `zod`, `@jbroll/jscad-fluent` (file:../jscad-fluent), `@jscadui/params-core` (file:../jscadui/packages/params-core), `@jscad/stl-serializer` / `@jscad/3mf-serializer` / `@jscad/obj-serializer` / `@jscad/svg-serializer`, `playwright`, `vitest`.

## Global Constraints

- **Module system:** ESM (`"type": "module"`). Model files themselves are CommonJS (`require`/`module.exports`) and are loaded via `vm.compileFunction`, never `import`.
- **jscad-fluent resolution:** models do `require('@jbroll/jscad-fluent')`; the runner's require-shim MUST map both `@jbroll/jscad-fluent` and `@jscad/modeling` to the plugin's single pre-loaded fluent instance, and delegate every other id to a `createRequire(modelPath)`. (Aliasing `@jscad/modeling`→fluent is intentional: the studio standard is jscad-fluent, and a single geometry type avoids two incompatible modeling implementations coexisting. `@jscad/modeling` did become transitively resolvable once the serializers were installed, but the alias is kept deliberately.)
- **Geometry type detection:** `'polygons' in g` ⇒ `geom3`; `'sides' in g` ⇒ `geom2`; `Array.isArray(g)` ⇒ `array`. A `FluentGeom3`/`FluentGeom2` instance IS a valid `@jscad/modeling` geometry (Object.assign pattern) and can be passed directly to serializers.
- **Angles radians, colors 0–1, booleans same-type, immutable** — these are model-author constraints, surfaced in docs (Task 10), not enforced by the engine.
- **All tools return structured results, never throw** to the MCP layer. Model errors are captured as `{ ok:false, error, line }`.
- **Execution timeout:** default 10000 ms, enforced by terminating the worker thread.
- **Code hygiene (already wired):** org-hooks Lefthook is installed; every commit runs gitleaks + biome + tsc + knip + the **500-line source cap**. Keep each `mcp/lib/*` and `mcp/tools/*` file small and single-purpose. `npm test` runs `vitest run`.

## Prerequisites (already completed, do not redo)

- org-hooks wiring committed: `lefthook.yml`, `lefthook-rc.sh`, `biome.json` (extends `../org-hooks/config/biome.base.json`), `tsconfig.json`, `knip.json`, npm scripts (`type-check`, `knip`, `test`), devDeps (biome, typescript, knip, dpdm, lefthook, vitest). `lefthook install` done.

## File Structure

| File | Responsibility |
|---|---|
| `.mcp.json` | Registers `jscad-studio` server via `${CLAUDE_PLUGIN_ROOT}`. |
| `vitest.config.js` | Test config (node environment). |
| `mcp/lib/jf.js` | Resolves the single `@jbroll/jscad-fluent` instance + exposes `loadModel` require-shim helper. |
| `mcp/lib/model-loader.js` | `loadAndRun(modelPath, params)` → load CJS model, build proxy, run `main`, classify result. |
| `mcp/lib/measure.js` | `measureGeom(geom, geomType)` → measurements object. |
| `mcp/lib/export-geom.js` | `exportGeom(geom, geomType, format)` → `{data, bytes, triangleCount, mime}`. |
| `mcp/lib/check.js` | `checkGeom(geom, geomType, bed)` → manifold/watertight/empty/fitsBed. |
| `mcp/lib/run-model.js` | `runModelSync(modelPath, opts)` → orchestrate load + requested outputs (pure, synchronous). |
| `mcp/lib/worker.js` | worker_threads entry: call `runModelSync`, post result. |
| `mcp/lib/runner.js` | `runModel(modelPath, opts)` → spawn worker, enforce timeout, return result. |
| `mcp/lib/viewer-server.js` | `startViewerServer(dir)` → local static-serve + proxy to jscad.rkroll.com (extracted from `bin/jscad-work.js`). |
| `mcp/lib/render.js` | `renderModel(modelPath, opts)` → Playwright headless screenshot of the local viewer. |
| `mcp/server.js` | MCP server: registers `eval`/`params`/`measure`/`export`/`check`/`render` tools. |
| `bin/jscad-work.js` | Refactored to consume `viewer-server.js`. |
| `test/fixtures/*.js` | Test model fixtures (good, broken, non-manifold, 2d). |
| `test/*.test.js` | Vitest suites per module. |

---

### Task 1: Plugin skeleton, dependencies, config

**Files:**
- Create: `.mcp.json`, `vitest.config.js`, `test/fixtures/cube.js`, `test/smoke.test.js`
- Modify: `package.json` (add deps + `bin` unchanged), `knip.json`, `tsconfig.json` already include `mcp/**`

**Interfaces:**
- Produces: installed deps and a green `npm test`; `.mcp.json` registering `node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`.

- [ ] **Step 1: Add runtime + serializer dependencies**

Run:
```bash
npm install @modelcontextprotocol/sdk@^1.29.0 zod@^3.23.0 playwright@^1.61.0 \
  @jscad/stl-serializer@^2.1.13 @jscad/3mf-serializer@^2.1.7 \
  @jscad/obj-serializer@^2.1.13 @jscad/svg-serializer@^2.3.0
```
Then add the two file-linked deps by editing `package.json` `dependencies` to include:
```json
"@jscadui/params-core": "file:../jscadui/packages/params-core"
```
and run `npm install`.

Expected: installs succeed; `node -e "console.log(require.resolve('@jbroll/jscad-fluent'))"` prints a path; `node --input-type=module -e "import('@jscadui/params-core').then(m=>console.log(typeof m.createParamsProxy))"` prints `function`.

- [ ] **Step 2: Create `.mcp.json`**

```json
{
  "mcpServers": {
    "jscad-studio": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/server.js"]
    }
  }
}
```

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
  },
});
```

- [ ] **Step 4: Create `test/fixtures/cube.js`** (a minimal valid model)

```js
const jf = require("@jbroll/jscad-fluent");

const main = (p) => {
  p._type = "Cube";
  p.size = { type: "slider", default: 10, min: 5, max: 20, step: 1, label: "Size", live: true };
  return jf.cube({ size: p.size });
};

module.exports = { main };
```

- [ ] **Step 5: Write the smoke test `test/smoke.test.js`**

```js
import { test, expect } from "vitest";
import { existsSync } from "node:fs";

test("plugin manifest and fixture exist", () => {
  expect(existsSync(".mcp.json")).toBe(true);
  expect(existsSync("test/fixtures/cube.js")).toBe(true);
});
```

- [ ] **Step 6: Run the test**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add .mcp.json vitest.config.js test/ package.json package-lock.json knip.json
git commit -m "feat(a): plugin skeleton, deps, vitest, .mcp.json"
```

---

### Task 2: Model loader (load + proxy + run + classify)

**Files:**
- Create: `mcp/lib/jf.js`, `mcp/lib/model-loader.js`, `test/model-loader.test.js`
- Create: `test/fixtures/broken.js`, `test/fixtures/plate.js` (2D)

**Interfaces:**
- Produces:
  - `jf.js` exports `jf` (the fluent module) and `loadModel(modelPath) => mainFn`.
  - `model-loader.js` exports `loadAndRun(modelPath, params) => { ok, error?, line?, geomType, geom?, params }` where `params` is `state.discovered` (array of `{ path, name, default, type, min?, max?, step?, label?, hidden }`), `geomType` is `'geom3'|'geom2'|'array'|'unknown'`.

- [ ] **Step 1: Write the failing test `test/model-loader.test.js`**

```js
import { test, expect } from "vitest";
import { loadAndRun } from "../mcp/lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("runs a valid geom3 model and lists params", () => {
  const r = loadAndRun(fx("cube.js"), {});
  expect(r.ok).toBe(true);
  expect(r.geomType).toBe("geom3");
  const size = r.params.find((p) => p.name === "size");
  expect(size).toMatchObject({ default: 10, min: 5, max: 20 });
});

test("applies parameter overrides", () => {
  const r = loadAndRun(fx("cube.js"), { size: 20 });
  expect(r.geom.measureDimensions()).toEqual([20, 20, 20]);
});

test("captures a runtime error with a line number", () => {
  const r = loadAndRun(fx("broken.js"), {});
  expect(r.ok).toBe(false);
  expect(typeof r.error).toBe("string");
  expect(r.line).toBeGreaterThan(0);
});

test("classifies a 2D model as geom2", () => {
  const r = loadAndRun(fx("plate.js"), {});
  expect(r.geomType).toBe("geom2");
});
```

- [ ] **Step 2: Create the broken + 2D fixtures**

`test/fixtures/broken.js`:
```js
const jf = require("@jbroll/jscad-fluent");
const main = (p) => {
  p.size = { type: "slider", default: 10, min: 5, max: 20 };
  return jf.cube({ size: p.size }).nonExistentMethod();
};
module.exports = { main };
```

`test/fixtures/plate.js`:
```js
const jf = require("@jbroll/jscad-fluent");
const main = (p) => {
  p.w = { type: "slider", default: 30, min: 10, max: 50 };
  return jf.rectangle({ size: [p.w, p.w] });
};
module.exports = { main };
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/model-loader.test.js`
Expected: FAIL ("Cannot find module '../mcp/lib/model-loader.js'").

- [ ] **Step 4: Create `mcp/lib/jf.js`**

```js
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import vm from "node:vm";

const pluginRequire = createRequire(import.meta.url);
export const jf = pluginRequire("@jbroll/jscad-fluent");

// Load a CommonJS model with a require-shim so @jbroll/jscad-fluent always
// resolves to the plugin's instance regardless of where the model lives.
export const loadModel = (modelPath) => {
  const src = readFileSync(modelPath, "utf8");
  const modelRequire = createRequire(modelPath);
  const shim = (id) =>
    id === "@jbroll/jscad-fluent" || id === "@jscad/modeling" ? jf : modelRequire(id);
  const fn = vm.compileFunction(
    src,
    ["module", "exports", "require", "__dirname", "__filename"],
    { filename: modelPath },
  );
  const mod = { exports: {} };
  fn(mod, mod.exports, shim, dirname(modelPath), modelPath);
  const main = mod.exports.main ?? mod.exports.default;
  if (typeof main !== "function") {
    throw new Error("model does not export a main() function");
  }
  return main;
};
```

- [ ] **Step 5: Create `mcp/lib/model-loader.js`**

```js
import { createParamsProxy, createProxyState } from "@jscadui/params-core";
import { loadModel } from "./jf.js";

const classify = (g) => {
  if (Array.isArray(g)) return "array";
  if (g && typeof g === "object" && "polygons" in g) return "geom3";
  if (g && typeof g === "object" && "sides" in g) return "geom2";
  return "unknown";
};

const errorLine = (err, modelPath) => {
  const stack = String(err.stack || "");
  const re = new RegExp(`${modelPath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}:(\\d+)`);
  const m = stack.match(re);
  return m ? Number(m[1]) : 0;
};

export const loadAndRun = (modelPath, params = {}) => {
  const uiValues = {};
  const userInteracted = new Set();
  for (const [k, v] of Object.entries(params)) {
    uiValues[k] = v;
    userInteracted.add(k);
  }
  const state = createProxyState(uiValues, userInteracted, { mode: "hierarchical" });
  const proxy = createParamsProxy(state);
  try {
    const main = loadModel(modelPath);
    const geom = main(proxy);
    return {
      ok: true,
      geomType: classify(geom),
      geom,
      params: state.discovered,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err.message || err),
      line: errorLine(err, modelPath),
      geomType: "unknown",
      params: state.discovered,
    };
  }
};
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run test/model-loader.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add mcp/lib/jf.js mcp/lib/model-loader.js test/model-loader.test.js test/fixtures/broken.js test/fixtures/plate.js
git commit -m "feat(a): model loader with require-shim and params proxy"
```

---

### Task 3: Measurements

**Files:**
- Create: `mcp/lib/measure.js`, `test/measure.test.js`

**Interfaces:**
- Consumes: a `geom` + `geomType` from `loadAndRun`.
- Produces: `measureGeom(geom, geomType) => { boundingBox, dimensions, center, polygonCount, volume? (geom3), area? (geom2) }`.

- [ ] **Step 1: Write the failing test `test/measure.test.js`**

```js
import { test, expect } from "vitest";
import { loadAndRun } from "../mcp/lib/model-loader.js";
import { measureGeom } from "../mcp/lib/measure.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("measures a geom3 cube", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const m = measureGeom(geom, geomType);
  expect(m.dimensions).toEqual([10, 10, 10]);
  expect(m.volume).toBeCloseTo(1000, 3);
  expect(m.polygonCount).toBeGreaterThan(0);
});

test("measures a geom2 plate with area", () => {
  const { geom, geomType } = loadAndRun(fx("plate.js"), {});
  const m = measureGeom(geom, geomType);
  expect(m.area).toBeCloseTo(900, 3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/measure.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `mcp/lib/measure.js`**

```js
export const measureGeom = (geom, geomType) => {
  const out = {
    boundingBox: geom.measureBoundingBox(),
    dimensions: geom.measureDimensions(),
    center: geom.measureCenter(),
  };
  if (geomType === "geom3") {
    out.volume = geom.measureVolume();
    out.polygonCount = geom.toPolygons().length;
  } else if (geomType === "geom2") {
    out.area = geom.measureArea();
    out.polygonCount = geom.toOutlines().length;
  }
  return out;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/measure.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/measure.js test/measure.test.js
git commit -m "feat(a): geometry measurements"
```

---

### Task 4: Export (STL / 3MF / OBJ / SVG)

**Files:**
- Create: `mcp/lib/export-geom.js`, `test/export-geom.test.js`

**Interfaces:**
- Consumes: `geom` + `geomType` from `loadAndRun`.
- Produces: `exportGeom(geom, geomType, format) => { data: Buffer, bytes: number, triangleCount: number, mime: string }`. `format` ∈ `stl|3mf|obj|svg`. `svg` requires `geom2`; `stl/3mf/obj` require `geom3` — otherwise throw `Error("format X requires geomType Y")`.

- [ ] **Step 1: Write the failing test `test/export-geom.test.js`**

```js
import { test, expect } from "vitest";
import { loadAndRun } from "../mcp/lib/model-loader.js";
import { exportGeom } from "../mcp/lib/export-geom.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("exports a binary STL with a header and triangles", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const r = exportGeom(geom, geomType, "stl");
  expect(r.mime).toMatch(/stl/);
  expect(r.bytes).toBeGreaterThan(84); // 80-byte header + 4-byte count
  expect(r.triangleCount).toBe(12); // a cube = 12 triangles
});

test("exports OBJ text", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const r = exportGeom(geom, geomType, "obj");
  expect(r.data.toString("utf8")).toMatch(/^v /m);
});

test("rejects STL for a 2D model", () => {
  const { geom, geomType } = loadAndRun(fx("plate.js"), {});
  expect(() => exportGeom(geom, geomType, "stl")).toThrow(/requires/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/export-geom.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `mcp/lib/export-geom.js`**

```js
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const stl = require("@jscad/stl-serializer");
const threemf = require("@jscad/3mf-serializer");
const obj = require("@jscad/obj-serializer");
const svg = require("@jscad/svg-serializer");

const need = (format, geomType, want) => {
  if (geomType !== want) throw new Error(`format ${format} requires geomType ${want}`);
};

export const exportGeom = (geom, geomType, format) => {
  switch (format) {
    case "stl": {
      need("stl", geomType, "geom3");
      const [u8] = stl.serialize({ binary: true }, geom);
      const data = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
      return { data, bytes: data.length, triangleCount: (data.length - 84) / 50, mime: stl.mimeType };
    }
    case "3mf": {
      need("3mf", geomType, "geom3");
      const [u8] = threemf.serialize({ compress: true, unit: "millimeter" }, geom);
      const data = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
      return { data, bytes: data.length, triangleCount: geom.toPolygons().length, mime: threemf.mimeType };
    }
    case "obj": {
      need("obj", geomType, "geom3");
      const [text] = obj.serialize({ triangulate: true }, geom);
      const data = Buffer.from(text, "utf8");
      return { data, bytes: data.length, triangleCount: geom.toPolygons().length, mime: obj.mimeType };
    }
    case "svg": {
      need("svg", geomType, "geom2");
      const [text] = svg.serialize({ unit: "mm" }, geom);
      const data = Buffer.from(text, "utf8");
      return { data, bytes: data.length, triangleCount: 0, mime: svg.mimeType };
    }
    default:
      throw new Error(`unknown format ${format}`);
  }
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/export-geom.test.js`
Expected: PASS (3 tests). If `triangleCount` for the cube is not exactly 12, adjust the assertion to `toBeGreaterThanOrEqual(12)` — the cube may serialize as 12 triangles from 6 quad polygons.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/export-geom.js test/export-geom.test.js
git commit -m "feat(a): STL/3MF/OBJ/SVG export"
```

---

### Task 5: Manifold / watertight / bed-fit check

**Files:**
- Create: `mcp/lib/check.js`, `test/check.test.js`, `test/fixtures/open.js`

**Interfaces:**
- Consumes: `geom` + `geomType` + optional `bed` (`[x,y,z]` mm).
- Produces: `checkGeom(geom, geomType, bed?) => { empty, manifold, watertight, openEdges, fitsBed, bbox, dimensions, notes: string[] }`. For non-`geom3` input, returns `{ notes: ["check only supports geom3"], ... }` with booleans false.

- [ ] **Step 1: Write the failing test `test/check.test.js`**

```js
import { test, expect } from "vitest";
import { loadAndRun } from "../mcp/lib/model-loader.js";
import { checkGeom } from "../mcp/lib/check.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("a solid cube is watertight and manifold", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const c = checkGeom(geom, geomType, [200, 200, 200]);
  expect(c.watertight).toBe(true);
  expect(c.manifold).toBe(true);
  expect(c.openEdges).toBe(0);
  expect(c.fitsBed).toBe(true);
});

test("flags a model larger than the bed", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), { size: 20 });
  const c = checkGeom(geom, geomType, [10, 10, 10]);
  expect(c.fitsBed).toBe(false);
});

test("flags an open (non-watertight) mesh", () => {
  const { geom, geomType } = loadAndRun(fx("open.js"), {});
  const c = checkGeom(geom, geomType);
  expect(c.watertight).toBe(false);
  expect(c.openEdges).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Create `test/fixtures/open.js`** (a single polygon → open edges)

```js
const jf = require("@jbroll/jscad-fluent");
const main = () => jf.polyhedron({
  points: [[0, 0, 0], [10, 0, 0], [0, 10, 0]],
  faces: [[0, 1, 2]],
});
module.exports = { main };
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/check.test.js`
Expected: FAIL (module not found).

- [ ] **Step 4: Create `mcp/lib/check.js`**

```js
const Q = 1e6; // quantize vertex coords to merge near-duplicate edge endpoints
const vkey = (v) => `${Math.round(v[0] * Q)},${Math.round(v[1] * Q)},${Math.round(v[2] * Q)}`;

export const checkGeom = (geom, geomType, bed) => {
  const dimensions = geom.measureDimensions();
  const bbox = geom.measureBoundingBox();
  const base = { bbox, dimensions, notes: [] };
  const fitsBed = bed ? dimensions.every((d, i) => d <= bed[i]) : true;

  if (geomType !== "geom3") {
    return { ...base, empty: true, manifold: false, watertight: false, openEdges: 0, fitsBed, notes: ["check only supports geom3"] };
  }

  const polys = geom.toPolygons();
  if (polys.length === 0) {
    return { ...base, empty: true, manifold: false, watertight: false, openEdges: 0, fitsBed };
  }

  const edges = new Map();
  for (const poly of polys) {
    const vs = poly.vertices;
    for (let i = 0; i < vs.length; i++) {
      const a = vkey(vs[i]);
      const b = vkey(vs[(i + 1) % vs.length]);
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  let openEdges = 0;
  for (const count of edges.values()) if (count !== 2) openEdges++;
  const watertight = openEdges === 0;

  base.notes.push("wall-thickness analysis not implemented (deferred)");
  return { ...base, empty: false, manifold: watertight, watertight, openEdges, fitsBed };
};
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run test/check.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add mcp/lib/check.js test/check.test.js test/fixtures/open.js
git commit -m "feat(a): manifold/watertight/bed-fit check"
```

---

### Task 6: Synchronous orchestrator + threaded runner with timeout

**Files:**
- Create: `mcp/lib/run-model.js`, `mcp/lib/worker.js`, `mcp/lib/runner.js`, `test/runner.test.js`
- Create: `test/fixtures/infinite.js`

**Interfaces:**
- Produces:
  - `runModelSync(modelPath, { params, outputs, format, bed }) => result` (synchronous, plain-data). `outputs` is an array subset of `['eval','params','measure','export','check']`. Result fields: always `{ ok, error?, line?, geomType }`; plus `params` (mapped descriptors) when requested; `measure`; `export: { base64, bytes, triangleCount, mime }`; `check`.
  - `runModel(modelPath, opts) => Promise<result>` — runs `runModelSync` in a worker thread, terminating after `opts.timeoutMs` (default 10000) with `{ ok:false, error:"timeout" }`.
- Mapped param descriptor shape (the `params` output): `{ name, type, default, min, max, step, label }` (drop `hidden` entries).

- [ ] **Step 1: Write the failing test `test/runner.test.js`**

```js
import { test, expect } from "vitest";
import { runModel } from "../mcp/lib/runner.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("eval + params + measure over a worker thread", async () => {
  const r = await runModel(fx("cube.js"), { outputs: ["eval", "params", "measure"] });
  expect(r.ok).toBe(true);
  expect(r.geomType).toBe("geom3");
  expect(r.params.find((p) => p.name === "size").default).toBe(10);
  expect(r.measure.dimensions).toEqual([10, 10, 10]);
});

test("export returns base64 STL", async () => {
  const r = await runModel(fx("cube.js"), { outputs: ["export"], format: "stl" });
  expect(r.export.mime).toMatch(/stl/);
  expect(Buffer.from(r.export.base64, "base64").length).toBe(r.export.bytes);
});

test("times out on an infinite loop", async () => {
  const r = await runModel(fx("infinite.js"), { outputs: ["eval"], timeoutMs: 1000 });
  expect(r.ok).toBe(false);
  expect(r.error).toBe("timeout");
});
```

- [ ] **Step 2: Create `test/fixtures/infinite.js`**

```js
const main = () => {
  while (true) {} // eslint-disable-line no-constant-condition
};
module.exports = { main };
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/runner.test.js`
Expected: FAIL (module not found).

- [ ] **Step 4: Create `mcp/lib/run-model.js`**

```js
import { loadAndRun } from "./model-loader.js";
import { measureGeom } from "./measure.js";
import { exportGeom } from "./export-geom.js";
import { checkGeom } from "./check.js";

const mapParams = (discovered) =>
  discovered
    .filter((d) => !d.hidden)
    .map((d) => ({ name: d.name, type: d.type, default: d.default, min: d.min, max: d.max, step: d.step, label: d.label }));

export const runModelSync = (modelPath, opts = {}) => {
  const { params = {}, outputs = ["eval"], format = "stl", bed } = opts;
  const run = loadAndRun(modelPath, params);
  const result = { ok: run.ok, geomType: run.geomType };
  if (!run.ok) {
    result.error = run.error;
    result.line = run.line;
    if (outputs.includes("params")) result.params = mapParams(run.params);
    return result;
  }
  if (outputs.includes("eval")) {
    result.entityCount = run.geomType === "array" ? run.geom.length : 1;
  }
  if (outputs.includes("params")) result.params = mapParams(run.params);
  if (outputs.includes("measure")) result.measure = measureGeom(run.geom, run.geomType);
  if (outputs.includes("check")) result.check = checkGeom(run.geom, run.geomType, bed);
  if (outputs.includes("export")) {
    const e = exportGeom(run.geom, run.geomType, format);
    result.export = { base64: e.data.toString("base64"), bytes: e.bytes, triangleCount: e.triangleCount, mime: e.mime };
  }
  return result;
};
```

- [ ] **Step 5: Create `mcp/lib/worker.js`**

```js
import { parentPort, workerData } from "node:worker_threads";
import { runModelSync } from "./run-model.js";

try {
  const result = runModelSync(workerData.modelPath, workerData.opts);
  parentPort.postMessage(result);
} catch (err) {
  parentPort.postMessage({ ok: false, error: String(err.message || err), geomType: "unknown" });
}
```

- [ ] **Step 6: Create `mcp/lib/runner.js`**

```js
import { Worker } from "node:worker_threads";

const WORKER = new URL("./worker.js", import.meta.url);

export const runModel = (modelPath, opts = {}) => {
  const { timeoutMs = 10000, ...rest } = opts;
  return new Promise((resolve) => {
    const worker = new Worker(WORKER, { workerData: { modelPath, opts: rest } });
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(value);
    };
    const timer = setTimeout(() => finish({ ok: false, error: "timeout", geomType: "unknown" }), timeoutMs);
    worker.on("message", finish);
    worker.on("error", (err) => finish({ ok: false, error: String(err.message || err), geomType: "unknown" }));
  });
};
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run test/runner.test.js`
Expected: PASS (3 tests). The timeout test should complete in ~1s.

- [ ] **Step 8: Commit**

```bash
git add mcp/lib/run-model.js mcp/lib/worker.js mcp/lib/runner.js test/runner.test.js test/fixtures/infinite.js
git commit -m "feat(a): orchestrator + threaded runner with timeout"
```

---

### Task 7: MCP server (eval / params / measure / export / check tools)

**Files:**
- Create: `mcp/server.js`, `test/server-tools.test.js`
- Create: `mcp/lib/tools.js` (the tool handler functions, kept separate from transport wiring so they are unit-testable)

**Interfaces:**
- Consumes: `runModel` from `runner.js`.
- Produces:
  - `mcp/lib/tools.js` exports `handlers` = `{ eval, params, measure, export: exportTool, check }`, each `async (args) => mcpToolResult` where `mcpToolResult` is `{ content: [{ type: "text", text: JSON.stringify(result) }] }`. Each resolves `args.modelPath` against `process.cwd()` via `path.resolve`.
  - `mcp/server.js` registers each handler on an `McpServer` and connects a `StdioServerTransport`.

- [ ] **Step 1: Write the failing test `test/server-tools.test.js`**

```js
import { test, expect } from "vitest";
import { handlers } from "../mcp/lib/tools.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

const parse = (res) => JSON.parse(res.content[0].text);

test("eval handler returns ok for a valid model", async () => {
  const res = await handlers.eval({ modelPath: fx("cube.js") });
  expect(parse(res).ok).toBe(true);
});

test("measure handler returns dimensions", async () => {
  const res = await handlers.measure({ modelPath: fx("cube.js") });
  expect(parse(res).measure.dimensions).toEqual([10, 10, 10]);
});

test("params handler lists sliders", async () => {
  const res = await handlers.params({ modelPath: fx("cube.js") });
  expect(parse(res).params.some((p) => p.name === "size")).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/server-tools.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `mcp/lib/tools.js`**

```js
import { resolve } from "node:path";
import { runModel } from "./runner.js";

const wrap = (result) => ({ content: [{ type: "text", text: JSON.stringify(result) }] });
const abs = (modelPath) => resolve(process.cwd(), modelPath);

export const handlers = {
  eval: async ({ modelPath, params }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["eval"] })),
  params: async ({ modelPath }) =>
    wrap(await runModel(abs(modelPath), { outputs: ["params"] })),
  measure: async ({ modelPath, params }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["measure"] })),
  export: async ({ modelPath, params, format }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["export"], format: format ?? "stl" })),
  check: async ({ modelPath, params, bed }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["check"], bed })),
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/server-tools.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `mcp/server.js`** (transport wiring; not unit-tested)

```js
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handlers } from "./lib/tools.js";

const server = new McpServer({ name: "jscad-studio", version: "0.1.0" });
const modelPath = z.string().describe("path to the model .js file (relative to cwd or absolute)");
const params = z.record(z.number()).optional().describe("parameter name -> value overrides");

server.registerTool("eval", { description: "Run a model headlessly; report errors, geometry type, entity count.", inputSchema: { modelPath, params } }, handlers.eval);
server.registerTool("params", { description: "List a model's declared parameters.", inputSchema: { modelPath } }, handlers.params);
server.registerTool("measure", { description: "Measure bounding box, dimensions, volume/area, polygon count.", inputSchema: { modelPath, params } }, handlers.measure);
server.registerTool("export", { description: "Export STL/3MF/OBJ/SVG (base64).", inputSchema: { modelPath, params, format: z.enum(["stl", "3mf", "obj", "svg"]).optional() } }, handlers.export);
server.registerTool("check", { description: "Manifold/watertight/empty/bed-fit check.", inputSchema: { modelPath, params, bed: z.array(z.number()).length(3).optional() } }, handlers.check);

await server.connect(new StdioServerTransport());
```

- [ ] **Step 6: Smoke-test the server boots**

Run: `node -e "import('./mcp/server.js').then(()=>setTimeout(()=>process.exit(0),300))"`
Expected: no import/registration errors (process exits 0). The server will wait on stdio; the timeout exit is expected.

- [ ] **Step 7: Commit**

```bash
git add mcp/lib/tools.js mcp/server.js test/server-tools.test.js
git commit -m "feat(a): MCP server exposing eval/params/measure/export/check"
```

---

### Task 8: Extract the viewer server from jscad-work

**Files:**
- Create: `mcp/lib/viewer-server.js`, `test/viewer-server.test.js`
- Modify: `bin/jscad-work.js` (replace inline server/proxy/MIME with imports from `viewer-server.js`)

**Interfaces:**
- Produces: `viewer-server.js` exports `startViewerServer(directory) => Promise<{ server, port, viewerUrl(model) }>` where `viewerUrl(model)` returns `http://127.0.0.1:<port>/#<model>`. It serves local files from `directory`, and proxies anything missing (and `/`) to `jscad.rkroll.com:443`. `MIME_TYPES` is exported too.

- [ ] **Step 1: Write the failing test `test/viewer-server.test.js`**

```js
import { test, expect, afterAll } from "vitest";
import { startViewerServer } from "../mcp/lib/viewer-server.js";

let handle;
afterAll(() => handle?.server.close());

test("serves a local model file", async () => {
  const dir = new URL("./fixtures/", import.meta.url).pathname;
  handle = await startViewerServer(dir);
  const res = await fetch(`http://127.0.0.1:${handle.port}/cube.js`);
  const body = await res.text();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/javascript/);
  expect(body).toMatch(/module.exports/);
});

test("viewerUrl formats the hash", () => {
  expect(handle.viewerUrl("cube.js")).toBe(`http://127.0.0.1:${handle.port}/#cube.js`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/viewer-server.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `mcp/lib/viewer-server.js`** (move logic verbatim from `bin/jscad-work.js` lines 36–128)

```js
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFile } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";

const UPSTREAM_HOST = "jscad.rkroll.com";
const UPSTREAM_PORT = 443;

export const MIME_TYPES = {
  ".js": "application/javascript", ".mjs": "application/javascript", ".json": "application/json",
  ".html": "text/html", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".stl": "model/stl", ".obj": "text/plain",
  ".mtl": "text/plain", ".3mf": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  ".amf": "application/x-amf", ".dxf": "application/dxf", ".x3d": "model/x3d+xml",
};

const proxyToUpstream = (req, res, pathname) => {
  const proxyReq = httpsRequest(
    { hostname: UPSTREAM_HOST, port: UPSTREAM_PORT, path: pathname, method: req.method, headers: { ...req.headers, host: UPSTREAM_HOST } },
    (proxyRes) => { res.writeHead(proxyRes.statusCode, proxyRes.headers); proxyRes.pipe(res); },
  );
  proxyReq.on("error", () => { res.writeHead(502); res.end("Proxy error"); });
  req.pipe(proxyReq);
};

export const startViewerServer = (directory) =>
  new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const { pathname } = new URL(req.url, `http://${req.headers.host}`);
      if (pathname === "/") return proxyToUpstream(req, res, "/");
      try {
        const localPath = pathResolve(directory, "." + pathname);
        const content = await readFile(localPath);
        const ext = localPath.substring(localPath.lastIndexOf("."));
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
        res.end(content);
      } catch (err) {
        if (err.code === "ENOENT") return proxyToUpstream(req, res, pathname);
        res.writeHead(500); res.end("Server error");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, viewerUrl: (model) => `http://127.0.0.1:${port}/#${model}` });
    });
    server.on("error", reject);
  });
```

- [ ] **Step 4: Refactor `bin/jscad-work.js`** to import the extracted server

Replace the inline `MIME_TYPES`, `proxyToUpstream`, and `startHttpServer` definitions (lines 36–128) with:
```js
import { startViewerServer } from "../mcp/lib/viewer-server.js";
```
and replace the `startHttpServer(cwd)` call site (around line 249) with:
```js
const { server, port } = await startViewerServer(cwd);
```
Leave all console output, `createJscadMd`, and `createConfig` unchanged.

- [ ] **Step 5: Run the test + verify jscad-work still starts**

Run: `npx vitest run test/viewer-server.test.js`
Expected: PASS (2 tests).
Run: `node bin/jscad-work.js cube.js` from `test/fixtures/` then Ctrl-C.
Expected: prints the server/viewer banner with a port; no errors.

- [ ] **Step 6: Commit**

```bash
git add mcp/lib/viewer-server.js bin/jscad-work.js test/viewer-server.test.js
git commit -m "refactor(a): extract viewer-server; jscad-work consumes it"
```

---

### Task 9: Headless render tool

**Files:**
- Create: `mcp/lib/render.js`, `test/render.test.js`
- Modify: `mcp/lib/tools.js` (add `render` handler), `mcp/server.js` (register `render`)

**Interfaces:**
- Consumes: `startViewerServer`.
- Produces: `renderModel(modelPath, { size, outPath }) => Promise<{ path, width, height }>`. Launches a cached headless Chromium, navigates the local viewer to `#<model>`, waits for a `<canvas>` to be present and a fixed settle, screenshots the canvas to `outPath` (default: a temp PNG). Exposes `closeRender()` to dispose the browser + servers (used in test teardown).
- `tools.js` gains `handlers.render` returning `{ content: [{ type: "text", text: JSON.stringify({ path, width, height }) }] }`.
- NOTE: the `view` (camera preset) and live `params` injection into the running viewer are deferred to sub-project D. `render` accepts and ignores a `view` arg in A; it screenshots the viewer's default camera. State this in the tool description.

- [ ] **Step 1: Install the Chromium browser binary**

Run: `npx playwright install chromium`
Expected: downloads Chromium (or reports already installed). If the environment provides a system Chromium, `render.js` will honor `JSCAD_CHROMIUM` (see Step 3).

- [ ] **Step 2: Write the gated integration test `test/render.test.js`**

```js
import { test, expect, afterAll } from "vitest";
import { existsSync, statSync } from "node:fs";
import { renderModel, closeRender } from "../mcp/lib/render.js";

const RUN = process.env.JSCAD_RENDER_TEST === "1";
const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

afterAll(async () => { if (RUN) await closeRender(); });

test.skipIf(!RUN)("renders a non-empty PNG of the model", async () => {
  const r = await renderModel(fx("cube.js"), { size: [640, 480] });
  expect(existsSync(r.path)).toBe(true);
  expect(statSync(r.path).size).toBeGreaterThan(1000);
  expect(r.width).toBe(640);
}, 60000);
```

- [ ] **Step 3: Create `mcp/lib/render.js`**

```js
import { chromium } from "playwright";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { startViewerServer } from "./viewer-server.js";

let browser;
const servers = new Map(); // directory -> handle

const getBrowser = async () => {
  if (!browser) {
    browser = await chromium.launch({ executablePath: process.env.JSCAD_CHROMIUM || undefined });
  }
  return browser;
};

const getServer = async (dir) => {
  if (!servers.has(dir)) servers.set(dir, await startViewerServer(dir));
  return servers.get(dir);
};

export const renderModel = async (modelPath, opts = {}) => {
  const { size = [800, 600], outPath } = opts;
  const dir = dirname(modelPath);
  const model = basename(modelPath);
  const { port } = await getServer(dir);
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: size[0], height: size[1] } });
  try {
    await page.goto(`http://127.0.0.1:${port}/#${model}`, { waitUntil: "load" });
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2500); // settle: model eval + first render
    const path = outPath || join(tmpdir(), `jscad-${model}-${size[0]}x${size[1]}.png`);
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({ path });
    return { path, width: size[0], height: size[1] };
  } finally {
    await page.close();
  }
};

export const closeRender = async () => {
  for (const { server } of servers.values()) server.close();
  servers.clear();
  if (browser) { await browser.close(); browser = undefined; }
};
```

- [ ] **Step 4: Run the gated test**

Run: `JSCAD_RENDER_TEST=1 npx vitest run test/render.test.js`
Expected: PASS (1 test) — a PNG > 1KB is produced.
If the canvas selector or settle timing proves wrong against the live viewer, probe the running app (open `http://127.0.0.1:<port>/#cube.js` in a browser, inspect the canvas element and any render-complete global) and adjust the selector / replace the fixed `waitForTimeout` with a `page.waitForFunction` on the viewer's ready signal. The deliverable is a non-empty PNG.

Run (default, gate off): `npm test`
Expected: render test is skipped; all other suites pass.

- [ ] **Step 5: Add the `render` handler to `mcp/lib/tools.js`**

```js
import { renderModel } from "./render.js";
// ...add to the handlers object:
  render: async ({ modelPath, size }) => {
    const r = await renderModel(abs(modelPath), { size });
    return { content: [{ type: "text", text: JSON.stringify(r) }] };
  },
```

- [ ] **Step 6: Register `render` in `mcp/server.js`**

```js
server.registerTool("render", { description: "Offscreen PNG of the model from the local headless viewer (default camera; view/params injection is a future enhancement).", inputSchema: { modelPath, size: z.array(z.number()).length(2).optional() } }, handlers.render);
```

- [ ] **Step 7: Commit**

```bash
git add mcp/lib/render.js test/render.test.js mcp/lib/tools.js mcp/server.js
git commit -m "feat(a): headless render tool via Playwright"
```

---

### Task 10: Plugin documentation + final integration

**Files:**
- Create: `mcp/README.md`
- Modify: `README.md` (document the plugin + MCP tools + headless loop), `JSCAD.md` template generation in `bin/jscad-work.js` (mention the MCP tools as the inner loop)

**Interfaces:**
- Produces: human-facing docs. No new code interfaces.

- [ ] **Step 1: Write `mcp/README.md`** documenting each tool

Document, for each of `eval`/`params`/`measure`/`export`/`check`/`render`: purpose, inputs (`modelPath`, `params`, plus tool-specific), and the JSON result shape, copied from the Interfaces blocks above. State the model-author constraints (radians, colors 0–1, same-type booleans, immutability) and that `eval`/`params`/`measure`/`export`/`check` are offline pure-Node while `render` needs Chromium.

- [ ] **Step 2: Update the top-level `README.md`**

Add a "Headless loop (MCP)" section: install the plugin (the `.mcp.json` registers `jscad-studio`), then Claude can `eval`/`measure`/`render` a model without a browser. Keep the existing two-terminal interactive flow as the "interactive loop".

- [ ] **Step 3: Update the `JSCAD.md` template** in `bin/jscad-work.js` (`createJscadMd`)

Add a line under "Edit-Preview Workflow":
```
- **Inner loop (no browser)**: use the jscad-studio MCP tools — `eval` to catch errors, `measure` to verify dimensions, `render` for a PNG — then reload the browser only for final visual confirmation.
```

- [ ] **Step 4: Run the full suite + hooks**

Run: `npm test`
Expected: all suites green (render skipped).
Run: `lefthook run pre-commit`
Expected: all checks pass (secrets, hygiene, biome, type-check, knip, size-cap).

- [ ] **Step 5: Commit**

```bash
git add mcp/README.md README.md bin/jscad-work.js
git commit -m "docs(a): document jscad-studio MCP tools and headless loop"
```

---

## Self-Review

**Spec coverage:**
- A.0 org-hooks — done as prerequisite. ✓
- A.1 runner (proxy reuse, require-shim, worker timeout) — Tasks 2, 6. ✓
- A.2 tools eval/params/measure/render/export/check — Tasks 3–9. ✓
- A.3 headless render via same viewer (extract viewer-server, Playwright) — Tasks 8, 9. ✓
- A.4 plugin skeleton/packaging (.mcp.json, deps) — Task 1. ✓
- A.5 testing (example models, broken model, STL header, manifold, gated render) — every task is TDD; gated render in Task 9. ✓
- A.6 error handling (structured errors, timeout, temp output) — Tasks 2, 6, 9. ✓
- A.7 out of scope (catalog/skills/assembly/wall-thickness) — not in plan; wall-thickness noted in `check`. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" — all code is concrete. The render `view`/param-injection deferral is explicitly stated, not a hidden gap.

**Type consistency:** `loadAndRun` returns `{ ok, geomType, geom, params }`; `measureGeom(geom, geomType)`, `exportGeom(geom, geomType, format)`, `checkGeom(geom, geomType, bed)` consume exactly those; `runModelSync`/`runModel` produce `{ ok, geomType, params, measure, export:{base64,bytes,triangleCount,mime}, check }`; `handlers.*` wrap that JSON; `startViewerServer` returns `{ server, port, viewerUrl }` consumed by `render.js` and `bin/jscad-work.js`. Consistent across tasks.
