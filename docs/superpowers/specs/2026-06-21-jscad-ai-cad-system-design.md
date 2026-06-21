# JSCAD AI-Assisted CAD System — Design

**Date:** 2026-06-21
**Status:** Approved (architecture + sub-project A); B/C/D are roadmap, each to get its own spec.

## Summary

Turn `jscad-ai-studio` into a full-service AI-assisted CAD system delivered as a **Claude Code plugin**. Claude becomes a capable parametric-CAD partner driving the `jscad-fluent` API, with:

- a **fast headless verify loop** (run model in Node → errors, measurements, offscreen PNG) for the inner edit cycle, and
- a **live interactive browser preview** (today's hosted-viewer flow) for human visual confirmation,

both first-class and rendered by the **same viewer**. A searchable, **LLM-curated catalog** of the ~28k reference models/parts in `../jscadui` lets Claude find idioms and reusable parts.

## Background — current state (verified by inspection)

- **`jscad-ai-studio`** today is one CLI, `bin/jscad-work.js` (~280 lines): starts a local HTTP server that serves model `.js` files and **proxies the jscadui viewer from `jscad.rkroll.com`**, writes `JSCAD.md` + `.jscad-studio`, and relies on Claude driving a browser via **Chrome DevTools MCP**. No skills, no MCP server, no library indexing.
- **`../jscad-fluent`** is a mature, code-generated fluent API (2D/3D primitives, booleans, hull, minkowski, extrude, measurements, colors) with a hand-tuned `llm.txt`. Models are CommonJS `main(p)` functions; params are declared via `p.name = { type:'slider', default, min, max, step, label, live }` and read back as values.
- **`../jscadui`** is a monorepo: the deployed viewer (`jscad-web` → `jscad.rkroll.com`) plus a large model corpus (~28k `.js`/`.scad`: BOSL, BOSL2, OpenSCAD snippets, MCAD bearings/motors/hardware, NopSCADlib, dotscad, 28 native JSCAD examples). Partial metadata exists (`manifest.json`, `corpus-examples-mapping.json`, `examples.js`) but **no search/semantic index**. Evaluation packages of interest: `packages/worker`, `packages/params-core`, `packages/params-proxy`, `packages/manifold`.

## Research — what the field does

Across Zoo/KittyCAD, AdamCAD, Text2Cad (MCP), CAD-Coder, NURBGen, and the OpenSCAD MCP servers, the dominant winning pattern is the **self-correcting agent loop**: generate code → **execute it headlessly** → measure geometry / render a PNG → verify against intent → loop. MCP servers in this space typically accept code and return **STEP/STL + a PNG preview**. The current jscad-ai-studio loop is entirely browser-driven, which is the slow/fragile part this design fixes.

Sources:
- https://snyk.io/articles/9-mcp-servers-for-computer-aided-drafting-cad-with-ai/
- https://www.getleo.ai/blog/text-to-cad-tools-comparison-guide
- https://arxiv.org/abs/2505.06507 (Text-to-CadQuery)
- https://arxiv.org/pdf/2505.14646 (CAD-Coder)

## Decisions (from brainstorming)

- **Feedback loop:** both headless verify and interactive browser, equal first-class, sharing one viewer.
- **Library purpose:** reference patterns first, reusable-parts catalog as a second layer.
- **Search method:** **LLM-curated catalog** (one-time LLM pass produces structured metadata; keyword/tag filtering over it), source fetched on demand.
- **Packaging:** Claude Code plugin (MCP + skills + commands + catalog bundled).
- **Extra components (all in scope across B–D):** export & 3D-print checks, assembly/multi-file support, visual-verification agent, param/measurement introspection.

## Target architecture

```
jscad-ai-studio (Claude Code plugin)
├─ .mcp.json                      # registers the MCP server via ${CLAUDE_PLUGIN_ROOT}
├─ mcp/                           # ONE MCP server: "jscad-studio" (stdio)
│   ├─ server.js
│   ├─ lib/runner.js              # shared model runner (proxy params + worker_thread + timeout)
│   ├─ lib/viewer-server.js       # local static + proxy to jscad.rkroll.com (factored from jscad-work)
│   └─ tools/  eval measure params render export check  (+ library in B)
├─ skills/        jscad-modeling · jscad-library · jscad-assembly        (B, C)
├─ agents/        visual-verifier                                        (C)
├─ commands/      /jscad-new · /jscad-verify · ...                       (C)
├─ catalog/       LLM-curated index of ../jscadui (committed JSON)       (B)
└─ bin/jscad-work.js              # evolves to launch server + foreground browser  (D)
```

**Two-loop model:**
- **Inner loop (headless, fast):** Claude edits → `eval`/`measure`/`render` over MCP → fixes errors and verifies dimensions numerically + a PNG. No human, no manual browser.
- **Outer loop (interactive):** foreground browser viewer for the human to scrub sliders and confirm visually.

**Render fidelity:** the `render` tool drives a **headless Chromium (Playwright)** pointed at the **same local viewer** the interactive loop uses, so headless and interactive renders are identical — no second renderer to maintain.

## Decomposition (each sub-project gets its own spec → plan → build)

| # | Sub-project | Depends on | Rationale |
|---|---|---|---|
| **A** | **Core MCP engine** — plugin skeleton + `eval`/`measure`/`params`/`render`/`export`/`check` | — | Foundation; de-risks the headless render; highest value. |
| **B** | **Library catalog + search** — generator over `../jscadui` + `library` tool + `jscad-library` skill | A (to fetch & eval found models) | Independent corpus work; LLM-curated catalog committed to repo. |
| **C** | **Authoring skills + docs + visual-verifier agent** — `jscad-modeling`/`jscad-assembly` skills, commands, render→inspect→critique loop | A | Ties the UX together on top of A's tools. |
| **D** | **Assembly/multi-file + interactive browser polish** — dependency resolution, per-part preview, two-loop integration, `jscad-work` evolution | A, C | Layered last; benefits from a stable core. |

**Build order:** A first (detailed below), then B, C, D — each re-entering the brainstorm→spec→plan cycle.

---

# Sub-project A — Core MCP engine (detailed)

## Goal

Ship the plugin skeleton and a stdio MCP server `jscad-studio` exposing a fast, reliable, mostly-offline headless loop for evaluating, measuring, introspecting, rendering, exporting, and checking `jscad-fluent` models.

## A.1 Shared model runner (`mcp/lib/runner.js`)

The crux. A model declares **and reads** params through one object:

```js
p.outerRadius = { type:'slider', default:50, min:30, max:100 };  // declare
jf.cylinder({ radius: p.outerRadius })                            // reads back 50
```

This requires `p` to be a **Proxy** that records the descriptor on assignment and returns the current value (or `default`) on read.

**Decision:** reuse jscadui's evaluation packages (`packages/worker`, `params-core`, `params-proxy`) so headless eval is faithful to the viewer. Wrap that logic to run in a Node `worker_thread` for isolation + a configurable **timeout** (default 10s) to kill runaway models. **Bust the require-cache each call** so edited files re-evaluate. Resolve `@jbroll/jscad-fluent` (and `@jscad/modeling`) from the plugin's own `node_modules`.

**Fallback** if those packages aren't Node-friendly: a ~50-line local params proxy replicating the same record-on-write / value-on-read contract, plus a direct `require` + `main(p)` call.

**Runner output (internal, shared by all tools):**
```
{ ok, error?, stack?, line?, geomType: 'geom2'|'geom3'|'array', params: [...descriptors...], geometry }
```
With `params` provided, the runner applies overrides before calling `main`.

## A.2 MCP tools

All tools take `modelPath` (absolute or relative to cwd) and optional `params` (name→value overrides). All return **structured results, never throw** to the MCP layer; model syntax/runtime errors are captured with a line number when available.

| Tool | Extra input | Returns |
|---|---|---|
| `eval` | — | `{ ok, error?, line?, geomType, entityCount, warnings }` — pure Node, offline |
| `params` | — | `[{ name, type, default, min, max, step, label, live }]` |
| `measure` | — | `{ boundingBox, dimensions:[w,d,h], center, volume?, area?, triangleCount }` |
| `render` | `view?` (iso\|front\|top\|right\|back\|left\|bottom), `size?` ([w,h]) | `{ path, width, height }` (writes PNG) |
| `export` | `format` (stl\|3mf\|obj\|svg) | `{ path, bytes, triangleCount }` (writes file) |
| `check` | `bed?` ([x,y,z] mm) | `{ manifold, watertight, empty, fitsBed, bbox, triangleCount, notes[] }` |

- `measure`/`export`/`check`(geometry) use `jscad-fluent` measurement methods and `@jscad/io` (or jscadui) serializers. `check` manifold/watertight uses `../jscadui/packages/manifold` where available; otherwise a watertight/empty heuristic + bed-fit, with detailed **wall-thickness analysis explicitly deferred** (noted in `notes[]`).
- Offline: `eval`, `params`, `measure`, `export`, `check`(geometry) are pure Node. `render` is the only tool needing network + Chromium.

## A.3 Headless render (`render` + `mcp/lib/viewer-server.js`)

1. Factor the proxy/static-serve logic out of `bin/jscad-work.js` into `mcp/lib/viewer-server.js` (serves the local model dir + proxies `jscad.rkroll.com`). `jscad-work` is refactored to consume it (no behavior change for A).
2. `render` lazily starts that local server (once per process) and drives a **persistent headless Chromium via Playwright** to `localhost/#model`, applies `params`/`view`, waits for render-complete, screenshots the canvas → PNG.

Same viewer as the interactive loop ⇒ identical output. Chromium executable path is configurable (system chromium; honors the Void Linux setup the `chromium-mcp-debug` skill documents).

## A.4 Plugin skeleton & packaging

- `.mcp.json` registers `jscad-studio` (`node ${CLAUDE_PLUGIN_ROOT}/mcp/server.js`, stdio).
- `package.json`: `type: module`; deps `@jbroll/jscad-fluent`, `@modelcontextprotocol/sdk`, `playwright`, jscadui worker/params packages (or vendored proxy), serializers (`@jscad/io` or jscadui formats). Keep the existing `jscad-work` bin.
- Stub directories for `skills/`, `agents/`, `commands/`, `catalog/` so B–D slot in cleanly.

## A.5 Testing (Vitest)

Run against existing example models (`examples/model.js`, `examples/sandbox-pivot.js`, `examples/motor-fun/*`):

- `eval`: ok on valid models; structured `error` + `line` on a deliberately broken model.
- `params`: lists declared sliders with correct `min`/`max`/`default`.
- `measure`: returns `dimensions ≈ [10,10,10]` for default `cube({size:10})`.
- `export`: STL has a valid header and `triangleCount > 0`.
- `check`: reports `manifold && watertight` on a known-good solid; flags an intentionally non-manifold input.
- `render`: produces a non-empty PNG — **integration test gated behind an env flag** (needs Chromium + network).

## A.6 Error handling & robustness

- Worker-thread timeout terminates runaway/infinite-loop models; returns `{ ok:false, error:'timeout' }`.
- All file writes (PNG/exports) go to a temp dir by default; caller may pass an output path.
- Every tool validates inputs and returns a typed error object rather than throwing.

## A.7 Out of scope for A (deferred to B/C/D)

Library catalog/search (B), authoring skills + visual-verifier agent + commands (C), multi-file assembly dependency resolution + interactive-loop polish + `jscad-work` UX evolution (D). Detailed wall-thickness analysis is future work.

## Success criteria for A

- From a fresh checkout, installing the plugin registers `jscad-studio` and all six tools are callable.
- Claude can author/edit a model and, **without a browser**, catch a runtime error (`eval`), confirm a dimension numerically (`measure`), and get a PNG (`render`) — the inner loop works end to end.
- `export` yields a slicer-loadable STL; `check` catches a non-manifold model.
- Vitest suite green (render test gated).
