# Sub-project D — Assembly / Multi-file + Interactive Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-file assemblies, individual parts, and multi-part (array) scenes first-class in the `jscad-studio` MCP, plus best-effort interactive/render polish.

**Architecture:** A recursive CommonJS loader (`vm` + injected require, cached) loads a model's whole local `./*.js`/`.scad` graph as CJS regardless of ambient `type:module`. Arrays returned by `main()` are first-class — tools aggregate per item (combined bbox, summed volume/polys, variadic serialize), never union. A `parts` tool lists an assembly's part files/exports.

**Tech Stack:** Node 22 ESM; `vm`; `@jbroll/jscad-fluent` (+ exported `FluentGeom3`/`FluentGeom2`); real `@jscad/modeling`; `@jscad/*-serializer`; A's runner/measure/export/check; vitest.

## Global Constraints

- **ESM** plugin (`"type":"module"`). Models/parts are CommonJS, loaded via `vm.compileFunction` — never Node `import`. The loader must treat the local `.js` graph as CJS even though the plugin (and `examples/`) inherit `type:module`.
- **Require resolution (the loader's injected `require`):** `@jbroll/jscad-fluent`→fluent; `@jscad/modeling`→REAL `@jscad/modeling`; relative `./`/`../` `.js`→recurse the loader; resolves to `.scad`→`evalScadModel` (B)→`FluentGeom3`; bare package→`createRequire(absPath)(id)`.
- **Cache by resolved absolute path**, seeded with the in-progress `module.exports` before executing (Node-like partial export for cycles; reassigned `module.exports` updates the cache after execution).
- **Arrays are first-class — NEVER union.** `eval` reports `entityCount`=length; `measure` aggregates (combined bbox/dims, Σ volume, Σ polygonCount); `export` uses variadic `serialize(opts, ...items)` (all items as separate solids); `check` aggregates per item (watertight = all, openEdges = Σ, fitsBed on combined bbox); `render` is unchanged (viewer renders arrays natively).
- **Module boundaries (avoid import cycles):** `jf.js` stays a leaf (exports `jf`-internal, `FluentGeom3`, `FluentGeom2` only — no loader). `cjs-loader.js` imports `jf.js` + `openscad.js`. `openscad.js` imports `jf.js`. No edge back into `cjs-loader.js`.
- **Code hygiene:** every commit passes org-hooks Lefthook (biome/tsc/knip/size-cap/gitleaks, 500-line cap). `npm test` = `vitest run`.
- **D.4 is best-effort:** `view`/param-injection are implemented against the live jscadui viewer if a stable API exists; otherwise documented as unsupported, not faked. If D.4 balloons, it splits to sub-project E.

## File Structure

| File | Responsibility |
|---|---|
| `mcp/lib/cjs-loader.js` | `loadCjsModule(absPath, cache)` recursive CJS loader; `loadModel(modelPath)` (top model → main fn). |
| `mcp/lib/jf.js` (modify) | drop `loadModel` (moves to cjs-loader); keep the `jf` instance + `FluentGeom3`/`FluentGeom2`. |
| `mcp/lib/model-loader.js` (modify) | import `loadModel` from `cjs-loader.js`; `normalize` unchanged. |
| `mcp/lib/array-geom.js` | `normalizeItems`, `measureArray`, `exportArray`, `checkArray` (aggregation; no union). |
| `mcp/lib/measure.js`, `export-geom.js`, `check.js` (modify) | `array` branch → array-geom helpers. |
| `mcp/lib/parts.js` | `listParts(modelPath)` → sibling part files + exported names + `hasMain`. |
| `mcp/lib/tools.js`, `mcp/server.js` (modify) | add `parts` tool. |
| `mcp/lib/render.js` (modify, D.4) | honor `view` + param overrides (best-effort). |
| `bin/jscad-work.js` (modify, D.4) | two-loop docs in `JSCAD.md` template. |
| `test/fixtures/assembly/**`, `test/fixtures/scene.js`, `test/*.test.js` | fixtures + tests. |

---

### Task 1: Recursive CJS loader (D.1)

**Files:**
- Create: `mcp/lib/cjs-loader.js`, `test/cjs-loader.test.js`, `test/fixtures/assembly/{top.js,partA.js,partB.js,package.json}`
- Modify: `mcp/lib/jf.js` (remove `loadModel`), `mcp/lib/model-loader.js` (import `loadModel` from cjs-loader)

**Interfaces:**
- Consumes: `jf`, `FluentGeom3` from `jf.js`; `evalScadModel` from `openscad.js`.
- Produces:
  - `loadCjsModule(absPath, cache = new Map()) => moduleExports` — recursive, cached.
  - `loadModel(modelPath) => mainFn` — `loadCjsModule(modelPath, new Map())` then return `.main ?? .default` (throws if not a function). Replaces `jf.js`'s `loadModel` (same signature, so `model-loader.js` only changes its import line).

- [ ] **Step 1: Create the multi-file fixture (with a nested require + ambient type:module)**

`test/fixtures/assembly/package.json`:
```json
{ "type": "module" }
```
`test/fixtures/assembly/partB.js`:
```js
const jf = require("@jbroll/jscad-fluent");
module.exports = { knob: () => jf.cylinder({ radius: 2, height: 4 }) };
```
`test/fixtures/assembly/partA.js`:
```js
const jf = require("@jbroll/jscad-fluent");
const partB = require("./partB.js");
module.exports = { widget: () => jf.cube({ size: 6 }).union(partB.knob().translate([5, 0, 0])) };
```
`test/fixtures/assembly/top.js`:
```js
const jf = require("@jbroll/jscad-fluent");
const partA = require("./partA.js");
const main = () => partA.widget();
module.exports = { main };
```

- [ ] **Step 2: Write the failing test `test/cjs-loader.test.js`**

```js
import { test, expect } from "vitest";
import { loadModel, loadCjsModule } from "../mcp/lib/cjs-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("loads a multi-file assembly across nested CJS requires under type:module", () => {
  const main = loadModel(fx("assembly/top.js"));
  const geom = main({});
  // cube size 6 spans -3..3; knob (r2,h4) at x=5 spans 3..7 → union x = -3..7 = 10
  expect(geom.measureDimensions()[0]).toBeCloseTo(10, 1);
});

test("caches a shared dependency (loaded once)", () => {
  const cache = new Map();
  const a1 = loadCjsModule(fx("assembly/partB.js"), cache);
  const a2 = loadCjsModule(fx("assembly/partB.js"), cache);
  expect(a1).toBe(a2);
});

test("loadModel throws if no main()", () => {
  expect(() => loadModel(fx("assembly/partB.js"))).toThrow(/main/);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/cjs-loader.test.js`
Expected: FAIL ("Cannot find module '../mcp/lib/cjs-loader.js'").

- [ ] **Step 4: Create `mcp/lib/cjs-loader.js`**

```js
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import { evalScadModel } from "./openscad.js";
import { jf } from "./jf.js";

const pluginRequire = createRequire(import.meta.url);
const jscadModeling = pluginRequire("@jscad/modeling");

const resolveRelative = (dir, id) => {
  const base = resolve(dir, id);
  if (base.endsWith(".js") || base.endsWith(".scad")) return base;
  return `${base}.js`;
};

export const loadCjsModule = (absPath, cache = new Map()) => {
  if (cache.has(absPath)) return cache.get(absPath);
  const mod = { exports: {} };
  cache.set(absPath, mod.exports); // seed before executing (cycle tolerance)
  const src = readFileSync(absPath, "utf8");
  const dir = dirname(absPath);
  const req = (id) => {
    if (id === "@jbroll/jscad-fluent") return jf;
    if (id === "@jscad/modeling") return jscadModeling;
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = resolveRelative(dir, id);
      if (resolved.endsWith(".scad")) return evalScadModel(resolved);
      return loadCjsModule(resolved, cache);
    }
    return createRequire(absPath)(id);
  };
  const fn = vm.compileFunction(src, ["module", "exports", "require", "__dirname", "__filename"], {
    filename: absPath,
  });
  fn(mod, mod.exports, req, dir, absPath);
  cache.set(absPath, mod.exports); // update if module.exports was reassigned
  return mod.exports;
};

export const loadModel = (modelPath) => {
  const exports = loadCjsModule(modelPath, new Map());
  const main = exports.main ?? exports.default;
  if (typeof main !== "function") {
    throw new Error("model does not export a main() function");
  }
  return main;
};
```
Note: `jf.js` must export `jf` (the fluent instance) for this import. Add `export` to its `const jf` line in Step 6.

- [ ] **Step 5: Remove `loadModel` from `mcp/lib/jf.js`**

Delete the `loadModel` function and its now-unused imports (`readFileSync`, `createRequire`, `dirname`, `vm`) from `jf.js`. Keep only:
```js
import { createRequire } from "node:module";
const pluginRequire = createRequire(import.meta.url);
export const jf = pluginRequire("@jbroll/jscad-fluent");
export const FluentGeom3 = jf.FluentGeom3;
export const FluentGeom2 = jf.FluentGeom2;
```
(`jf` becomes an export, consumed by `cjs-loader.js`.)

- [ ] **Step 6: Point `model-loader.js` at the new loader**

In `mcp/lib/model-loader.js`, change the import:
```js
import { loadModel } from "./cjs-loader.js";
```
(was `import { ... loadModel } from "./jf.js"`; keep `FluentGeom2`, `FluentGeom3` imports from `./jf.js`). `loadModel`'s signature/behavior is unchanged, so the rest of `model-loader.js` is untouched.

- [ ] **Step 7: Run to verify it passes + no regression**

Run: `npx vitest run test/cjs-loader.test.js` → PASS (3).
Run: `npm test` → all green (the existing model-loader/runner/openscad tests still pass with the relocated `loadModel`).

- [ ] **Step 8: Commit**

```bash
git add mcp/lib/cjs-loader.js mcp/lib/jf.js mcp/lib/model-loader.js test/cjs-loader.test.js test/fixtures/assembly
git commit -m "feat(d): recursive CJS loader for multi-file assemblies"
```

---

### Task 2: Arrays as first-class (D.3)

**Files:**
- Create: `mcp/lib/array-geom.js`, `test/array-geom.test.js`, `test/fixtures/scene.js`
- Modify: `mcp/lib/measure.js`, `mcp/lib/export-geom.js`, `mcp/lib/check.js`

**Interfaces:**
- Consumes: `FluentGeom3`/`FluentGeom2` from `jf.js`; A's `exportGeom`/`checkGeom` for single geoms.
- Produces (`array-geom.js`):
  - `normalizeItems(arr) => fluentItem[]` — wrap raw `@jscad/modeling` geoms; passthrough fluent.
  - `measureArray(arr) => { boundingBox, dimensions, center, volume, polygonCount, entityCount }`.
  - `exportArray(arr, format) => { data: Buffer, bytes, triangleCount, mime }` (variadic serialize; no union).
  - `checkArray(arr, bed) => { empty, manifold, watertight, openEdges, fitsBed, bbox, dimensions, entityCount }`.

- [ ] **Step 1: Create `test/fixtures/scene.js`** (a multi-item, no-union scene)

```js
const jf = require("@jbroll/jscad-fluent");
const main = () => [
  jf.cube({ size: 10 }),
  jf.sphere({ radius: 3 }).translate([20, 0, 0]),
];
module.exports = { main };
```

- [ ] **Step 2: Write the failing test `test/array-geom.test.js`**

```js
import { test, expect } from "vitest";
import { runModel } from "../mcp/lib/runner.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("measure aggregates an array's combined bbox without unioning", async () => {
  const r = await runModel(fx("scene.js"), { outputs: ["eval", "measure"] });
  expect(r.geomType).toBe("array");
  expect(r.entityCount).toBe(2);
  // cube -5..5; sphere r3 at x=20 → 17..23. combined x = -5..23 = 28
  expect(r.measure.dimensions[0]).toBeCloseTo(28, 0);
  expect(r.measure.entityCount).toBe(2);
});

test("export contains all items as separate solids (not unioned)", async () => {
  const r = await runModel(fx("scene.js"), { outputs: ["export"], format: "stl" });
  // a 12-triangle cube + a sphere → strictly more than 12 triangles, both present
  expect(r.export.triangleCount).toBeGreaterThan(12);
  expect(r.export.bytes).toBeGreaterThan(84);
});

test("check aggregates manifoldness over items", async () => {
  const r = await runModel(fx("scene.js"), { outputs: ["check"] });
  expect(r.check.watertight).toBe(true);
  expect(r.check.entityCount).toBe(2);
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/array-geom.test.js`
Expected: FAIL (currently `measureGeom`/`exportGeom`/`checkGeom` have no `array` branch → throw or wrong result).

- [ ] **Step 4: Create `mcp/lib/array-geom.js`**

```js
import { createRequire } from "node:module";
import { FluentGeom2, FluentGeom3 } from "./jf.js";
import { checkGeom } from "./check.js";

const require = createRequire(import.meta.url);
const stl = require("@jscad/stl-serializer");
const threemf = require("@jscad/3mf-serializer");
const obj = require("@jscad/obj-serializer");

const wrapOne = (g) => {
  if (g && typeof g.measureBoundingBox === "function") return g;
  if (g && typeof g === "object" && "polygons" in g) return new FluentGeom3(g);
  if (g && typeof g === "object" && "sides" in g) return new FluentGeom2(g);
  return g;
};

export const normalizeItems = (arr) => arr.map(wrapOne);

const combinedBox = (items) => {
  let lo = [Infinity, Infinity, Infinity];
  let hi = [-Infinity, -Infinity, -Infinity];
  for (const it of items) {
    const bb = it.measureBoundingBox();
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], bb[0][i]);
      hi[i] = Math.max(hi[i], bb[1][i]);
    }
  }
  return [lo, hi];
};

export const measureArray = (arr) => {
  const items = normalizeItems(arr);
  if (items.length === 0) {
    return { boundingBox: [[0, 0, 0], [0, 0, 0]], dimensions: [0, 0, 0], center: [0, 0, 0], volume: 0, polygonCount: 0, entityCount: 0 };
  }
  const [lo, hi] = combinedBox(items);
  let volume = 0;
  let polygonCount = 0;
  for (const it of items) {
    if (typeof it.measureVolume === "function") volume += it.measureVolume();
    if (typeof it.toPolygons === "function") polygonCount += it.toPolygons().length;
  }
  return {
    boundingBox: [lo, hi],
    dimensions: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
    center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    volume,
    polygonCount,
    entityCount: items.length,
  };
};

export const exportArray = (arr, format) => {
  const items = normalizeItems(arr);
  if (format === "stl") {
    const parts = stl.serialize({ binary: true }, ...items);
    const data = Buffer.concat(parts.map((ab) => Buffer.from(ab)));
    return { data, bytes: data.length, triangleCount: (data.length - 84) / 50, mime: "model/stl" };
  }
  if (format === "3mf") {
    const [ab] = threemf.serialize({ compress: true, unit: "millimeter" }, ...items);
    const data = Buffer.from(ab);
    const tris = items.reduce((n, it) => n + (it.toPolygons ? it.toPolygons().reduce((m, p) => m + p.vertices.length - 2, 0) : 0), 0);
    return { data, bytes: data.length, triangleCount: tris, mime: threemf.mimeType };
  }
  if (format === "obj") {
    const [text] = obj.serialize({ triangulate: true }, ...items);
    const data = Buffer.from(text, "utf8");
    const tris = items.reduce((n, it) => n + (it.toPolygons ? it.toPolygons().reduce((m, p) => m + p.vertices.length - 2, 0) : 0), 0);
    return { data, bytes: data.length, triangleCount: tris, mime: obj.mimeType };
  }
  throw new Error(`format ${format} not supported for arrays`);
};

export const checkArray = (arr, bed) => {
  const items = normalizeItems(arr);
  const dims = measureArray(arr);
  if (items.length === 0) {
    return { empty: true, manifold: false, watertight: false, openEdges: 0, fitsBed: true, bbox: dims.boundingBox, dimensions: dims.dimensions, entityCount: 0 };
  }
  let openEdges = 0;
  let watertight = true;
  for (const it of items) {
    const c = checkGeom(it, "geom3", undefined);
    openEdges += c.openEdges ?? 0;
    if (!c.watertight) watertight = false;
  }
  const fitsBed = bed ? dims.dimensions.every((d, i) => d <= bed[i]) : true;
  return { empty: false, manifold: watertight, watertight, openEdges, fitsBed, bbox: dims.boundingBox, dimensions: dims.dimensions, entityCount: items.length };
};
```

- [ ] **Step 5: Wire the `array` branch into the single-geom helpers**

In `mcp/lib/measure.js`, at the top of `measureGeom`:
```js
import { measureArray } from "./array-geom.js";
// ...first line of measureGeom(geom, geomType):
  if (geomType === "array") return measureArray(geom);
```
In `mcp/lib/export-geom.js`, at the top of `exportGeom`:
```js
import { exportArray } from "./array-geom.js";
// ...first line of exportGeom(geom, geomType, format):
  if (geomType === "array") return exportArray(geom, format);
```
In `mcp/lib/check.js`, at the top of `checkGeom`:
```js
import { checkArray } from "./array-geom.js";
// ...first line of checkGeom(geom, geomType, bed):
  if (geomType === "array") return checkArray(geom, bed);
```
NOTE: `array-geom.js` imports `checkGeom` from `check.js` AND `check.js` imports `checkArray` from `array-geom.js` — a 2-module cycle. It is safe because both are used only inside functions (called at runtime, after both modules finish loading), not at module top-level. ESM handles this. (`checkArray` calls `checkGeom(item, "geom3", ...)` per item; `checkGeom`'s array branch only triggers for arrays, never for the individual geom3 items, so no infinite recursion.)

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run test/array-geom.test.js` → PASS (3).
Run: `npm test` → all green (single-geom measure/export/check unaffected — the `array` branch only triggers for `geomType:"array"`).

- [ ] **Step 7: Commit**

```bash
git add mcp/lib/array-geom.js mcp/lib/measure.js mcp/lib/export-geom.js mcp/lib/check.js test/array-geom.test.js test/fixtures/scene.js
git commit -m "feat(d): arrays as first-class geometry (aggregate, no union)"
```

---

### Task 3: `parts` tool (D.2)

**Files:**
- Create: `mcp/lib/parts.js`, `test/parts.test.js`
- Modify: `mcp/lib/tools.js`, `mcp/server.js`

**Interfaces:**
- Produces:
  - `listParts(modelPath) => [{ file, exports: string[], hasMain: boolean }]` — for the model's directory, list sibling `*.js`/`*.scad`, parse each for `module.exports = { ... }` names (regex) and whether it exports/contains `main`.
  - `handlers.parts({ modelPath }) => { content:[{type:"text", text: JSON.stringify({ parts })}] }`.

- [ ] **Step 1: Write the failing test `test/parts.test.js`**

```js
import { test, expect } from "vitest";
import { listParts } from "../mcp/lib/parts.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("lists sibling part files with their exports and main flag", () => {
  const parts = listParts(fx("assembly/top.js"));
  const byFile = Object.fromEntries(parts.map((p) => [p.file, p]));
  expect(byFile["top.js"].hasMain).toBe(true);
  expect(byFile["partA.js"].exports).toContain("widget");
  expect(byFile["partB.js"].exports).toContain("knob");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/parts.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `mcp/lib/parts.js`**

```js
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const exportsOf = (src) => {
  const names = new Set();
  // module.exports = { a, b, c };  (capture the brace body)
  const m = src.match(/module\.exports\s*=\s*\{([^}]*)\}/);
  if (m) {
    for (const part of m[1].split(",")) {
      const name = part.split(":")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // exports.foo = ... / module.exports.foo = ...
  for (const mm of src.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(mm[1]);
  return [...names];
};

export const listParts = (modelPath) => {
  const dir = dirname(modelPath);
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    const ext = extname(f);
    if (ext !== ".js" && ext !== ".scad") continue;
    const src = readFileSync(join(dir, f), "utf8");
    const exps = ext === ".js" ? exportsOf(src) : [];
    out.push({ file: f, exports: exps, hasMain: exps.includes("main") || /\bmain\s*\(/.test(src) || ext === ".scad" });
  }
  return out;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/parts.test.js` → PASS (1).

- [ ] **Step 5: Add the `parts` handler + register it**

In `mcp/lib/tools.js`:
```js
import { listParts } from "./parts.js";
// ...add to the handlers object:
  parts: async ({ modelPath }) =>
    wrap({ parts: listParts(abs(modelPath)) }),
```
(`wrap` and `abs` are the existing helpers in tools.js.)
In `mcp/server.js`:
```js
server.registerTool("parts", {
  description: "List the sibling part files of a multi-file model and their exported names.",
  inputSchema: { modelPath },
}, handlers.parts);
```
(`modelPath` zod is the shared `z.string()` already defined in server.js.)

- [ ] **Step 6: Verify + commit**

Run: `node -e "import('./mcp/server.js').then(()=>setTimeout(()=>process.exit(0),300))"` → exits 0.
Run: `npm test` → green.
```bash
git add mcp/lib/parts.js mcp/lib/tools.js mcp/server.js test/parts.test.js
git commit -m "feat(d): parts tool — list a multi-file project's parts + exports"
```

---

### Task 4: Interactive/render polish (D.4, best-effort)

**Files:**
- Modify: `mcp/lib/render.js`, `bin/jscad-work.js`
- Test: `test/render.test.js` (extend, gated)

**Interfaces:**
- `renderModel(modelPath, { size, view, params })` — honors `view` (camera preset) and `params` (overrides) when the live viewer exposes a usable API; otherwise leaves the default view and notes it.

- [ ] **Step 1: Probe the viewer's camera/param API**

Run the local viewer and inspect the page for a camera/orbit and parameter API:
```bash
node -e "import('./mcp/lib/render.js')" # ensure it imports
```
Then, with `JSCAD_RENDER_TEST=1`, open `http://127.0.0.1:<port>/#test/fixtures/cube.js` in the headless browser (reuse `renderModel`'s page) and evaluate `Object.keys(window)` / look for a camera controller or `setParams` global. Record what exists in the report. **If no stable camera API exists, implement only what works and document `view`/`params` as best-effort/unsupported — do not fake them.**

- [ ] **Step 2: Implement `view` if a camera API exists**

In `mcp/lib/render.js`, after `waitForSelector("canvas")` and the settle, when `opts.view` is set, drive the camera via the discovered API using `page.evaluate(...)`. Keep the default-camera path when `view` is absent or unsupported. (Exact `page.evaluate` body depends on Step 1's findings; if unsupported, skip and record.)

- [ ] **Step 3: Implement `params` injection if supported**

If the viewer exposes a param-set API or honors a URL query, pass `opts.params` accordingly in `renderModel`; else document as unsupported.

- [ ] **Step 4: Extend the gated render test**

Add to `test/render.test.js`:
```js
test.skipIf(!RUN)("renders a view preset to a non-empty PNG", async () => {
  const r = await renderModel(fx("cube.js"), { size: [400, 300], view: "front" });
  expect(existsSync(r.path)).toBe(true);
  expect(statSync(r.path).size).toBeGreaterThan(1000);
}, 60000);
```

- [ ] **Step 5: Two-loop docs in `bin/jscad-work.js`**

In the `createJscadMd` template, add a short "Two loops" note: the interactive browser (scrub sliders in the served viewer) and the headless MCP (`eval`/`measure`/`render` for verification) operate on the same files via the shared viewer-server.

- [ ] **Step 6: Run + commit**

Run: `npm test` (render gated → skipped; suite green).
Run (if browser available): `JSCAD_RENDER_TEST=1 npx vitest run test/render.test.js` → PASS or record the env limitation.
Run: `lefthook run pre-commit` → clean.
```bash
git add mcp/lib/render.js bin/jscad-work.js test/render.test.js
git commit -m "feat(d): render view presets + param injection (best-effort) + two-loop docs"
```

---

## Self-Review

**Spec coverage:**
- D.1 recursive CJS loader — Task 1 (verified by prototype against motor-fun). ✓
- D.2 per-part preview + `parts` tool — Task 3 (preview falls out of D.1; `parts` lists files/exports). ✓
- D.3 arrays first-class, no union — Task 2 (aggregate measure/variadic export/aggregate check; render unchanged). ✓
- D.4 interactive/render polish (best-effort) — Task 4 (probe-then-implement-or-document). ✓
- Module-cycle constraints — Task 1 (jf leaf) + Task 2 Step 5 (check↔array-geom runtime-only cycle, noted). ✓

**Placeholder scan:** Task 4 is intentionally probe-dependent and says so explicitly (implement-or-document, not fake) — that is a real instruction, not a placeholder. Tasks 1–3 have complete, prototype-verified code.

**Type consistency:** `loadModel`/`loadCjsModule` (cjs-loader) consumed by model-loader; `measureArray`/`exportArray`/`checkArray` (array-geom) consumed by measure/export/check via the `array` branch and return the same shapes as the single-geom helpers (`{boundingBox,dimensions,center,volume,polygonCount}` + `entityCount`; `{data,bytes,triangleCount,mime}`; `{empty,manifold,watertight,openEdges,fitsBed,bbox,dimensions}` + `entityCount`); `listParts → [{file,exports,hasMain}]` consumed by `handlers.parts`. Consistent.

**Note:** motor-fun's `main()` returns a 35-item array, so Tasks 1+2 together make `examples/motor-fun/vecto-arm-pivot.js` fully measurable/exportable — a good end-to-end integration check after Task 2.
