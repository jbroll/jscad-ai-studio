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

- Hole alignment across parts, by construction instead of mesh detection.
  Adopt `@jbroll/jscad-anchors` (sibling `../jscad-anchors`, design in its
  `docs/design/anchors.md`) once it exists: load modeling through it in
  `lib/`, add `measure --anchors`, add anchor-coincidence assertions to
  `verify-spec`, and teach `attach` and `subtractAnchored` with `carry` in
  `skills/jscad-assembly`.
- Dimensioned drawings, second priority. pzfreo/draftwright makes them from
  STEP input and is AGPL.

## 3. Feedback loop

- The unread-render and target-miss signals are unvalidated. The 2026-09-13
  report covers four pre-CLI sessions with no render or measure calls, and no
  user turn in 1079 local sessions stated a target. Rerun once CLI-era modeling
  sessions exist and check both for false hits.
