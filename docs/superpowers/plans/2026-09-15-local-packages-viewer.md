# Anchored Models in the Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The browser tab runs models that use `@jbroll/jscad-anchors`, loads unpublished builds of jscad-fluent and jscad-anchors from sibling checkouts, and then works against the published packages.

**Architecture:** jscad-anchors gains a single-file CommonJS browser build that requires modeling as `@jscad/modeling-for-anchors`. The jscadui viewer maps `@jscad/modeling` to that build and `@jscad/modeling-for-anchors` to the engine's modeling bundle, and accepts extra module URLs from `window.jscadModuleOverrides`. jscad-ai-studio's viewer server serves local package files and injects that override map.

**Tech Stack:** Node CommonJS + `node --test` (jscad-anchors), esbuild, ES modules + vitest (jscadui, jscad-ai-studio), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-15-local-packages-viewer-design.md`

## Global Constraints

- Repos: `/home/john/src/jscad-anchors`, `/home/john/src/jscad-fluent`, `/home/john/src/jscadui`, `/home/john/src/jscad-ai-studio`. Commit each repo's changes in that repo.
- Branches: jscad-ai-studio works on `local-packages` (exists). jscad-anchors and jscadui work on a new `local-packages` branch created from `main`. jscad-fluent commits its version bump on `main` at publish time.
- jscad-anchors style: `'use strict'`, CommonJS, no semicolons, 2-space indent, single quotes. jscadui style: ES modules, no semicolons, single quotes. jscad-ai-studio style: ES modules, semicolons, double quotes (Biome).
- Browser bundle file: `dist/jscad-anchors.cjs`. Modeling alias name: `@jscad/modeling-for-anchors`. CDN URL: `https://cdn.jsdelivr.net/npm/@jbroll/jscad-anchors@0/dist/jscad-anchors.cjs`.
- jscad-anchors version stays `0.1.0`. jscad-fluent becomes `0.7.0`, no code change.
- Env var `JSCAD_LOCAL_PACKAGES`: comma-separated package directories, relative paths resolved against the working directory.
- Server route `GET /__studio/packages/<name>/<file>`, `Cache-Control: no-store`.
- Global variable `window.jscadModuleOverrides`: `{ "<name>": "http://127.0.0.1:<port>/__studio/packages/<name>/<file>" }`.
- Never open a pull request. Push only to `jbroll/` repos. Publishing and deploying need the user's confirmation each time.
- Comments: default to none; one or two lines saying why, never what.

## Changes from the spec

Found while planning, from reading the code:

1. `wrapTree` recursed into every object, so manifold's `ready` promise (exported from `jscadui/packages/manifold/src/index.js:24`) became `{}` and `worker.js:401` would skip awaiting WASM. `wrapTree` now recurses only into plain objects, and maps a value it has already wrapped (such as `default` pointing at the root) to that wrapped object.
2. `src/index.js` exports a fixed list of namespaces, so `setUseGpuNormals` and `ready` would be missing from the wrapper the worker loads as `@jscad/modeling`. The browser build uses a new entry `src/browser.js` that exports the whole wrapped tree plus `anchors`.
3. The require cache is keyed by URL and `jscadClearTempCache` keeps non-local modules (`cacheManager.ts:321`). With one anchors URL for both engines, an engine switch would reuse the anchors module bound to the old engine, and so would a CDN jscad-fluent that required it. The worker calls `clearAllCaches` instead when a modeling alias changes.
4. The jscadui regression check runs after `@jbroll/jscad-anchors` is published. Before that, every model on the branch fetches a 404 from jsdelivr, so the check could not pass.
5. `vitest.config.js` in jscad-ai-studio sets `JSCAD_LOCAL_PACKAGES` to the sibling checkouts unless already set, because every render test now loads jscad-anchors.

---

### Task 1: jscad-anchors `wrapTree` handles self-references and non-plain objects

**Files:**
- Modify: `/home/john/src/jscad-anchors/src/wrap/index.js:56-72`
- Test: `/home/john/src/jscad-anchors/test/wrap-shapes.test.js` (create)

**Model:** `sonnet` — small change, but the test must patch a shared module before first load.

**Interfaces:**
- Consumes: nothing.
- Produces: `require('./src/wrap')` returns the wrapped tree; `wrapped.default === wrapped` when the raw module's `default` is itself; non-plain objects (promises, class instances) are the raw values.

- [ ] **Step 1: Create the branch**

```bash
git -C /home/john/src/jscad-anchors checkout -b local-packages
```

- [ ] **Step 2: Write the failing test**

Create `test/wrap-shapes.test.js`. `node --test` runs each file in its own process, so patching the modeling module before the first `require('../src/wrap')` affects only this file.

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const raw = require('@jscad/modeling')

const ready = Promise.resolve()
const setUseGpuNormals = () => {}
raw.default = raw
raw.ready = ready
raw.setUseGpuNormals = setUseGpuNormals

const m = require('../src/wrap')

test('a default that points at the module maps to the wrapped module', () => {
  assert.equal(m.default, m)
})

test('non-plain objects are copied, not rebuilt', () => {
  assert.equal(m.ready, ready)
})

test('unclassified top-level functions pass through', () => {
  assert.equal(m.setUseGpuNormals, setUseGpuNormals)
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /home/john/src/jscad-anchors && node --test test/wrap-shapes.test.js`
Expected: FAIL with `RangeError: Maximum call stack size exceeded`.

- [ ] **Step 4: Implement**

Replace `wrapTree` and the export in `src/wrap/index.js`:

```js
const isPlainObject = (value) => {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// The viewer's require sets exports.default = exports, so the tree can contain itself.
const wrapTree = (node, prefix, wrapped = new Map()) => {
  const out = {}
  wrapped.set(node, out)
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'function') {
      const entry = classify(path)
      out[key] = entry ? WRAPPERS[entry.group](value, { path, ...entry }) : value
    } else if (wrapped.has(value)) {
      out[key] = wrapped.get(value)
    } else if (isPlainObject(value)) {
      out[key] = wrapTree(value, path, wrapped)
    } else {
      out[key] = value
    }
  }
  return out
}

module.exports = wrapTree(raw, '')
```

- [ ] **Step 5: Run the full suite**

Run: `cd /home/john/src/jscad-anchors && npm test`
Expected: all tests pass, including the three new ones and every case in `test/wrap.test.js`.

- [ ] **Step 6: Commit**

```bash
git -C /home/john/src/jscad-anchors add src/wrap/index.js test/wrap-shapes.test.js
git -C /home/john/src/jscad-anchors commit -m "fix: wrap modules that contain themselves or promises"
```

---

### Task 2: jscad-anchors browser build

**Files:**
- Create: `/home/john/src/jscad-anchors/src/browser.js`
- Create: `/home/john/src/jscad-anchors/scripts/build.js`
- Create: `/home/john/src/jscad-anchors/test/bundle.test.js`
- Modify: `/home/john/src/jscad-anchors/package.json`
- Modify: `/home/john/src/jscad-anchors/.gitignore`
- Modify: `/home/john/src/jscad-anchors/docs/development.md`, `/home/john/src/jscad-anchors/docs/architecture.md`

**Model:** `sonnet` — build tooling plus a test that evaluates the bundle with a custom `require`.

**Interfaces:**
- Consumes: Task 1's `wrapTree` behavior.
- Produces: `npm run build` writes `dist/jscad-anchors.cjs`. The bundle requires only `@jscad/modeling-for-anchors`. Its exports are every top-level key of the modeling module it was given (wrapped), plus `anchors`, with `default` pointing at the exports object.

- [ ] **Step 1: Install esbuild**

Match jscadui's version:

```bash
npm --prefix /home/john/src/jscad-anchors install --save-dev esbuild@^0.27.2
```

- [ ] **Step 2: Write the failing test**

Create `test/bundle.test.js`:

```js
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const modeling = require('@jscad/modeling')
const source = require('../src')
const { frameClose } = require('./helpers')

const root = path.join(__dirname, '..')
execFileSync(process.execPath, ['scripts/build.js'], { cwd: root, stdio: 'inherit' })

const loadBundle = (fakeModeling) => {
  const code = readFileSync(path.join(root, 'dist/jscad-anchors.cjs'), 'utf8')
  const module = { exports: {} }
  const requireFor = (name) => {
    if (name === '@jscad/modeling-for-anchors') return fakeModeling
    throw new Error(`bundle required ${name}`)
  }
  new Function('module', 'exports', 'require', code)(module, module.exports, requireFor)
  return module.exports
}

const fake = { ...modeling, ready: Promise.resolve(), setUseGpuNormals: () => {} }
fake.default = fake
const bundle = loadBundle(fake)

const scene = (api) => {
  const { anchors, primitives, transforms } = api
  const axis = { axis: anchors.frame([0, 0, 0], [0, 0, 1], [1, 0, 0]) }
  const cutter = transforms.translate([6, 2, 0],
    anchors.withAnchors(primitives.cylinder({ radius: 3, height: 10, segments: 32 }), axis))
  const plate = anchors.subtractAnchored(primitives.cuboid({ size: [30, 20, 5] }), cutter, { carry: { bolt1: cutter } })
  return anchors(plate)
}

test('the bundle gives the same frames as the source', () => {
  const expected = scene(source)
  const actual = scene(bundle)
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort())
  for (const name of Object.keys(expected)) frameClose(actual[name], expected[name])
})

test('the bundle exposes the modeling module\'s own top-level keys', () => {
  assert.equal(bundle.setUseGpuNormals, fake.setUseGpuNormals)
  assert.equal(bundle.ready, fake.ready)
})

test('default points at the bundle exports, anchors included', () => {
  assert.equal(bundle.default, bundle)
  assert.equal(typeof bundle.default.anchors, 'function')
})
```

If `anchors.frame`'s argument order or `anchors(geometry)`'s return shape differs from what this test assumes, read `src/frame.js` and `src/lookup.js` and adjust the test to the real signatures. Do not change the source to fit the test.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /home/john/src/jscad-anchors && node --test test/bundle.test.js`
Expected: FAIL, `Cannot find module` for `scripts/build.js`.

- [ ] **Step 4: Write the browser entry**

Create `src/browser.js`. `wrap` exports the whole wrapped modeling tree (including `setUseGpuNormals`, `ready`, and a `default` that points at itself), so adding `anchors` to it also adds it to `default`.

```js
'use strict'
const { anchors } = require('./index')

module.exports = Object.assign(require('./wrap'), { anchors })
```

- [ ] **Step 5: Write the build script**

Create `scripts/build.js`:

```js
'use strict'
const esbuild = require('esbuild')

// The viewer maps this name to the engine's modeling bundle, while @jscad/modeling maps to this build.
const modelingForAnchors = {
  name: 'modeling-for-anchors',
  setup (build) {
    build.onResolve({ filter: /^@jscad\/modeling$/ }, () => ({ path: '@jscad/modeling-for-anchors', external: true }))
  }
}

esbuild.build({
  entryPoints: ['src/browser.js'],
  bundle: true,
  format: 'cjs',
  platform: 'neutral',
  outfile: 'dist/jscad-anchors.cjs',
  plugins: [modelingForAnchors],
  logLevel: 'info'
}).catch(() => process.exit(1))
```

- [ ] **Step 6: Update `package.json` and `.gitignore`**

In `package.json`: add `"jsdelivr": "dist/jscad-anchors.cjs"` after `"types"`; change `"files"` to `["src", "dist"]`; add scripts `"build": "node scripts/build.js"` and `"prepublishOnly": "npm run build"`. Leave `main` as `src/index.js` and the version as `0.1.0`.

Add a line `dist/` to `.gitignore`.

- [ ] **Step 7: Run the full suite**

Run: `cd /home/john/src/jscad-anchors && npm test`
Expected: all tests pass. Then run `npm run exports:check` and `npm run types` and confirm both still pass.

- [ ] **Step 8: Docs**

`docs/development.md`: add `npm run build` and what it writes. `docs/architecture.md`: a short paragraph saying the browser build exists, that it requires modeling as `@jscad/modeling-for-anchors` so the viewer can point `@jscad/modeling` at the build, and that it exports every modeling key because the viewer's worker reads `ready` and `setUseGpuNormals` from whatever `@jscad/modeling` resolves to.

- [ ] **Step 9: Commit**

```bash
git -C /home/john/src/jscad-anchors add package.json package-lock.json .gitignore scripts/build.js src/browser.js test/bundle.test.js docs/development.md docs/architecture.md
git -C /home/john/src/jscad-anchors commit -m "feat: single-file browser build for the viewer"
```

---

### Task 3: jscadui viewer loads jscad-anchors and module overrides

**Files:**
- Create: `/home/john/src/jscadui/apps/jscad-web/bundles.js`
- Create: `/home/john/src/jscadui/apps/jscad-web/bundles.test.js`
- Modify: `/home/john/src/jscadui/apps/jscad-web/main.js:291-314,423,433`
- Modify: `/home/john/src/jscadui/packages/worker/worker.js:3,169-176`

**Model:** `sonnet` — multi-file change across the app and the worker.

**Interfaces:**
- Consumes: the bundle URL and alias name from Global Constraints.
- Produces: `getBundles({ engine, toUrl, overrides })` returns `Record<string, string>`; the tab reads `window.jscadModuleOverrides`.

- [ ] **Step 1: Create the branch**

```bash
git -C /home/john/src/jscadui checkout -b local-packages
```

- [ ] **Step 2: Write the failing test**

Create `apps/jscad-web/bundles.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { getBundles } from './bundles.js'

const toUrl = path => new URL(path, 'http://viewer.test/').toString()
const CDN = 'https://cdn.jsdelivr.net/npm/@jbroll/jscad-anchors@0/dist/jscad-anchors.cjs'
const LOCAL = 'http://127.0.0.1:9000/__studio/packages/@jbroll/jscad-anchors/dist/jscad-anchors.cjs'

describe('getBundles', () => {
  test('jscad engine: modeling is the anchors build over the jscad bundle', () => {
    const b = getBundles({ engine: 'jscad', toUrl })
    expect(b['@jscad/modeling']).toBe(CDN)
    expect(b['@jbroll/jscad-anchors']).toBe(CDN)
    expect(b['@jscad/modeling-for-anchors']).toBe('http://viewer.test/build/bundle.jscad_modeling.js')
    expect(b['@jscad/modeling-for-manifold']).toBe('http://viewer.test/build/bundle.jscad_modeling.js')
    expect(b['@jscad/io']).toBe('http://viewer.test/build/bundle.jscad_io.js')
    expect(b['@jscad/csg']).toBe('http://viewer.test/build/bundle.V1_api.js')
    expect(b['@jscadui/params-core']).toBe('http://viewer.test/build/bundle.params_core.js')
    expect(b['@jscadui/jscad-text']).toBe('http://viewer.test/build/bundle.jscad_text.js')
  })

  test('manifold engine: the anchors build wraps the manifold bundle', () => {
    const b = getBundles({ engine: 'manifold', toUrl })
    expect(b['@jscad/modeling']).toBe(CDN)
    expect(b['@jscad/modeling-for-anchors']).toBe('http://viewer.test/build/bundle.manifold_modeling.js')
    expect(b['@jscad/modeling-for-manifold']).toBe('http://viewer.test/build/bundle.jscad_modeling.js')
  })

  test('an anchors override replaces the CDN build for both names', () => {
    const b = getBundles({ engine: 'jscad', toUrl, overrides: { '@jbroll/jscad-anchors': LOCAL } })
    expect(b['@jscad/modeling']).toBe(LOCAL)
    expect(b['@jbroll/jscad-anchors']).toBe(LOCAL)
  })

  test('other overrides pass through', () => {
    const fluent = 'http://127.0.0.1:9000/__studio/packages/@jbroll/jscad-fluent/dist/jscad-fluent.umd.cjs'
    const b = getBundles({ engine: 'jscad', toUrl, overrides: { '@jbroll/jscad-fluent': fluent } })
    expect(b['@jbroll/jscad-fluent']).toBe(fluent)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd /home/john/src/jscadui/apps/jscad-web && npx vitest run bundles.test.js`
Expected: FAIL, cannot resolve `./bundles.js`.

- [ ] **Step 4: Implement `bundles.js`**

```js
const ANCHORS_CDN = 'https://cdn.jsdelivr.net/npm/@jbroll/jscad-anchors@0/dist/jscad-anchors.cjs'

/**
 * Module URLs for the worker's bundle aliases.
 * @param {{engine?: string, toUrl: (path: string) => string, overrides?: Record<string, string>}} options
 * @returns {Record<string, string>}
 */
export const getBundles = ({ engine, toUrl, overrides = {} }) => {
  const jscadModeling = toUrl('./build/bundle.jscad_modeling.js')
  const anchors = overrides['@jbroll/jscad-anchors'] ?? ANCHORS_CDN
  return {
    ...overrides,
    '@jscad/modeling': anchors,
    '@jbroll/jscad-anchors': anchors,
    '@jscad/modeling-for-anchors': engine === 'manifold' ? toUrl('./build/bundle.manifold_modeling.js') : jscadModeling,
    '@jscad/modeling-for-manifold': jscadModeling,
    '@jscad/io': toUrl('./build/bundle.jscad_io.js'),
    '@jscad/csg': toUrl('./build/bundle.V1_api.js'),
    '@jscadui/params-core': toUrl('./build/bundle.params_core.js'),
    '@jscadui/jscad-text': toUrl('./build/bundle.jscad_text.js'),
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/john/src/jscadui/apps/jscad-web && npx vitest run bundles.test.js`
Expected: 4 passed.

- [ ] **Step 6: Use it in `main.js`**

Delete `getModelingBundle` and the old `getBundles` (lines 291-314, including their JSDoc). Add `import { getBundles } from './bundles.js'` beside the other relative imports at the top. Add, where the old functions were:

```js
const workerBundles = () =>
  getBundles({ engine: viewState.modelingEngine, toUrl, overrides: window.jscadModuleOverrides ?? {} })
```

Change both `workerApi.jscadInit({ bundles: getBundles(), useParamsProxy })` calls (startup, and inside `onModelingEngineChange`) to `workerApi.jscadInit({ bundles: workerBundles(), useParamsProxy })`.

- [ ] **Step 7: Clear the module cache when modeling changes in `worker.js`**

Add `clearAllCaches` to the `@jscadui/require` import on line 3. Replace lines 169-176 with:

```js
  // The anchors build keeps one URL across engines, so cached CDN modules still hold the old engine.
  const modelingChanged = ['@jscad/modeling', '@jscad/modeling-for-anchors'].some(name => {
    const old = requireCache.bundleAlias[name]
    return old && bundles[name] && old !== bundles[name]
  })
  if (modelingChanged) {
    console.log('Modeling bundle changed, clearing module cache')
    clearAllCaches()
  }
```

Check that `requireCache.bundleAlias` still holds the aliases after `clearAllCaches` (read `clearAllCaches` in `packages/require/src/caching/cacheManager.ts`; it resets `localCache`, `aliases`, `moduleCache`, `dependencies`, `loading`, not `bundleAliases`). The `Object.assign(requireCache.bundleAlias, bundles)` on the next line must still run after the clear.

- [ ] **Step 8: Run the app and package tests**

Run: `cd /home/john/src/jscadui/apps/jscad-web && npx vitest run`
Run: `cd /home/john/src/jscadui/packages/require && npx vitest run`
Run: `cd /home/john/src/jscadui/packages/worker && npx vitest run`
Expected: pass, or the same failures as on `main` (check with `git stash` only if something fails, and report what you compared).

- [ ] **Step 9: Build the viewer**

Run: `cd /home/john/src/jscadui/apps/jscad-web && node build.js --skipDocs`
Expected: exits 0; `build/main.js` contains `jscadModuleOverrides` (check with `grep -c jscadModuleOverrides build/main.js`, expect a nonzero count).

- [ ] **Step 10: Docs**

If jscadui or `apps/jscad-web` documents the worker bundles or `getBundles` (search `docs/` and `apps/jscad-web/README.md` for `bundle.jscad_modeling` and `modeling-for-manifold`), add the anchors mapping and `window.jscadModuleOverrides` there. If nothing documents them, skip this step and say so.

- [ ] **Step 11: Commit**

```bash
git -C /home/john/src/jscadui add apps/jscad-web/bundles.js apps/jscad-web/bundles.test.js apps/jscad-web/main.js packages/worker/worker.js
git -C /home/john/src/jscadui commit -m "feat(web): load models through jscad-anchors and accept module overrides"
```

Add any doc files changed in Step 10 to the same commit.

---

### Task 4: jscad-ai-studio viewer server serves local packages

**Files:**
- Modify: `/home/john/src/jscad-ai-studio/lib/viewer-server.js`
- Modify: `/home/john/src/jscad-ai-studio/bin/jscad-work.js:145-161`
- Modify: `/home/john/src/jscad-ai-studio/test/viewer-server.test.js`
- Modify: `/home/john/src/jscad-ai-studio/vitest.config.js`
- Modify: `/home/john/src/jscad-ai-studio/docs/install.md`, `docs/user-manual.md`, `docs/development.md`, `docs/architecture.md`

**Model:** `sonnet` — server change, tests, CLI output, docs.

**Interfaces:**
- Consumes: route and global names from Global Constraints.
- Produces:
  - `readLocalPackages(list: string | undefined, cwd?: string): Promise<Array<{ name: string, dir: string, file: string }>>`. `dir` is absolute; `file` is the package-relative browser file with any leading `./` removed. Throws `no package.json in <entry>` or `no <file> in <entry>; run npm run build there`, where `<entry>` is the directory as written in the list.
  - `injectBridge(html: string, overrides?: Record<string, string>): string`.
  - `startViewerServer(directory, { viewerRoot, localPackages })` where `localPackages` defaults to `process.env.JSCAD_LOCAL_PACKAGES`. Resolves `{ server, port, viewerUrl, localPackages }`, with `localPackages` the array from `readLocalPackages`.

- [ ] **Step 1: Write the failing tests**

Update the import in `test/viewer-server.test.js` to:

```js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
```

and add `readLocalPackages` to the `../lib/viewer-server.js` import. Change `srv = await startViewerServer(dir);` in `beforeAll` to `srv = await startViewerServer(dir, { localPackages: "" });`, and do the same for the `startViewerServer(dir)` call in the reload test and the `startViewerServer(models, { viewerRoot })` call (add `localPackages: ""`), so these tests do not depend on built sibling packages. Then append:

```js
const makePackage = (pkg, files) => {
  const dir = mkdtempSync(join(tmpdir(), "lp-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
};

test("injectBridge prepends the module override map when given", () => {
  const out = injectBridge("<body></body>", { "@x/y": "http://127.0.0.1:1/__studio/packages/@x/y/d.cjs" });
  expect(out).toMatch(
    /<script>window\.jscadModuleOverrides = \{"@x\/y":"http:\/\/127\.0\.0\.1:1\/__studio\/packages\/@x\/y\/d\.cjs"\};/,
  );
  expect(injectBridge("<body></body>", {})).not.toMatch(/jscadModuleOverrides/);
});

test("readLocalPackages prefers jsdelivr, then a string browser, then main", async () => {
  const a = makePackage({ name: "@t/a", jsdelivr: "dist/a.cjs", browser: "b.js", main: "m.js" }, { "dist/a.cjs": "a" });
  const b = makePackage({ name: "@t/b", browser: "./b.js", main: "m.js" }, { "b.js": "b" });
  const c = makePackage({ name: "@t/c", browser: { x: false }, main: "./dist/c.cjs" }, { "dist/c.cjs": "c" });
  try {
    const pkgs = await readLocalPackages([a, b, c].join(","));
    expect(pkgs).toEqual([
      { name: "@t/a", dir: a, file: "dist/a.cjs" },
      { name: "@t/b", dir: b, file: "b.js" },
      { name: "@t/c", dir: c, file: "dist/c.cjs" },
    ]);
    expect(await readLocalPackages(undefined)).toEqual([]);
    expect(await readLocalPackages("")).toEqual([]);
  } finally {
    for (const d of [a, b, c]) rmSync(d, { recursive: true, force: true });
  }
});

test("readLocalPackages resolves relative directories against cwd", async () => {
  const a = makePackage({ name: "@t/a", main: "a.js" }, { "a.js": "a" });
  try {
    const pkgs = await readLocalPackages(a.split("/").pop(), join(a, ".."));
    expect(pkgs[0].dir).toBe(a);
  } finally {
    rmSync(a, { recursive: true, force: true });
  }
});

test("a missing build file or package.json rejects startViewerServer with the directory", async () => {
  const noBuild = makePackage({ name: "@t/a", jsdelivr: "dist/a.cjs" }, {});
  const empty = mkdtempSync(join(tmpdir(), "lp-empty-"));
  try {
    await expect(startViewerServer(tmpdir(), { localPackages: noBuild })).rejects.toThrow(
      `no dist/a.cjs in ${noBuild}; run npm run build there`,
    );
    await expect(startViewerServer(tmpdir(), { localPackages: empty })).rejects.toThrow(
      `no package.json in ${empty}`,
    );
  } finally {
    rmSync(noBuild, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

test("local packages are served uncached and named in the page's override map", async () => {
  const pkg = makePackage({ name: "@t/a", jsdelivr: "dist/a.cjs" }, { "dist/a.cjs": "// v1" });
  const viewerRoot = mkdtempSync(join(tmpdir(), "lp-build-"));
  writeFileSync(join(viewerRoot, "index.html"), "<html><body>viewer</body></html>");
  const local = await startViewerServer(tmpdir(), { viewerRoot, localPackages: pkg });
  const base = `http://127.0.0.1:${local.port}`;
  try {
    expect(local.localPackages).toEqual([{ name: "@t/a", dir: pkg, file: "dist/a.cjs" }]);
    const url = `${base}/__studio/packages/@t/a/dist/a.cjs`;
    const first = await fetch(url);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("content-type")).toMatch(/javascript/);
    expect(await first.text()).toBe("// v1");
    writeFileSync(join(pkg, "dist/a.cjs"), "// v2");
    expect(await (await fetch(url)).text()).toBe("// v2");
    expect((await fetch(`${base}/__studio/packages/@t/a/package.json`)).status).toBe(404);
    const page = await (await fetch(`${base}/`)).text();
    expect(page).toContain(`window.jscadModuleOverrides = {"@t/a":"${url}"}`);
  } finally {
    local.server.close();
    rmSync(pkg, { recursive: true, force: true });
    rmSync(viewerRoot, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/john/src/jscad-ai-studio && npx vitest run test/viewer-server.test.js`
Expected: FAIL, `readLocalPackages` is not exported.

- [ ] **Step 3: Implement in `lib/viewer-server.js`**

Imports stay as they are; `pathResolve` covers path resolution. Replace the `BRIDGE` constant and `injectBridge` with:

```js
const BRIDGE_SCRIPT = `(()=>{try{const es=new EventSource('/__studio/events');es.onmessage=(e)=>{try{const d=JSON.parse(e.data);if(d.reload){location.reload();return;}if(window.jscadStudio&&d.params)window.jscadStudio.setParams(d.params);}catch{}};}catch{}})()`;

export const injectBridge = (html, overrides = {}) => {
  const prefix = Object.keys(overrides).length
    ? `window.jscadModuleOverrides = ${JSON.stringify(overrides)};`
    : "";
  const bridge = `<script>${prefix}${BRIDGE_SCRIPT}</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : html + bridge;
};
```

Add after `MIME_TYPES`:

```js
const PACKAGES_PREFIX = "/__studio/packages/";

export const readLocalPackages = async (list, cwd = process.cwd()) => {
  const entries = (list ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return Promise.all(
    entries.map(async (entry) => {
      const dir = pathResolve(cwd, entry);
      let pkg;
      try {
        pkg = JSON.parse(await readFile(pathResolve(dir, "package.json"), "utf8"));
      } catch {
        throw new Error(`no package.json in ${entry}`);
      }
      const browser = typeof pkg.browser === "string" ? pkg.browser : undefined;
      const file = (pkg.jsdelivr ?? browser ?? pkg.main ?? "index.js").replace(/^\.\//, "");
      if (!existsSync(pathResolve(dir, file)))
        throw new Error(`no ${file} in ${entry}; run npm run build there`);
      return { name: pkg.name, dir, file };
    }),
  );
};

const packageUrls = (packages, port) =>
  Object.fromEntries(
    packages.map(({ name, file }) => [name, `http://127.0.0.1:${port}${PACKAGES_PREFIX}${name}/${file}`]),
  );

const servePackage = async (res, packages, pathname) => {
  const pkg = packages.find(({ name, file }) => pathname === `${PACKAGES_PREFIX}${name}/${file}`);
  if (!pkg) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const content = await readFile(pathResolve(pkg.dir, pkg.file));
  res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
  res.end(content);
};
```

`proxyHtmlWithInjection(req, res)` and `serveLocalHtml(res, viewerRoot)` each gain a final `overrides` parameter and pass it to `injectBridge`.

Rewrite `startViewerServer` so validation runs before `createServer`:

```js
export const startViewerServer = async (
  directory,
  {
    viewerRoot = process.env.JSCAD_VIEWER_ROOT || undefined,
    localPackages = process.env.JSCAD_LOCAL_PACKAGES,
  } = {},
) => {
  if (viewerRoot && !existsSync(pathResolve(viewerRoot, "index.html")))
    throw new Error(
      `no viewer build at ${viewerRoot}: run \`node build.js --skipDocs\` in ../jscadui/apps/jscad-web`,
    );
  const packages = await readLocalPackages(localPackages);
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      // existing body, with these changes:
      //   before the `pathname === "/"` check, inside the try:
      //     if (pathname.startsWith(PACKAGES_PREFIX)) return await servePackage(res, packages, pathname);
      //   the two HTML calls pass the overrides:
      //     const overrides = packageUrls(packages, server.address().port);
      //     serveLocalHtml(res, viewerRoot, overrides) / proxyHtmlWithInjection(req, res, overrides)
    });
    // existing listen/watch code unchanged, except resolve adds the packages:
    //   resolve({ server, port, viewerUrl: ..., localPackages: packages });
  });
};
```

Keep the existing request handling, watcher, and `server.on("error", reject)` exactly as they are apart from the three changes in the comments above; do not leave those comments in the file.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/john/src/jscad-ai-studio && npx vitest run test/viewer-server.test.js`
Expected: all pass.

- [ ] **Step 5: Print the served packages in `bin/jscad-work.js`**

Change line 147 to `const { server, port, localPackages } = await startViewerServer(cwd);` and after the `✓ Viewer:` line add:

```js
  for (const pkg of localPackages)
    console.log(`  ✓ Local package: ${pkg.name} (${pkg.dir}/${pkg.file})`);
```

- [ ] **Step 6: Default the variable for the test run**

In `vitest.config.js`, add to `env`, beside `JSCAD_VIEWER_ROOT`:

```js
      JSCAD_LOCAL_PACKAGES:
        process.env.JSCAD_LOCAL_PACKAGES ??
        ["../jscad-anchors", "../jscad-fluent"]
          .map((p) => fileURLToPath(new URL(p, import.meta.url)))
          .join(","),
```

Setting `JSCAD_LOCAL_PACKAGES=` (empty) on the command line turns it off for the published-package check.

- [ ] **Step 7: Docs**

- `docs/install.md` Configuration table: a row for `JSCAD_LOCAL_PACKAGES`: comma-separated package directories (relative to the working directory) whose browser file the viewer server serves in place of jsdelivr, for example `../jscad-anchors,../jscad-fluent`. Each needs its build (`npm run build` there). The file is `jsdelivr`, else a string `browser`, else `main` from its `package.json`. Also add to the `JSCAD_VIEWER_ROOT` row that a local viewer build loads `@jbroll/jscad-anchors` for every model, so it needs jsdelivr or `JSCAD_LOCAL_PACKAGES`.
- `docs/user-manual.md` server section (step 1 near line 29 and step 4): the server also serves `JSCAD_LOCAL_PACKAGES` files at `/__studio/packages/<name>/<file>`, uncached, and the tab loads them instead of jsdelivr; a missing build stops startup with `no <file> in <dir>; run npm run build there`; the start output lists each local package. In the render section near line 358, note that `render` uses the same variable.
- `docs/development.md` near line 45: the render tests also need `../jscad-anchors` and `../jscad-fluent` built (`npm run build` in each); `vitest.config.js` sets `JSCAD_LOCAL_PACKAGES` to them unless it is already set.
- `docs/architecture.md`: in the section covering the viewer server, one paragraph: the viewer resolves bare package names to jsdelivr; the server injects `window.jscadModuleOverrides` before `main.js` runs, and jscadui's `getBundles` adds those URLs as bundle aliases. If there is no such section, add the paragraph where the viewer server is first described.

- [ ] **Step 8: Run the non-render suite and lint**

Run: `cd /home/john/src/jscad-ai-studio && npx vitest run --exclude test/render.test.js`
Run: `npx biome check lib/viewer-server.js bin/jscad-work.js test/viewer-server.test.js vitest.config.js`
Expected: pass. Render-dependent failures in other files are expected until Task 5's builds exist; report which files failed and why.

- [ ] **Step 9: Commit**

```bash
git -C /home/john/src/jscad-ai-studio add lib/viewer-server.js bin/jscad-work.js test/viewer-server.test.js vitest.config.js docs/install.md docs/user-manual.md docs/development.md docs/architecture.md
git -C /home/john/src/jscad-ai-studio commit -m "feat: serve local package builds to the viewer"
```

---

### Task 5: Anchored fixture renders against local builds

**Files:**
- Modify: `/home/john/src/jscad-ai-studio/test/render.test.js`

**Model:** `sonnet` — needs three builds in place and may need debugging across repos.

**Interfaces:**
- Consumes: Task 2's `dist/jscad-anchors.cjs`, Task 3's viewer build, Task 4's server and `vitest.config.js` default.
- Produces: a passing render test for `test/fixtures/anchored-plate.js`.

- [ ] **Step 1: Make sure the builds exist**

Run each, one per command:
- `npm --prefix /home/john/src/jscad-anchors run build`
- `npm --prefix /home/john/src/jscad-fluent run build`
- `cd /home/john/src/jscadui/apps/jscad-web && node build.js --skipDocs` (skip if Task 3 just built it and nothing in jscadui changed since)

Expected: each exits 0.

- [ ] **Step 2: Write the test**

Append to `test/render.test.js`:

```js
test("renders a model that uses jscad-anchors", async () => {
  const r = await renderModel(fx("anchored-plate.js"), { size: [400, 300] });
  expect(existsSync(r.path)).toBe(true);
  expect(statSync(r.path).size).toBeGreaterThan(1000);
}, 60000);
```

- [ ] **Step 3: Run the render tests**

Run: `cd /home/john/src/jscad-ai-studio && npx vitest run test/render.test.js`
Expected: all pass, including the new test and the existing cube, `.scad`, section, and error tests.

If the anchored test fails with `model error in viewer`, use superpowers:systematic-debugging. Likely causes: the bundle requires something other than `@jscad/modeling-for-anchors` (check `grep -o "require(\"[^\"]*\")" dist/jscad-anchors.cjs | sort -u` in jscad-anchors), or a jscadui alias is wrong. Fix the cause in the repo it belongs to and commit it there.

- [ ] **Step 4: Run the whole suite**

Run: `cd /home/john/src/jscad-ai-studio && npm test`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git -C /home/john/src/jscad-ai-studio add test/render.test.js
git -C /home/john/src/jscad-ai-studio commit -m "test: render an anchored model against local package builds"
```

---

### Task 6: Unpublished tab check (controller, inline)

**Model:** controller — uses the Playwright MCP browser tools, which subagents do not share.

- [ ] **Step 1:** Copy `test/fixtures/anchored-plate.js` into the scratchpad directory so `jscad-work` does not write `JSCAD.md` and `.jscad-studio` into `test/fixtures`.
- [ ] **Step 2:** Start `jscad-work anchored-plate.js` in the scratchpad with `run_in_background`, with `JSCAD_VIEWER_ROOT=/home/john/src/jscadui/apps/jscad-web/build` and `JSCAD_LOCAL_PACKAGES=/home/john/src/jscad-anchors,/home/john/src/jscad-fluent`. Read the viewer URL and the two `✓ Local package` lines from its output.
- [ ] **Step 3:** Navigate the Playwright browser to the viewer URL. Confirm no model error in the console, take a screenshot showing the plate and pin, set the `pinShift` slider to `5`, and take a second screenshot showing the pin moved.
- [ ] **Step 4:** Stop the server with `jscad-work stop` in the scratchpad.
- [ ] **Step 5:** Push the jscad-anchors branch: `git -C /home/john/src/jscad-anchors push -u origin local-packages`.

### Task 7: Publish `@jbroll/jscad-anchors` (controller, user confirms)

- [ ] **Step 1:** Ask the user to confirm publishing `@jbroll/jscad-anchors` 0.1.0 and to run `npm login` if needed.
- [ ] **Step 2:** Run `npm pack --dry-run` in jscad-anchors and check the file list contains `dist/jscad-anchors.cjs` and `src/`.
- [ ] **Step 3:** The user runs `! npm publish --access public` in `/home/john/src/jscad-anchors` (npm may prompt for a one-time password).
- [ ] **Step 4:** Purge: `curl -s https://purge.jsdelivr.net/npm/@jbroll/jscad-anchors@0`.

### Task 8: jscadui regression check (controller)

- [ ] **Step 1:** Push the jscadui branch: `git -C /home/john/src/jscadui push -u origin local-packages`.
- [ ] **Step 2:** Check out `main` in jscadui, run `sci push jscadui/render` from `/home/john/src/jscadui`, and record the job id. `sci push` rsyncs the working tree, so the checkout decides what is tested.
- [ ] **Step 3:** Run `sci wait <id>` with `run_in_background`. When it finishes, record passes, failures, and failing example names.
- [ ] **Step 4:** Check out `local-packages`, repeat Steps 2-3.
- [ ] **Step 5:** Compare. Any example that passes on `main` and fails on the branch is a regression: debug it with superpowers:systematic-debugging before continuing.

### Task 9: Publish jscad-fluent 0.7.0 (controller, user confirms)

- [ ] **Step 1:** Ask the user to confirm publishing `@jbroll/jscad-fluent` 0.7.0.
- [ ] **Step 2:** `npm --prefix /home/john/src/jscad-fluent version 0.7.0` (commits and tags on `main`; the Makefile's `publish` target bumps a patch version, so it is not used).
- [ ] **Step 3:** `npm --prefix /home/john/src/jscad-fluent run build`.
- [ ] **Step 4:** The user runs `! npm publish` in `/home/john/src/jscad-fluent`.
- [ ] **Step 5:** Purge: `curl -s https://purge.jsdelivr.net/npm/@jbroll/jscad-fluent`.

### Task 10: Published check (controller)

- [ ] **Step 1:** `cd /home/john/src/jscad-ai-studio && JSCAD_LOCAL_PACKAGES= npx vitest run test/render.test.js`. Expected: all pass, loading both packages from jsdelivr.
- [ ] **Step 2:** Repeat Task 6 Steps 2-4 with `JSCAD_LOCAL_PACKAGES` unset. The start output lists no local packages; screenshots show the plate, pin, and moved pin.

### Task 11: Deploy and clean up

- [ ] **Step 1 (controller, user confirms):** Ask to deploy. Then `cd /home/john/src/jscadui/apps/jscad-web && node build.js`, then `/home/john/bin/deploy.sh update`. Verify with `curl -s https://jscad.rkroll.com/main.js` and a count of `jscadModuleOverrides`.
- [ ] **Step 2 (controller):** Repeat Task 6 Steps 2-4 with neither `JSCAD_VIEWER_ROOT` nor `JSCAD_LOCAL_PACKAGES` set.
- [ ] **Step 3 (subagent, `haiku`):** In jscad-ai-studio: delete `skills/jscad-assembly/SKILL.md` lines 115-117 (the bullet saying `jscad-work render` cannot load anchored models); delete the "Render anchored models in the viewer" bullet from `docs/backlog.md` (lines 18-21); delete `docs/superpowers/specs/2026-09-15-local-packages-viewer-design.md` and this plan. Commit: `docs: anchored models render in the viewer`.
- [ ] **Step 4 (controller):** Push `local-packages` in jscad-ai-studio, jscadui, and jscad-anchors, and `main` with tag `v0.7.0` in jscad-fluent. Then use superpowers:finishing-a-development-branch for merging each `local-packages` branch into `main`.
