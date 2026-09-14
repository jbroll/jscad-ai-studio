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

- Render anchored models in the viewer. The viewer loads `@jbroll/jscad-fluent`
  0.6.1 from jsdelivr, which has no anchor methods, and `@jbroll/jscad-anchors`
  is not on npm. Needs a single-file anchors build, a jscadui hook for extra
  module bundles, and `lib/viewer-server.js` serving the local packages.
- Dimensioned drawings, second priority. pzfreo/draftwright makes them from
  STEP input and is AGPL.

## 3. Feedback loop

- The unread-render and target-miss signals are unvalidated. The 2026-09-13
  report covers four pre-CLI sessions with no render or measure calls, and no
  user turn in 1079 local sessions stated a target. Rerun once CLI-era modeling
  sessions exist and check both for false hits.
