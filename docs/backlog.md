# Backlog

Outstanding work, roughly in the order it should land. Delete an item in the
commit that completes it.

## 1. Plumbing fixes

- The global `~/.claude/skills/jscad-modeling` skill teaches plain-assignment
  params (`params.width = 50`) and bare `jf.cube()` with no `require` or
  `module.exports`. Models written from it do not run here. Retire it, or
  replace it with the repo skill from section 3.
- `package.json` depends on `file:../jscad-fluent` and `file:../jscadui/*`, and
  `mcp/lib/catalog.js` resolves catalog paths against `../jscadui`. The repo
  only works on this machine's directory layout. Publish the deps or vendor the
  catalog sources.

## 2. Agent instructions

- `docs/reference/jscad-fluent-llm.txt` is a copy of `../jscad-fluent/llm.txt`
  and drifts when the upstream file changes. Add a sync check or copy it at
  build time.

## 3. Skills

The June 2026 design spec planned `jscad-modeling`, `jscad-library`, and
`jscad-assembly`. Only `jscad-library` exists.

- `jscad-modeling`: the design conventions and print rules from the `JSCAD.md`
  template (`jscadMd` in `mcp/lib/workspace.js`), a
  full search → get → require → measure example, and hardware dimension tables
  (fits, metric fasteners, heat-set inserts, bearings, FDM rules). Port the
  cited data from quellant/openscad-mcp's `reference` tool rather than writing
  it from memory. Copy the mandatory six-view inspection rule from
  mitsuhiko/agent-stuff and flowful-ai/cad-skill's `design-review.md`.
- `jscad-assembly`: multi-file layout, derived-position modules, clearance
  declaration, and the interference check from section 4.
- `jscad-library`: explain when a catalog part is wrong to reuse (`.scad` parts
  take no parameter overrides). Stop telling the agent to guess the jscadui
  path; return a resolved path from `library_get` instead.
- Add a condensed BOSL2 reference (swh/openscad-skill has the best one found) so
  the agent can read the 178 BOSL2 catalog sources.

## 4. MCP tools

In leverage order.

- Section view. `render` offers seven exterior presets. Internal features are
  invisible. Add a clip-plane option (axis, offset).
- Per-part and feature measurement. `measure` returns one bounding box for the
  whole model. Add measure by exported part name and distance between two
  named features or points.
- Interference check for arrays and multi-part assemblies: pairwise overlap
  volume, penetration depth, coaxial-hole alignment. Design after
  quellant/openscad-mcp `check` and Altern92's validators.
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

## 5. Catalog

- Search is exact-token only. Add stemming or synonyms, and a dimension-range
  filter (`dimensions` is stored but not queryable).
- 468 of 496 entries are `.scad` and cannot be parameterized. Mark parametric
  entries and let search filter on them.
- `runnableOnly` is opt-in, so 38 non-running entries appear by default.
- `library_get` should return a resolved absolute path.

## 6. Feedback loop

- `scripts/analyze-sessions.js` has never produced a committed report. Run it
  and commit `docs/session-analysis/<date>-friction.md`.
- The friction score measures crash rate only. Add signals for design
  correctness: a session that ended without a `measure` or `check` call, a
  measured dimension that never matched a stated target, renders never
  inspected.
