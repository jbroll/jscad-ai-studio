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

- Render anchored models in the viewer. The code is done on each repo's
  `local-packages` branch (jscad-anchors `5bc6ea7`, jscad-fluent `273579c`,
  jscadui `f631886`, jscad-ai-studio `d289971`); none of it is
  published or deployed yet. Remaining, in order:
  1. Publish `@jbroll/jscad-anchors` 0.1.0.
  2. Run the simple-ci `jscadui/render` regression check on jscadui `main`
     and on `local-packages`.
  3. Deploy the jscadui viewer to jscad.rkroll.com (`node build.js`, then
     `deploy.sh update`), before step 4 — otherwise the live viewer loads
     fluent 0.7.0 and fails on `@jscad/modeling-for-anchors`.
  4. Publish jscad-fluent 0.7.0 from `local-packages`.
  5. Rerun the checks with neither `JSCAD_VIEWER_ROOT` nor
     `JSCAD_LOCAL_PACKAGES` set.
  6. Clean up: decide whether the sibling-build defaults for
     `JSCAD_VIEWER_ROOT`/`JSCAD_LOCAL_PACKAGES` in `lib/viewer-server.js`
     should stay after publish and deploy. They keep overriding jsdelivr
     and the deployed viewer for anyone with the sibling repos checked out.
     Also update the jscad-assembly skill line back to the published/deployed
     case only, delete the spec and plan under `docs/superpowers/`, and merge
     each `local-packages` branch into `main`.
- Dimensioned drawings, second priority. pzfreo/draftwright makes them from
  STEP input and is AGPL.

## 3. Feedback loop

- The unread-render and target-miss signals are unvalidated. The 2026-09-13
  report covers four pre-CLI sessions with no render or measure calls, and no
  user turn in 1079 local sessions stated a target. Rerun once CLI-era modeling
  sessions exist and check both for false hits.
