# Backlog

Outstanding work, roughly in the order it should land. Delete an item in the
commit that completes it.

## 1. Plumbing fixes

- `package.json` depends on `file:../jscad-fluent` and `file:../jscadui/*`, and
  `lib/catalog.js` resolves catalog paths against `../jscadui`. The repo
  only works on this machine's directory layout. Publish the deps or vendor the
  catalog sources. This is also why the Claude Code plugin installs in link
  mode: a copied plugin cannot reach `../jscadui` or the `file:` deps.

## 2. Model tools

The `jscad-work` subcommands, in leverage order.

- Hole alignment across parts. `measure --between` gives the symmetry axes of
  round parts, but holes inside a larger part (a bolt pattern in a plate, the
  platform's center bolt hole over the pivot stud's) are not found from the
  mesh, so their coaxiality is unchecked.
- `render` tests are gated behind `JSCAD_RENDER_TEST=1` and never run in CI.
  They need Chromium and network access to jscad.rkroll.com.
- Headless slicing (OrcaSlicer via ShreddyKrueger75/claude-orcaslicer-mcp is
  the only maintained option) and dimensioned drawings (pzfreo/draftwright,
  AGPL, STEP input). Both are second priority.

## 3. Feedback loop

- The unread-render and target-miss signals are unvalidated. The 2026-09-13
  report covers four pre-CLI sessions with no render or measure calls, and no
  user turn in 1079 local sessions stated a target. Rerun once CLI-era modeling
  sessions exist and check both for false hits.
