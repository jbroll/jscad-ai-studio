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

- Hole alignment across parts. `measure --between` gives the symmetry axes of
  round parts, but holes inside a larger part (a bolt pattern in a plate, the
  platform's center bolt hole over the pivot stud's) are not found from the
  mesh, so their coaxiality is unchecked.
- Wall thickness and overhang analysis (`check.js` marks it deferred).
  Casys-AI/mcp-dfm's ray-cast approach is small enough to reimplement.
- `render` tests are gated behind `JSCAD_RENDER_TEST=1` and never run in CI.
  They need Chromium and network access to jscad.rkroll.com.
- Headless slicing (OrcaSlicer via ShreddyKrueger75/claude-orcaslicer-mcp is
  the only maintained option) and dimensioned drawings (pzfreo/draftwright,
  AGPL, STEP input). Both are second priority.

## 4. Feedback loop

- The unread-render and target-miss signals are unvalidated. The 2026-09-13
  report covers four pre-CLI sessions with no render or measure calls, and no
  user turn in 1079 local sessions stated a target. Rerun once CLI-era modeling
  sessions exist and check both for false hits.
