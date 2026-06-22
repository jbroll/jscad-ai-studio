# Sub-project D — Assembly / Multi-file + Interactive Polish — Design

**Date:** 2026-06-22
**Status:** Approved (design). Follows A (core MCP engine), B (OpenSCAD parts), C (model catalog), all shipped.
**Parent:** `2026-06-21-jscad-ai-cad-system-design.md`.

## Summary

Make multi-file assemblies, individual parts, and multi-part (array) scenes first-class in the `jscad-studio` MCP, and polish the interactive browser loop. The core fix: a recursive CommonJS loader so a model can `require('./part.js')` across a whole local dependency graph regardless of any ambient `type:module` — which currently breaks the canonical `examples/motor-fun/` assembly.

## Background (verified)

- The `motor-fun` assembly (`vecto-arm-pivot.js` requires `./nema17.js`, `./bearing.js`, … which `module.exports` parts) **fails today** via `runModel`: `require is not defined in ES module scope`. The top model loads via our `vm` shim, but its nested `require('./part.js')` delegates to Node's real `require`, which — because the plugin's `package.json` has `"type":"module"` (inherited by `examples/`) — treats the CJS part files as ESM and throws.
- JSCAD renders an array returned from `main()` as **separate items** (each with its own transform/color). Unioning is wrong (merges colored parts, drops colors). Arrays must be a valid first-class result.
- The jscadui viewer already renders both `.js` arrays and `.scad` natively; A's `render` tool drives it.
- A deferred `view` (camera preset) and live param injection in `render`; both need the live viewer's API.

## Decisions (from brainstorming)

- **Multi-file:** a recursive CJS loader for local `./*.js` (and `.scad`) requires, independent of ambient `type:module`. The must-have.
- **Per-part preview:** falls out of the loader (point existing tools at a part file's `main`); add a small `parts` listing tool.
- **Arrays:** first-class via **aggregation, not union** — combined bbox/summed volume+polys for `measure`, variadic serialize for `export`, per-item+combined for `check`, viewer-native `render`.
- **Interactive/render polish:** view presets, live param injection, two-loop docs — **best-effort final phase (D.4), splittable to sub-project E** if the live-viewer probing balloons.

## Architecture

```
mcp/lib/cjs-loader.js     loadCjsModule(absPath, shimResolve, cache) — recursive vm+shim CJS loader
mcp/lib/jf.js (modify)    loadModel delegates to cjs-loader; shim resolves fluent/modeling/relative/.scad/bare
mcp/lib/array-geom.js     normalizeItems + measureArray/exportArray/checkArray aggregation helpers
mcp/lib/measure.js, export-geom.js, check.js (modify)  array branch -> array-geom helpers
mcp/lib/run-model.js (modify)   route geomType:"array" through the aggregation helpers
mcp/lib/parts.js          listParts(modelPath) -> sibling part files + exported names
mcp/lib/tools.js, server.js (modify)  add `parts` tool
mcp/lib/render.js (modify)  D.4: view presets + param injection (best-effort)
bin/jscad-work.js (modify)  D.4: document/wire the two-loop
```

### D.1 Recursive CJS loader (`mcp/lib/cjs-loader.js`)
`loadCjsModule(absPath, cache = new Map())`:
- If `cache` has the resolved path, return the cached `module.exports` (load-once; also seed the cache with the in-progress `module.exports` BEFORE executing, so import cycles see a partial export like Node).
- Read source, `vm.compileFunction(src, ["module","exports","require","__dirname","__filename"], {filename: absPath})`, execute with an injected `require`:
  - `@jbroll/jscad-fluent` → fluent instance
  - `@jscad/modeling` → real `@jscad/modeling`
  - id ending `.scad` (or resolving to one) → OpenSCAD eval (B) → `FluentGeom3`
  - relative (`./` / `../`) `.js` → resolve against `dirname(absPath)`, recurse `loadCjsModule(resolved, cache)`
  - bare package → `createRequire(absPath)(id)` (real node_modules)
- Returns `module.exports`. `jf.js`'s `loadModel(modelPath)` becomes: `loadCjsModule(modelPath, new Map())` then return its `.main ?? .default`. The whole local graph is CJS regardless of ambient `type:module`.
- Errors carry the offending file + line (from the `vm` stack).

### D.2 Per-part preview + `parts` tool
- Per-part preview needs no new eval logic: `measure`/`render`/`export`/`eval` already accept any `modelPath`, so pointing them at `bearing.js` runs that part's `main`.
- `mcp/lib/parts.js`: `listParts(modelPath)` → for the model's directory, list sibling `*.js`/`*.scad` files and, for each, the exported names (parse `module.exports = { ... }` or load + read keys) and whether it has a `main`. Exposed as MCP tool `parts({ modelPath })` → `{ parts: [{ file, exports, hasMain }] }`.

### D.3 Arrays as first-class (`mcp/lib/array-geom.js`)
No union. `normalizeItems(arr)` wraps each item (raw `@jscad/modeling` geom3/geom2 → Fluent; already-fluent passthrough). Then:
- `measureArray(items)` → `{ boundingBox: combined min/max, dimensions: [w,d,h] of combined bbox, center, volume: Σ item volumes (geom3), polygonCount: Σ, entityCount: items.length }`.
- `exportArray(items, format)` → variadic `serialize(opts, ...rawItems)` (STL/3MF/OBJ contain all items as separate solids); `triangleCount` = Σ.
- `checkArray(items, bed)` → `{ watertight: all items watertight, manifold: same, openEdges: Σ, empty: items.length===0, fitsBed: combined bbox ≤ bed, bbox, dimensions }`.
- `measure.js`/`export-geom.js`/`check.js` get an `array` branch delegating to these; `run-model.js` passes the array through. `eval` reports `entityCount`. `render` is unchanged (the viewer renders arrays natively).
- Mixed/empty arrays: empty → empty result; a serialize/measure failure on a degenerate item is caught and surfaced as a structured error.

### D.4 Interactive-loop + render polish (best-effort, final phase)
- `render` honors `view` (`iso`/`front`/`top`/`bottom`/`left`/`right`/`back`) by driving the viewer camera after navigation — implemented against the live jscadui viewer's camera/orbit API (probed during implementation); test asserts a non-empty PNG per view. If no stable camera API exists, document `view` as not-yet-supported rather than fake it.
- `render`/preview honor `params` overrides reflected in the viewer (via the viewer's param mechanism or URL hash) — best-effort, probe-dependent.
- `bin/jscad-work.js`: document and wire the two loops — interactive (browser scrub via the served viewer) + headless (MCP `eval`/`measure`/`render`) — sharing the extracted `viewer-server`.
- **If D.4's live-viewer probing proves open-ended, split it into sub-project E** rather than stalling D.

## Testing (Vitest, headless)

- **D.1:** a multi-file fixture under `test/fixtures/assembly/` (a top model requiring 2–3 CJS part files, one part requiring another — a small diamond/cycle) + a `package.json` with `"type":"module"` in the fixture tree to reproduce the bug; assert it runs and measures. Also assert the real `examples/motor-fun/vecto-arm-pivot.js` runs (integration, may be slower).
- **D.2:** `listParts` against the assembly fixture → expected files + exports + `hasMain`.
- **D.3:** an array fixture (`module.exports = { main: () => [cube, sphere.translate(...)] }`) → `measure` combined dims, `export` STL with both solids (triangleCount = sum), `check` watertight aggregate; assert NO union (two distinct solids in the STL / summed counts, not merged).
- **D.4:** gated render tests (`JSCAD_RENDER_TEST`) — a `.scad`/`.js` render per `view` produces a non-empty PNG; param-injection render produces a PNG.

## Scope & deferred
- **IN:** D.1 multi-file loader, D.2 per-part + `parts` tool, D.3 arrays first-class, D.4 best-effort interactive/render polish.
- **DEFERRED / split-if-needed:** D.4 to sub-project E if live-viewer probing balloons; non-`type:module` edge cases beyond CJS (e.g. a model that genuinely needs ESM imports).

## Success criteria
- `motor-fun/vecto-arm-pivot.js` and a multi-file fixture `eval`/`measure` successfully via the MCP.
- `parts(modelPath)` lists an assembly's part files and exports.
- An array-returning model `measure`s a combined bbox, `export`s an STL containing all items (no union), and `check`s aggregate manifoldness; `render` shows all items.
- `render` `view` presets produce distinct non-empty PNGs (or `view` is documented unsupported).
- Full Vitest suite green (render gated); `lefthook run pre-commit` clean.
