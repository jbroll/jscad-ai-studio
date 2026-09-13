# Backlog

Outstanding work, roughly in the order it should land. Delete an item in the
commit that completes it.

## 1. Plumbing fixes

- `package.json` depends on `file:../jscad-fluent` and `file:../jscadui/*`, and
  `mcp/lib/catalog.js` resolves catalog paths against `../jscadui`. The repo
  only works on this machine's directory layout. Publish the deps or vendor the
  catalog sources. This is also why the Claude Code plugin installs in link
  mode: a copied plugin cannot reach `../jscadui` or the `file:` deps.

## 2. Agent instructions

- `docs/reference/jscad-fluent-llm.txt` is a copy of `../jscad-fluent/llm.txt`
  and drifts when the upstream file changes. Add a sync check or copy it at
  build time.

## 3. MCP tools

In leverage order.

- Section view. `render` offers seven exterior presets. Internal features are
  invisible. Add a clip-plane option (axis, offset).
- Per-part and feature measurement. `measure` returns one bounding box for the
  whole model. Add measure by exported part name and distance between two
  named features or points.
- Interference check for arrays and multi-part assemblies: pairwise overlap
  volume, penetration depth, coaxial-hole alignment. Design after
  quellant/openscad-mcp `check` and Altern92's validators. Replace the manual
  steps in the `jscad-assembly` skill's "Checking fit today" section.
- Spec assertions. A per-model spec file (target dimensions, hole spacing,
  clearances) plus a `verify_spec` tool, so an edit cannot silently break a
  previously correct dimension. Design after pzfreo/build123d-mcp.
- Error on `.scad` parameter overrides instead of silently using defaults
  (`mcp/lib/model-loader.js`).
- Stop aliasing `manifold` to `watertight` in `mcp/lib/check.js`. Detect
  non-manifold vertices, self-intersection, inverted normals, or report the
  field as unknown.
- `check` counts T-junctions as open edges, so nearly every boolean result
  reports `watertight: false` (a 20 mm plate minus one cylinder: 88 open edges;
  two overlapping cubes: 32). Split edges at collinear vertices before counting.
- `check` returns `empty:true, manifold:false` for geom2 and arrays. Return a
  shape that cannot be read as a defect.
- Wall thickness and overhang analysis (`check.js` marks it deferred).
  Casys-AI/mcp-dfm's ray-cast approach is small enough to reimplement.
- Compare: measure delta between two runs or two param sets, and a pixel diff
  between two renders.
- Unify the `params` schema. `eval`/`measure`/`export`/`check` accept numbers
  only; `render`/`live_params` accept any value.
- `live_params` resolves `.jscad-studio` from the server's cwd, not the model
  path. Resolve from the model's directory.
- The 10 s eval timeout in `mcp/lib/runner.js` is opaque. Make it a parameter
  and say so in the error.
- A CLI for the tools. The `st-*.mjs` scratch files exist because `render` was
  reachable only through MCP.
- `render` tests are gated behind `JSCAD_RENDER_TEST=1` and never run in CI.
- Headless slicing (OrcaSlicer via ShreddyKrueger75/claude-orcaslicer-mcp is
  the only maintained option) and dimensioned drawings (pzfreo/draftwright,
  AGPL, STEP input). Both are second priority.

## 4. Feedback loop

- `scripts/analyze-sessions.js` has never produced a committed report. Run it
  and commit `docs/session-analysis/<date>-friction.md`.
- The friction score measures crash rate only. Add signals for design
  correctness: a session that ended without a `measure` or `check` call, a
  measured dimension that never matched a stated target, renders never
  inspected.
