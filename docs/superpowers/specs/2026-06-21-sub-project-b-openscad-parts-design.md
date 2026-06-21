# Sub-project B — OpenSCAD as Transparent, Require-able Parts — Design

**Date:** 2026-06-21
**Status:** Approved (design); follows Sub-project A (core MCP engine, shipped).
**Parent:** `2026-06-21-jscad-ai-cad-system-design.md` (this refines and expands the original sub-project B).

## Summary

Make OpenSCAD `.scad` models **first-class and interoperable** with jscad-fluent in the `jscad-studio` MCP. A `.scad` file can be a top-level model AND be `require`-d from any model, returning a composable geometry — so OpenSCAD and JSCAD parts mix transparently (e.g. `jf.cube(...).union(require('./bracket.scad'))`). This is achieved by converting `.scad` to a single canonical geometry type (`FluentGeom3`) at the require boundary, so all of Sub-project A's tools (`eval`/`measure`/`export`/`check`/`render`) work on `.scad` with essentially no special-casing.

The LLM-curated **catalog** of the `../jscadui` corpus (originally bundled into B) becomes the **next** sub-project — it will index a corpus that this sub-project makes actually runnable.

## Background (verified by investigation)

- **The transpiler runs headlessly in Node.** `@jscadui/openscad` exposes `parse(source)` → `transpile(ast, options)` producing JS that calls a `j$` runtime. `@jscadui/openscad-runtime` (`createJ$Instance`, `j$.init(runtime)`) is backed by `@jscadui/manifold` (the `manifold-3d` WASM package, which initializes and runs in Node). The CLI `jscadui/packages/openscad/bin/run-jscad.js` proves the full transpile→eval→export pipeline in Node.
- **Evaluating a `.scad` model returns a Manifold solid** (`ManifoldGeom3`), or an array (union them). It is NOT a `@jscad/modeling` Geom3.
- **A converter exists:** `manifoldToGeom3(manifold)` in `jscadui/packages/manifold/src/conversions/index.js` returns a `@jscad/modeling` geom3 `{ polygons, transforms }`.
- **`FluentGeom3` is the canonical wrapper** (`jscad-fluent/src/gen/FluentGeom3.ts`, `export class FluentGeom3 implements Geom3`, constructed as `new FluentGeom3(geom3)`). It is used internally but **not currently exported** from the built package — B exposes it.
- **Manifold ops are synchronous after a one-time `await manifold.init()`.** Transpile is synchronous; non-font `main()` is synchronous. So once the runtime is pre-initialized, a CommonJS `require('./x.scad')` can resolve **synchronously**.
- **The viewer already renders `.scad`** (it registers a `.scad` require handler that transpiles client-side), so A's Playwright `render` tool works on `.scad` by navigating `#model.scad` with the file served locally — no new render code.
- **~90% of the corpus transpiles/runs.** Documented skip-lists cover the rest (text/font glyph mismatches, `rands()`, a few BOSL2 library bugs). `bosl2/skip.txt` (~21/178), `snippet-skip.txt` (~6/122).
- **OpenSCAD parameters are baked into transpiled code** — overriding requires re-transpiling the source; deferred.

## Verified feasibility

- `new FluentGeom3(rawGeom3)` (and the fallback `jf.union(rawGeom3)`) yields a chainable fluent geometry: `jf.cube({size:4}).translate([20,0,0]).union(wrapped)` → dimensions `[27,10,10]` (correct). A `.scad` part wrapped this way composes with any fluent operation.
- A converted closed Manifold solid triangulates to a closed mesh, so A's edge-count `check` reports `watertight:true` with no special-casing.

## Architecture

The MCP keeps the **same six tools**. The runner dispatches model loading by file extension; everything downstream operates on one canonical type.

```
runModel(modelPath)  (A, unchanged threaded runner + timeout)
  └─ worker: pre-init OpenSCAD runtime once (manifold.init() + fonts), then loadAndRun
       └─ unified require-shim (extends A's jf.js), by extension:
            @jbroll/jscad-fluent | @jscad/modeling  → plugin fluent instance      (A)
            *.js                                     → CJS eval → module.exports   (A; parts export builder fns)
            *.scad                                   → parse→transpile→eval(Manifold)
                                                       → manifoldToGeom3() → new FluentGeom3(geom3)
       └─ result is a FluentGeom3 (or array) regardless of source language
  └─ A's measure / export / check / eval / render  →  work UNCHANGED
```

### New / changed files
| File | Responsibility |
|---|---|
| `jscad-fluent/src/index.ts` (upstream) | add `export { FluentGeom3, FluentGeom2 }`; rebuild. |
| `mcp/lib/openscad.js` | OpenSCAD eval bridge: lazy/memoized `initOpenscad()` (manifold WASM + fonts); `evalScad(modelPath) → FluentGeom3 \| FluentGeom3[]` (parse→transpile→eval→`manifoldToGeom3`→`new FluentGeom3`). Structured errors with line numbers from parse/transpile. |
| `mcp/lib/jf.js` (modify) | require-shim resolves `*.scad` via `openscad.js` and returns the wrapped `FluentGeom3`; used for the top-level model and every nested `require()`. |
| `mcp/lib/worker.js` (modify) | before eval, `await initOpenscad()` once (so sync `.scad` requires work); dispatch `.scad`-capable async load. |
| `mcp/lib/model-loader.js` (modify) | accept `.scad` top-level models; classify the wrapped result as `geom3`. |
| `test/fixtures/*.scad`, `test/openscad.test.js` | fixtures + tests (incl. the mixed-assembly interop test). |
| `package.json` | new deps. |

### Dependencies
File-linked (like `@jscadui/params-core`): `@jscadui/openscad`, `@jscadui/openscad-runtime`, `@jscadui/manifold`, `@jscadui/jscad-text`. From npm: `manifold-3d` (WASM). Update the `@jbroll/jscad-fluent` build so the wrapper export is available.

## The `.scad` eval bridge (recipe, from `run-jscad.js`)

1. `initOpenscad()` (memoized): `await manifold.init()`; register cached + system fonts (`@jscadui/jscad-text`); build the Manifold-backed runtime and `j$` instance (`createJ$Instance`, `j$.init(runtime)`).
2. `evalScad(modelPath)`: read source → `parse(source)` (collect parse errors → `{ok:false, error, line}`) → `transpile(ast, { fileResolver, currentFile })` → `new Function('require','module','exports','j$', code)` executed with a `require` that resolves nested `.scad`/`.js` via the unified shim → `await Promise.resolve(exports.main(defaultParams))`.
3. Result handling: array → `manifold union`; then `manifoldToGeom3(solid)` → `new FluentGeom3(geom3)`. Return it.
4. Errors (parse/transpile/eval/manifold) are caught and returned as `{ ok:false, error, line? }` — never thrown to the MCP layer (A's contract).

## Synchronous interop

The worker calls `await initOpenscad()` once before evaluating the model. Thereafter transpile + Manifold + conversion + `new FluentGeom3` are all synchronous, so a model's `require('./part.scad')` resolves inline like any CJS require. **Perf optimization (not required for correctness):** a pure-`.js` model with no `.scad` in its source/dep graph can skip `initOpenscad()`; B may add a cheap source scan to gate init. Document that WASM init adds latency to the first eval in a worker.

## What `require('./foo.scad')` returns

The evaluated **default geometry** of the `.scad`, wrapped as a composable `FluentGeom3` — "the model, like a jscad file returns its model." Parametric override of a required `.scad` part is **deferred** (values are baked into transpiled code).

## Directionality

- **Supported:** a `.js` (jscad-fluent) model `require`-ing `.scad` parts; a `.scad` model as top-level; `.scad`-includes-`.scad` via the transpiler's `fileResolver`.
- **Out of scope:** a `.scad` model `use`-ing a `.js` jscad-fluent part — not expressible in OpenSCAD syntax.

## Tools (no new surface)

`eval`/`measure`/`export`/`check` accept `.scad` `modelPath` transparently (the loader yields a `FluentGeom3`). `render` works on `.scad` via the viewer (verify the local viewer-server serves `.scad` to the viewer's transpile handler). `params` on a `.scad` returns an empty list for now (override deferred). 2D-only `.scad` (rare) may classify as `unknown`/limited; handled gracefully, SVG export of 2D `.scad` deferred.

## Error handling & robustness

- Parse/transpile errors → `{ ok:false, error, line }`; the ~10% of corpus files that fail (fonts, `rands()`, specific BOSL2 modules) surface as structured errors, not crashes.
- A's worker-thread timeout still bounds runaway `.scad` evals.
- `initOpenscad()` is memoized and must not throw the worker down on a missing optional font set.

## Testing (Vitest, mirrors A)

- `test/fixtures/cube.scad` (3D) — `eval` ok, `geomType:'geom3'`; `measure` dimensions match; `export` STL has a valid header + triangles; `check` `watertight:true`.
- `test/fixtures/broken.scad` (parse error) — `{ ok:false, error, line>0 }`.
- `test/fixtures/combo.js` — a jscad-fluent model that `require`s both a `.js` part and `cube.scad` and unions them; assert the **composed dimensions** (the core transparent-interop guarantee).
- One real corpus part (e.g. an `mcad` bearing `.scad`) — `eval` ok + `export` STL.
- Render: gated integration test (`.scad` via the headless viewer), same `JSCAD_RENDER_TEST` gate as A.
- The `FluentGeom3`/`FluentGeom2` export is covered by jscad-fluent's own build/tests; B's tests exercise it indirectly through the bridge.

## Code hygiene

Same org-hooks gates as A (biome/tsc/knip/size-cap/gitleaks, 500-line cap). New `mcp/lib/openscad.js` stays focused; if the eval bridge approaches the cap, split init vs eval into two files. New deps added to `knip.json` `ignoreDependencies` only until a test/lib import makes them visible (then trimmed), per A's pattern.

## Out of scope for B (future sub-projects)

The LLM-curated **catalog + `library` search tool + `jscad-library` skill** (next sub-project, indexing the now-runnable corpus); OpenSCAD customizer-**parameter override**; 2D `.scad`→SVG; the reverse part direction.

## Success criteria

- `eval`/`measure`/`export`/`check` work on a `.scad` model headlessly; `render` produces a PNG of a `.scad` via the viewer.
- A jscad-fluent model can `require('./part.scad')` and union it — the `combo.js` interop test passes with correct composed dimensions.
- A real `mcad` `.scad` part evaluates and exports a slicer-loadable STL.
- Parse errors in a `.scad` surface as structured `{ok:false,error,line}`.
- Full Vitest suite green (render gated); `lefthook run pre-commit` clean.
