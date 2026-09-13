# Backlog

Outstanding work, roughly in the order it should land. Delete an item in the
commit that completes it.

## 1. Plumbing fixes

- `package.json` depends on `file:../jscad-fluent` and `file:../jscadui/*`, and
  `mcp/lib/catalog.js` resolves catalog paths against `../jscadui`. The repo
  only works on this machine's directory layout. Publish the deps or vendor the
  catalog sources. This is also why the Claude Code plugin installs in link
  mode: a copied plugin cannot reach `../jscadui` or the `file:` deps.
- Delete the deprecated MCP server one release after the `jscad-work` CLI
  replaced it: `mcp/server.js`, `mcp/lib/tools.js`, `test/server-tools.test.js`,
  `test/library-tools.test.js`, `mcp/README.md`, the `@modelcontextprotocol/sdk`
  and `zod` dependencies, the `mcp/server.js` knip entry, and the MCP section of
  `docs/opencode-setup.md`.

## 2. Agent instructions

- `docs/reference/jscad-fluent-llm.txt` is a copy of `../jscad-fluent/llm.txt`
  and drifts when the upstream file changes. Add a sync check or copy it at
  build time.

## 3. Model tools

The `jscad-work` subcommands, in leverage order.

- Section view. `jscad-work render` offers seven exterior presets. Internal
  features are invisible. Add a clip-plane option (axis, offset).
- Per-part and feature measurement. `jscad-work measure` returns one bounding
  box for the whole model. Add measure by exported part name and distance
  between two named features or points.
- Interference check for arrays and multi-part assemblies: pairwise overlap
  volume, penetration depth, coaxial-hole alignment. Design after
  quellant/openscad-mcp `check` and Altern92's validators. Replace the manual
  steps in the `jscad-assembly` skill's "Checking fit today" section.
- Spec assertions. A per-model spec file (target dimensions, hole spacing,
  clearances) plus a `jscad-work verify-spec` subcommand, so an edit cannot
  silently break a previously correct dimension. Design after
  pzfreo/build123d-mcp.
- Self-intersection check. `jscad-work check` reports `selfIntersecting: null`.
- Wall thickness and overhang analysis (`check.js` marks it deferred).
  Casys-AI/mcp-dfm's ray-cast approach is small enough to reimplement.
- Compare: measure delta between two runs or two param sets, and a pixel diff
  between two renders.
- `render` tests are gated behind `JSCAD_RENDER_TEST=1` and never run in CI.
  They need Chromium and network access to jscad.rkroll.com.
- Headless slicing (OrcaSlicer via ShreddyKrueger75/claude-orcaslicer-mcp is
  the only maintained option) and dimensioned drawings (pzfreo/draftwright,
  AGPL, STEP input). Both are second priority.

## 4. Feedback loop

- `scripts/analyze-sessions.js` has never produced a committed report. Run it
  and commit `docs/session-analysis/<date>-friction.md`.
- The friction score measures crash rate only. Add signals for design
  correctness: a session that ended without a `jscad-work measure` or `check`
  call, a measured dimension that never matched a stated target, renders never
  inspected.
