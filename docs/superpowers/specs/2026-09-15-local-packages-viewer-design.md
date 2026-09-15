# Anchored models in the viewer, with local package builds

Make the browser tab run models that use `@jbroll/jscad-anchors`, the same way
`jscad-work` runs them in Node. Let the tab load unpublished builds of
`@jbroll/jscad-fluent` and `@jbroll/jscad-anchors` from sibling checkouts, then
publish both packages and check the published versions. Replaces the "Render
anchored models in the viewer" item in `docs/backlog.md`.

The work spans four repos: jscad-anchors, jscad-fluent (version only), jscadui,
and jscad-ai-studio. This spec and its plan live in jscad-ai-studio; each repo's
changes are committed in that repo.

Out of scope: switching jscad-ai-studio's Node dependencies from `file:`
checkouts to npm versions (backlog item 1).

## Findings this design rests on

Measured on 2026-09-15 with a throwaway Playwright probe that served local files
in place of the worker's jsdelivr requests:

- The viewer resolves bare package names to `https://cdn.jsdelivr.net/npm/`
  (`jscadui/packages/require/src/resolveUrl.js:2`). npm's `@jbroll/jscad-fluent`
  0.6.1 has no anchor methods, so `jscad-work render test/fixtures/anchored-plate.js`
  fails with `jf.cylinder(...).withAnchors is not a function`.
- `jscad-fluent/dist/jscad-fluent.umd.cjs` requires only `@jbroll/jscad-anchors`
  and loads in the viewer unchanged.
- jscad-anchors' `main` is `src/index.js`, which requires `./wrap`, a directory.
  The viewer's resolver appends `.js` and does no index lookup
  (`resolveUrl.js:139,173`), so the package needs a single-file browser build.
  Read from the code, not tested.
- The viewer's `require` sets `exports.default = exports` on every module
  (`jscadui/packages/require/src/require.js:245`). `wrapTree`
  (`jscad-anchors/src/wrap/index.js:56`) has no cycle guard and overflows the
  stack on that self-reference. With a guard added to an esbuild bundle of
  jscad-anchors (`@jscad/modeling` external), the anchored fixture rendered.
- jscad-anchors wrapped the viewer's own `bundle.jscad_modeling.js`, so the
  modeling fork does not need to be on npm for the viewer.
- The manifold engine avoids loading itself by requiring
  `@jscad/modeling-for-manifold`, which `getBundles` points at the plain modeling
  bundle (`jscadui/apps/jscad-web/build.js:97-104`, `main.js:309`).
- The worker's model `require` passes no module base (`jscadui/packages/worker/worker.js:379`).
- `jscad-work` injects its bridge as a classic inline script before `</body>`;
  the viewer's `main.js` is `type="module"`, so a global the bridge sets exists
  when `main.js` runs.

## jscad-anchors

- `wrapTree` copies a property whose value is the object being walked without
  recursing into it. A `node --test` case wraps an object whose `default` is
  itself.
- `npm run build` writes `dist/jscad-anchors.cjs` with esbuild: one CommonJS
  file that requires modeling as `@jscad/modeling-for-anchors`. An esbuild
  plugin marks `@jscad/modeling` external under that name. esbuild is a dev
  dependency; `prepublishOnly` runs the build.
- `package.json`: `"jsdelivr": "dist/jscad-anchors.cjs"`, and `"files"` gains
  `dist`. `main` stays `src/index.js`, so Node consumers use the source.
- A `node --test` case loads the bundle through a `require` that maps
  `@jscad/modeling-for-anchors` to modeling, and checks that `withAnchors`,
  `subtractAnchored` with `carry`, and `anchors()` give the same frames as the
  source.
- Version stays 0.1.0 (never published).

## jscad-fluent

- Version 0.6.1 becomes 0.7.0. No code change. `peerDependencies` already
  accepts `@jbroll/jscad-anchors` `^0.1.0`.

## jscadui viewer

- New `apps/jscad-web/bundles.js` exports `getBundles({ engine, toUrl, overrides })`,
  moved out of `main.js`:
  - `@jscad/modeling` and `@jbroll/jscad-anchors`:
    `overrides['@jbroll/jscad-anchors']`, else
    `https://cdn.jsdelivr.net/npm/@jbroll/jscad-anchors@0/dist/jscad-anchors.cjs`.
  - `@jscad/modeling-for-anchors`: `bundle.jscad_modeling.js`, or
    `bundle.manifold_modeling.js` when `engine` is `manifold`.
  - `@jscad/modeling-for-manifold`, `@jscad/io`, `@jscad/csg`,
    `@jscadui/params-core`, `@jscadui/jscad-text`: unchanged.
  - Every other `overrides` entry is added as given.
- `main.js` passes `overrides: window.jscadModuleOverrides ?? {}` at both
  `jscadInit` calls (startup and engine switch).
- `worker.js` `jscadInit` clears the model cache when either
  `@jscad/modeling` or `@jscad/modeling-for-anchors` changes, since
  `@jscad/modeling` is now the same URL for both engines.
- `worker.js:205` and `:395` call `setUseGpuNormals` on the module behind
  `bundleAlias['@jscad/modeling']`, now the anchors wrapper. A test confirms the
  wrapper exposes it.
- A vitest unit test covers `getBundles` for both engines, the default and an
  overridden anchors URL, and a pass-through override.
- Every model in the tab now loads jscad-anchors. A local viewer build
  (`JSCAD_VIEWER_ROOT`) needs jsdelivr or `JSCAD_LOCAL_PACKAGES` for every
  model, not only those using jscad-fluent.
- Deployed to jscad.rkroll.com with `node build.js` then `deploy.sh update`
  from `apps/jscad-web`.

## jscad-work viewer server

- `JSCAD_LOCAL_PACKAGES`: comma-separated package directories, relative paths
  resolved against the working directory. Read by `startViewerServer`
  (`lib/viewer-server.js`), so it applies to `jscad-work <model>` and
  `jscad-work render`.
- For each directory, the server reads `package.json` at startup and records
  `name` and the browser file: `jsdelivr`, else a string `browser`, else `main`.
  A missing `package.json` or file rejects `startViewerServer` with a message
  naming the directory and file, e.g.
  `no dist/jscad-anchors.cjs in ../jscad-anchors; run npm run build there`.
- `GET /__studio/packages/<name>/<file>` serves that file, read on each request,
  with `Cache-Control: no-store`. Reloading the tab picks up a rebuild.
- `injectBridge` prepends
  `window.jscadModuleOverrides = { "<name>": "http://127.0.0.1:<port>/__studio/packages/<name>/<file>" }`
  to the bridge, in both the proxied and the local-build page. With the variable
  unset nothing is added.
- `jscad-work <model>` prints the served local packages with the viewer URL.
- Tests:
  - `test/viewer-server.test.js`: with a temp package directory, the file is
    served, the page carries the override map, and a missing build file rejects.
  - `test/render.test.js`: with `JSCAD_LOCAL_PACKAGES` set to the sibling
    packages, `test/fixtures/anchored-plate.js` renders against the local viewer
    build the render tests use.
- Docs: a Configuration row in `docs/install.md`; the server section of
  `docs/user-manual.md`.

## Order, publishing, and checks

1. jscad-anchors changes and tests; push to `jbroll/jscad-anchors`.
2. jscadui changes and unit test; local viewer build with `node build.js --skipDocs`.
3. jscad-ai-studio viewer-server changes, tests, and docs.
4. Unpublished check: the render test passes with `JSCAD_LOCAL_PACKAGES` and
   `JSCAD_VIEWER_ROOT`; `jscad-work test/fixtures/anchored-plate.js` with the same
   settings shows the plate and pin in a tab, and the `pinShift` slider moves the
   pin (checked with the Playwright browser tools and a screenshot).
5. Regression check: simple-ci `jscadui/render` on jscadui `main` and on the
   branch; compare results.
6. Publish, with the user's confirmation before each: `@jbroll/jscad-anchors`
   0.1.0 (`npm publish --access public`), then jscad-fluent 0.7.0 by its release
   steps. The user runs `npm login` first.
7. Published check: purge jsdelivr for `@jbroll/jscad-anchors@0` and
   `@jbroll/jscad-fluent`; rerun step 4's checks with `JSCAD_LOCAL_PACKAGES`
   unset against the local viewer build.
8. Deploy jscadui to jscad.rkroll.com, with the user's confirmation; rerun the
   tab check with neither variable set. Delete the `jscad-assembly` skill's line
   that `render` cannot load anchored models and the backlog item; push all four
   repos.
