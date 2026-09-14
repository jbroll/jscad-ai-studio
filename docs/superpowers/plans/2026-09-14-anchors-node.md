# Anchors in jscad-work (Node side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load modeling through `@jbroll/jscad-anchors` in the model tools, fix 3mf/obj export of anchored geometry, and add `measure --anchors` and `verify-spec` `anchors` assertions.

**Architecture:** `lib/anchors.js` loads the anchors package the way `lib/jf.js` loads jscad-fluent. `lib/cjs-loader.js` hands that package to models for both `@jbroll/jscad-anchors` and `@jscad/modeling`. `lib/measure.js` gains `measureAnchors` (world frames per item) and `anchorFrame` (one `N:name` lookup); `lib/spec.js` validates and asserts `anchors` entries with `axisRelation` from `lib/axis.js`. Export computes triangle counts before the raw serializers bake the geometry.

**Tech Stack:** Node 22 ESM, CommonJS models run through `vm.compileFunction`, vitest, biome, knip.

**Spec:** `docs/superpowers/specs/2026-09-14-anchors-node-design.md`

## Global Constraints

- `package.json` adds `"@jbroll/jscad-anchors": "file:../jscad-anchors"` and `"@jbroll/jscad-modeling": "file:../OpenJSCAD.org/packages/modeling"`. `overrides` is unchanged.
- Frames reported by `measure --anchors` are rounded to 0.000001, with `-0` normalized to `0`.
- `axisAngle` default tolerance is 0.1 degree (the existing `ANGLE_TOLERANCE`).
- Anchor selectors are `N:name`, one item index, no ranges.
- `verify-spec --write` does not draft anchor entries.
- Rendering anchored models in the viewer is out of scope. Do not touch `lib/render.js` or `lib/viewer-server.js`.
- Commit hooks (lefthook, org-hooks `profiles/ts.yml`) run Biome, type-check, knip, and a size cap. If a hook fails, fix the cause; never `--no-verify`.
- Docs change in the same commit as the code they describe. Prose rules: plain words, no filler, no marketing words.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01X1jd8g7951djp4TEUDqS3i
  ```
- Never push, never open a pull request.

## Facts measured before writing this plan

Run against the Task 2 fixture with the current code:

- Plate item frames: `{"bolt1.axis":{"origin":[6,2,0],"z":[0,0,1],"x":[1,0,0]}}`.
- Pin item frames: `{"axis":{"origin":[6,2,0],"z":[0,0,-1],"x":[-1,0,0]}}`. With `pinShift: 0.5` the origin is `[6.5,2,0]`.
- `anchors.anchor(pin, "top")` is `{"origin":[6,2,6],"z":[0,0,1],"x":[1,0,0]}`; the plate's `top` origin is `[0,0,2.5]`.
- `anchors.anchor(g, "nope")` throws `anchor: unknown anchor "nope"`. `anchors([g])` throws `anchors: geometry must be geom2 or geom3`.
- `exportGeom(geom, "array", "3mf" | "obj")` throws `geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors`. stl does not throw.
- With the `anchors` field removed from each item, 3mf and obj exports report `triangleCount` 336.
- `anchors(new FluentGeom3())` returns `{}`. A fluent geometry's own keys are `type, polygons, transforms, isRetesselated, anchors`.
- Errors thrown inside `runModelSync` reach the CLI as exit 1 with `error: <message>` on stderr (see the out-of-range test in `test/cli.test.js`).

---

### Task 1: Dependencies and model loader

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `knip.json` (ignoreDependencies)
- Create: `lib/anchors.js`
- Modify: `lib/cjs-loader.js:1-32`
- Modify: `docs/install.md:6-12`
- Test: `test/cjs-loader.test.js`

**Model:** `sonnet` — dependency install plus loader change; needs to diagnose install or hook issues.

**Interfaces:**
- Produces: `lib/anchors.js` exports `jscadAnchors` (the package object, with every modeling namespace plus `anchors`) and `anchors` (the `AnchorsApi` function: `anchors(geom)` returns explicit world frames; `anchors.anchor(geom, ref)` returns one world frame).

- [ ] **Step 1: Add the dependencies and install**

In `package.json` `dependencies`, keep alphabetical order and add two lines so the block begins:

```json
    "@anthropic-ai/sdk": "^0.40.1",
    "@jbroll/jscad-anchors": "file:../jscad-anchors",
    "@jbroll/jscad-fluent": "file:../jscad-fluent",
    "@jbroll/jscad-modeling": "file:../OpenJSCAD.org/packages/modeling",
    "@jscad/3mf-serializer": "^2.1.17",
```

Run: `npm install`
Expected: exits 0, and `node_modules/@jbroll/jscad-anchors` is a symlink to `../../../jscad-anchors`.

In `knip.json` `ignoreDependencies`, add `"@jbroll/jscad-anchors"` and `"@jbroll/jscad-modeling"` after `"@jbroll/jscad-fluent"`. knip does not follow `createRequire` string requires, which is why jscad-fluent is already listed.

- [ ] **Step 2: Write the failing loader test**

Append to `test/cjs-loader.test.js`, and add `import { anchors } from "../lib/anchors.js";` to the imports:

```js
test("a model outside the repo requires jscad-anchors and modeling, and raw-style calls keep frames", () => {
  const dir = mkdtempSync(join(tmpdir(), "cjs-anchors-"));
  try {
    const model = join(dir, "block.js");
    writeFileSync(
      model,
      `const { anchors } = require("@jbroll/jscad-anchors");
const { primitives, transforms, measurements } = require("@jscad/modeling");
const main = () => {
  const block = anchors.withAnchors(primitives.cuboid({ size: [10, 10, 4] }), {
    axis: anchors.frame([0, 0, 0], [0, 0, 1]),
  });
  const turned = transforms.translate([5, 0, 0], transforms.rotateX(Math.PI / 2, block));
  measurements.measureBoundingBox(turned);
  return turned;
};
module.exports = { main };
`,
    );
    const frame = anchors(loadModel(model)({})).axis;
    expect(frame.origin).toEqual([5, 0, 0]);
    [0, -1, 0].forEach((c, i) => expect(frame.z[i]).toBeCloseTo(c, 9));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/cjs-loader.test.js`
Expected: FAIL, first because `../lib/anchors.js` does not exist.

- [ ] **Step 4: Create `lib/anchors.js`**

```js
import { createRequire } from "node:module";

const pluginRequire = createRequire(import.meta.url);
export const jscadAnchors = pluginRequire("@jbroll/jscad-anchors");
export const { anchors } = jscadAnchors;
```

Run: `npx vitest run test/cjs-loader.test.js`
Expected: the new test FAILS with `Cannot find module '@jbroll/jscad-anchors'` (the temp dir is outside the repo). If it gets past that, it fails with `geometry was baked outside jscad-anchors`.

- [ ] **Step 5: Map both ids in `lib/cjs-loader.js`**

Replace the top of the file through the two mapped ids so it reads:

```js
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import vm from "node:vm";
import { jscadAnchors } from "./anchors.js";
import { jf } from "./jf.js";
import { evalScadModel } from "./openscad.js";
```

Delete the `pluginRequire` and `jscadModeling` constants. In `req`:

```js
    if (id === "@jbroll/jscad-fluent") return jf;
    // jscad-anchors re-exports every modeling namespace, so raw-style calls keep frames.
    if (id === "@jbroll/jscad-anchors" || id === "@jscad/modeling") return jscadAnchors;
```

Deep paths such as `@jscad/modeling/src/...` still fall through to `createRequire(absPath)(id)`.

- [ ] **Step 6: Run the loader tests and the full suite**

Run: `npx vitest run test/cjs-loader.test.js`
Expected: PASS, 5 tests.

Run: `npm test`
Expected: PASS. Any failure that also fails on the commit before this task is pre-existing; report it rather than fixing it here.

Run: `npm run knip`
Expected: no issues.

- [ ] **Step 7: Update `docs/install.md`**

Change "Three sibling checkouts next to this repo:" to "Four sibling checkouts next to this repo:" and add this bullet after the `../jscad-fluent` bullet:

```markdown
  - `../jscad-anchors`: https://github.com/jbroll/jscad-anchors, installed as a `file:` dependency. Models get it for both `@jbroll/jscad-anchors` and `@jscad/modeling`, so frames on anchored geometry survive raw modeling calls. Run `npm install` in it first.
```

Add `git clone https://github.com/jbroll/jscad-anchors ../jscad-anchors` as a second line in the clone code block.

- [ ] **Step 8: Commit**

```bash
git add package.json knip.json lib/anchors.js lib/cjs-loader.js docs/install.md test/cjs-loader.test.js
git commit -m "feat: load modeling for models through jscad-anchors"
```

(Use the attribution trailer from Global Constraints.)

---

### Task 2: Anchored fixture and export fix

**Files:**
- Create: `test/fixtures/anchored-plate.js`
- Modify: `lib/export-geom.js:28-49`
- Modify: `lib/array-geom.js:70-89`
- Test: `test/export-geom.test.js`

**Model:** `haiku` — the fixture, the test, and both edits are spelled out below.

**Interfaces:**
- Produces: `test/fixtures/anchored-plate.js`, a model returning `[plate, pin]`. Item 0 is a 30×20×5 cuboid with a hole cut by a cutter carried as `bolt1` (frame `bolt1.axis` at `[6,2,0]`, `z` `[0,0,1]`). Item 1 is a pin with an `axis` frame attached to `bolt1.axis`, then moved along x by param `pinShift` (default 0). Tasks 3 and 4 use it.

- [ ] **Step 1: Create the fixture**

`test/fixtures/anchored-plate.js`:

```js
const jf = require("@jbroll/jscad-fluent");

const AXIS = { axis: { origin: [0, 0, 0], z: [0, 0, 1] } };

const main = (p) => {
  p.pinShift = { type: "slider", default: 0, min: -5, max: 5, step: 0.5, label: "Pin shift" };
  const cutter = jf
    .cylinder({ radius: 3, height: 10, segments: 32 })
    .withAnchors(AXIS)
    .translate([6, 2, 0]);
  const plate = jf.cuboid({ size: [30, 20, 5] }).subtract(cutter, { carry: { bolt1: cutter } });
  const pin = jf
    .cylinder({ radius: 2.9, height: 12, segments: 32 })
    .withAnchors(AXIS)
    .attachTo(plate, "bolt1.axis", "axis")
    .translate([p.pinShift, 0, 0]);
  return [plate, pin];
};

module.exports = { main };
```

- [ ] **Step 2: Write the failing export test**

Append to `test/export-geom.test.js`:

```js
const withoutAnchors = (items) => items.map(({ anchors: _, ...raw }) => raw);

test.each(["3mf", "obj"])("exports anchored parts to %s with the unanchored triangle count", (format) => {
  const anchored = loadAndRun(fx("anchored-plate.js"), {});
  const plain = loadAndRun(fx("anchored-plate.js"), {});
  const expected = exportGeom(withoutAnchors(plain.geom), "array", format).triangleCount;
  expect(expected).toBeGreaterThan(0);
  expect(exportGeom(anchored.geom, "array", format).triangleCount).toBe(expected);
  const [plate] = loadAndRun(fx("anchored-plate.js"), {}).geom;
  expect(exportGeom(plate, "geom3", format).triangleCount).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/export-geom.test.js`
Expected: FAIL with `geometry was baked outside jscad-anchors; import modeling from @jbroll/jscad-anchors`, for both formats.

- [ ] **Step 4: Count triangles before serializing in `lib/export-geom.js`**

Replace the `3mf` and `obj` cases with:

```js
    case "3mf": {
      need("3mf", geomType, "geom3");
      // Count first: the serializer bakes with raw modeling, which leaves anchored frames stale.
      const triangleCount = triangles(geom);
      const [ab] = threemf.serialize({ compress: true, unit: "millimeter" }, geom);
      const data = Buffer.from(ab);
      return { data, bytes: data.length, triangleCount, mime: threemf.mimeType };
    }
    case "obj": {
      need("obj", geomType, "geom3");
      const triangleCount = triangles(geom);
      const [text] = obj.serialize({ triangulate: true }, geom);
      const data = Buffer.from(text, "utf8");
      return { data, bytes: data.length, triangleCount, mime: obj.mimeType };
    }
```

and add above `exportGeom`:

```js
const triangles = (geom) => geom.toPolygons().reduce((n, p) => n + p.vertices.length - 2, 0);
```

- [ ] **Step 5: Same change in `exportArray` in `lib/array-geom.js`**

Replace the `3mf` and `obj` branches with:

```js
  if (format === "3mf") {
    // Count first: the serializer bakes with raw modeling, which leaves anchored frames stale.
    const triangleCount = triangles(items);
    const [ab] = threemf.serialize({ compress: true, unit: "millimeter" }, ...items);
    const data = Buffer.from(ab);
    return { data, bytes: data.length, triangleCount, mime: threemf.mimeType };
  }
  if (format === "obj") {
    const triangleCount = triangles(items);
    const [text] = obj.serialize({ triangulate: true }, ...items);
    const data = Buffer.from(text, "utf8");
    return { data, bytes: data.length, triangleCount, mime: obj.mimeType };
  }
```

and add above `exportArray`:

```js
const triangles = (items) =>
  items.reduce(
    (n, it) =>
      n + (it.toPolygons ? it.toPolygons().reduce((m, p) => m + p.vertices.length - 2, 0) : 0),
    0,
  );
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run test/export-geom.test.js test/cli.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add test/fixtures/anchored-plate.js lib/export-geom.js lib/array-geom.js test/export-geom.test.js
git commit -m "fix: export anchored geometry to 3mf and obj"
```

---

### Task 3: `measure --anchors`

**Files:**
- Modify: `lib/measure.js`
- Modify: `lib/run-model.js:24,38-43`
- Modify: `lib/cli.js:102-109,245-266`
- Modify: `lib/workspace.js:151`
- Modify: `docs/user-manual.md` (`measure` section, lines 86-139)
- Test: `test/measure.test.js`, `test/cli.test.js`

**Model:** `sonnet` — spans lib, CLI, and docs.

**Interfaces:**
- Consumes: `anchors` from `lib/anchors.js` (Task 1); fixture `test/fixtures/anchored-plate.js` (Task 2).
- Produces: `measureAnchors(geom, geomType)` in `lib/measure.js`, returning `Array<{ part: string, anchors: { [name]: { origin, z, x } } | null }>`. `runModelSync` opt `anchors: boolean` adds `result.measure.anchors`.

- [ ] **Step 1: Write the failing unit test**

Append to `test/measure.test.js`, adding `measureAnchors` to the `../lib/measure.js` import:

```js
test("measureAnchors lists each item's explicit world frames, null for an array item", () => {
  const { geom, geomType } = loadAndRun(fx("anchored-plate.js"), {});
  expect(measureAnchors(geom, geomType)).toEqual([
    { part: "0", anchors: { "bolt1.axis": { origin: [6, 2, 0], z: [0, 0, 1], x: [1, 0, 0] } } },
    { part: "1", anchors: { axis: { origin: [6, 2, 0], z: [0, 0, -1], x: [-1, 0, 0] } } },
  ]);
  expect(measureAnchors([cube(0), [cube(10)]], "array")).toEqual([
    { part: "0", anchors: {} },
    { part: "1", anchors: null },
  ]);
  expect(measureAnchors(cube(0), "geom3")).toEqual([{ part: "0", anchors: {} }]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/measure.test.js`
Expected: FAIL, `measureAnchors` is not a function (or not exported).

- [ ] **Step 3: Implement `measureAnchors` in `lib/measure.js`**

Add `import { anchors } from "./anchors.js";` as the first import. Below the existing `roundMicron` definition, add:

```js
const roundFrame = ({ origin, z, x }) => ({
  origin: origin.map(roundMicron),
  z: z.map(roundMicron),
  x: x.map(roundMicron),
});

export const measureAnchors = (geom, geomType) =>
  itemsOf(geom, geomType).map((item, i) => ({
    part: String(i),
    anchors: Array.isArray(item)
      ? null
      : Object.fromEntries(
          Object.entries(anchors(item)).map(([name, frame]) => [name, roundFrame(frame)]),
        ),
  }));
```

Run: `npx vitest run test/measure.test.js`
Expected: PASS.

- [ ] **Step 4: Write the failing CLI test**

Append to `test/cli.test.js`:

```js
test("measure --anchors lists world frames per item, and {} for a .scad model", async () => {
  const r = await run(["measure", fx("anchored-plate.js"), "--anchors", "-p", '{"pinShift":0.5}']);
  expect(r.code).toBe(0);
  expect(r.json.measure.anchors).toEqual([
    { part: "0", anchors: { "bolt1.axis": { origin: [6, 2, 0], z: [0, 0, 1], x: [1, 0, 0] } } },
    { part: "1", anchors: { axis: { origin: [6.5, 2, 0], z: [0, 0, -1], x: [-1, 0, 0] } } },
  ]);
  const scad = await run(["measure", fx("cube.scad"), "--anchors"]);
  expect(scad.json.measure.anchors).toEqual([{ part: "0", anchors: {} }]);
  const plain = await run(["measure", fx("anchored-plate.js")]);
  expect(plain.json.measure.anchors).toBeUndefined();
}, 30000);
```

Run: `npx vitest run test/cli.test.js -t "measure --anchors"`
Expected: FAIL. `--anchors` is an unknown option (exit 2), so `r.code` is not 0.

- [ ] **Step 5: Wire the option through**

`lib/run-model.js`: add `measureAnchors` to the `./measure.js` import, and inside the `outputs.includes("measure")` block, after the `between` line:

```js
    if (opts.anchors) result.measure.anchors = measureAnchors(run.geom, run.geomType);
```

`lib/cli.js`, `measureOptions` return object gains `anchors: values.anchors,`. In the `measure` command:

- `usage`: `"jscad-work measure <model> [--parts | --part N[-M]...] [--between A,B] [--anchors] [--section AXIS[,OFFSET]] [-p JSON] [-t MS]"`
- `options`: add `anchors: { type: "boolean" },` after `between`.
- `help`: after the `--between` line add `"  --anchors           list each item's named anchor frames in world space",`.

Run: `npx vitest run test/cli.test.js test/measure.test.js`
Expected: PASS, including `every subcommand prints help and exits 0`.

- [ ] **Step 6: Docs**

`docs/user-manual.md`, `measure` section:

- Update the usage line to match the new `usage` string above.
- Add a row to the Parts option table after `--between A,B`:
  `| --anchors | anchors: each item's named anchor frames |` (with the same backtick style as the neighboring rows).
- After the `between` field table and the axis paragraph and its JSON example, before `#### Section`, add:

````markdown
#### Anchors

`--anchors` adds `anchors`, one entry per item, with `part` (the item index) and `anchors`: each named frame the item carries, in world space and rounded to 0.000001. A frame is `origin`, `z` (the anchor's direction, such as a hole axis), and `x`. The 27 direction anchors every part has (`top`, `top+right`, ...) are not listed. An item that is itself an array gives `null`; an item without named frames, including every `.scad` result, gives `{}`. Frames come from `@jbroll/jscad-anchors`: `withAnchors`, `subtract` with `carry`, and `attachTo`, as the `jscad-assembly` skill describes.

```json
{"ok":true,"geomType":"array","measure":{"...":"...","anchors":[{"part":"0","anchors":{"bolt1.axis":{"origin":[6,2,0],"z":[0,0,1],"x":[1,0,0]}}},{"part":"1","anchors":{"axis":{"origin":[6,2,0],"z":[0,0,-1],"x":[-1,0,0]}}}]}}
```
````

- In the axis paragraph, replace "holes inside a larger part are not detected." with "holes inside a larger part are not detected; give the hole an anchor and check it with [Anchors](#anchors) instead."

`lib/workspace.js` line 151, in the **Model** bullet, after `whether round parts are coaxial,` insert `\`measure --anchors\` lists each item's named anchor frames,` so the sentence reads: `... gives the gap between two items' boxes and whether round parts are coaxial, \`measure --anchors\` lists each item's named anchor frames, and \`jscad-work interference <model>\` lists items whose solids overlap.` The file is a template literal, so backticks stay escaped as `\``.

Run: `npx vitest run test/workspace.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/measure.js lib/run-model.js lib/cli.js lib/workspace.js docs/user-manual.md test/measure.test.js test/cli.test.js
git commit -m "feat(measure): --anchors lists world frames per item"
```

---

### Task 4: `verify-spec` `anchors` assertions

**Files:**
- Modify: `lib/measure.js` (add `anchorFrame`)
- Modify: `lib/spec.js`
- Modify: `docs/user-manual.md` (`verify-spec` section, lines 254-305)
- Test: `test/spec.test.js`

**Model:** `sonnet` — validation, runtime errors, and assertion wiring against existing grammar.

**Interfaces:**
- Consumes: `anchors` from `lib/anchors.js`; `itemsOf` and `selectorRange` (module-private and exported, respectively) in `lib/measure.js`; `axisRelation(a, b)` from `lib/axis.js`, taking `{ centroid: number[3], axis: number[3] }` each and returning `{ angle, offset }`; fixture from Task 2.
- Produces: `anchorFrame(geom, geomType, selector)` exported from `lib/measure.js`, returning a world frame `{ origin, z, x }` or throwing:
  - index past the end: `part 2 is out of range; the model has 2 items (0-1)` (from `selectorRange`)
  - array item: `anchor 0:top: item 0 is an array, not one geometry`
  - unknown name: `anchor 0:nope: unknown anchor "nope"`

- [ ] **Step 1: Write the failing tests**

In `test/spec.test.js`, add these rows to the `validateSpec rejects %j` `test.each` table:

```js
  [{ anchors: {} }, /anchors: must be an array/],
  [{ anchors: [{ a: "0", b: "1:axis", distance: 0 }] }, /anchors\.0\.a: "0" is not an anchor N:name/],
  [
    { anchors: [{ a: "0:axis", b: "0-1:axis", distance: 0 }] },
    /anchors\.0\.b: "0-1:axis" is not an anchor N:name/,
  ],
  [{ anchors: [{ a: "0:axis", b: "1:axis", gap: [0, 0, 0] }] }, /anchors\.0: unknown field "gap"/],
```

Append:

```js
const anchoredPlate = (params = {}) => loadAndRun(fx("anchored-plate.js"), params);
const coaxial = { anchors: [{ a: "0:bolt1.axis", b: "1:axis", axisAngle: 0, axisOffset: 0, distance: 0 }] };

test("anchors entries assert axis angle, axis offset, and origin distance from frames", () => {
  expect(() => validateSpec(coaxial)).not.toThrow();
  const { geom, geomType } = anchoredPlate();
  expect(verifySpec(geom, geomType, coaxial)).toEqual({
    passed: 3,
    failed: 0,
    results: [
      { assert: "anchors.0:bolt1.axis,1:axis.axisAngle", expected: 0, actual: 0, pass: true },
      { assert: "anchors.0:bolt1.axis,1:axis.axisOffset", expected: 0, actual: 0, pass: true },
      { assert: "anchors.0:bolt1.axis,1:axis.distance", expected: 0, actual: 0, pass: true },
    ],
  });
  const moved = anchoredPlate({ pinShift: 0.5 });
  expect(verifySpec(moved.geom, moved.geomType, coaxial).results.map((x) => [x.actual, x.pass])).toEqual([
    [0, true],
    [0.5, false],
    [0.5, false],
  ]);
  const tops = { anchors: [{ a: "0:top", b: "1:top", distance: { min: 7.2, max: 7.3 } }] };
  expect(verifySpec(geom, geomType, tops).results[0]).toMatchObject({ actual: 7.228416, pass: true });
});

test("an anchor past the last item, on an array item, or with an unknown name throws", async () => {
  const { geom, geomType } = anchoredPlate();
  const entry = (a) => ({ anchors: [{ a, b: "1:axis", distance: 0 }] });
  expect(() => verifySpec(geom, geomType, entry("2:axis"))).toThrow(
    "part 2 is out of range; the model has 2 items (0-1)",
  );
  expect(() => verifySpec(geom, geomType, entry("0:nope"))).toThrow(
    'anchor 0:nope: unknown anchor "nope"',
  );
  expect(() => verifySpec([[geom[0]], geom[1]], "array", entry("0:top"))).toThrow(
    "anchor 0:top: item 0 is an array, not one geometry",
  );
  const spec = join(tmp(), "plate.spec.json");
  writeFileSync(spec, JSON.stringify(entry("0:nope")));
  const r = await run(["verify-spec", fx("anchored-plate.js"), "--spec", spec]);
  expect(r.code).toBe(1);
  expect(r.stderr).toBe('error: anchor 0:nope: unknown anchor "nope"');
}, 30000);
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/spec.test.js`
Expected: FAIL. The new `validateSpec` rows fail with `unknown field "anchors"`; the new tests fail the same way or with no `anchors` results.

- [ ] **Step 3: Add `anchorFrame` to `lib/measure.js`**

Below `measureAnchors`:

```js
export const anchorFrame = (geom, geomType, selector) => {
  const [, index, name] = selector.match(/^(\d+):(.+)$/);
  const items = itemsOf(geom, geomType);
  selectorRange(index, items.length);
  const item = items[Number(index)];
  if (Array.isArray(item)) {
    throw new Error(`anchor ${selector}: item ${index} is an array, not one geometry`);
  }
  try {
    return anchors.anchor(item, name);
  } catch (err) {
    throw new Error(`anchor ${selector}: ${err.message.replace(/^anchor: /, "")}`);
  }
};
```

Selectors reach this function only after `validateSpec`, so `:` is present and `index` is digits.

- [ ] **Step 4: Validate and assert in `lib/spec.js`**

Imports:

```js
import { axisRelation } from "./axis.js";
import { analyzeDfm, UP_AXES } from "./dfm.js";
import { findInterference } from "./interference.js";
import { anchorFrame, measureBetween, measureGeom, measureParts } from "./measure.js";
```

Constants:

```js
const ANCHORS = { vector: [], scalar: ["distance", "axisAngle", "axisOffset"] };
const ASSERTIONS = ["model", "parts", "between", "anchors", "interference", "dfm"];
const ANCHOR_SELECTOR = /^\d+:.+$/;
```

Below `checkSelector`:

```js
const checkAnchorSelector = (where, text) => {
  if (typeof text !== "string" || !ANCHOR_SELECTOR.test(text)) {
    fail(where, `"${text}" is not an anchor N:name`);
  }
};
```

In `validateSpec`, update the no-assertions message to `"has no assertions; add model, parts, between, anchors, interference, or dfm"`, and after the `between` block add:

```js
  if (spec.anchors !== undefined) {
    if (!Array.isArray(spec.anchors)) fail("anchors", "must be an array");
    spec.anchors.forEach((entry, i) => {
      checkFields(`anchors.${i}`, entry, ANCHORS, ["a", "b"]);
      checkAnchorSelector(`anchors.${i}.a`, entry.a);
      checkAnchorSelector(`anchors.${i}.b`, entry.b);
    });
  }
```

In `verifySpec`, after the `between` loop:

```js
  for (const entry of spec.anchors ?? []) {
    const [fa, fb] = [entry.a, entry.b].map((s) => anchorFrame(geom, geomType, s));
    const { angle, offset } = axisRelation(
      { centroid: fa.origin, axis: fa.z },
      { centroid: fb.origin, axis: fb.z },
    );
    const measured = {
      distance: Math.hypot(...fb.origin.map((c, k) => c - fa.origin[k])),
      axisAngle: angle,
      axisOffset: offset,
    };
    results.push(...assertFields(spec, `anchors.${entry.a},${entry.b}`, entry, measured));
  }
```

`assertFields` emits results in the entry's key order, which is why the test lists `axisAngle, axisOffset, distance`. `toleranceFor` already gives `axisAngle` the 0.1 degree tolerance.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/spec.test.js test/measure.test.js`
Expected: PASS.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Docs**

`docs/user-manual.md`, `verify-spec` section:

- In the example spec JSON, after the `between` array add:

```json
  "anchors": [
    { "a": "0:bolt1.axis", "b": "1:axis", "axisAngle": 0, "axisOffset": 0 },
    { "a": "0:top", "b": "2:bottom", "distance": { "max": 0.05 } }
  ],
```

- Add a row to the field table after `between`:

```markdown
| `anchors` | A list of `{ "a", "b", ... }` comparing two anchor frames: `distance` between their origins in mm, `axisAngle` between their `z` axes (0 to 90 degrees, so opposed axes read 0), and `axisOffset`, the shortest distance between the two `z` axis lines in mm. A selector is `N:name`: one item index and an anchor name, either a named frame `measure --anchors` lists or a direction such as `top`. An index past the last item, an item that is itself an array, or an unknown name exits 1 naming it |
```

- In the expectations paragraph change "(0.1 degree for `axisAngle`)" to "(0.1 degree for `axisAngle` in `between` and `anchors`)". Replace its last sentence "For hole spacing between parts, assert `centerOffset` or each part's `center`." with "For hole spacing between parts, assert `centerOffset` or each part's `center`, or, when the holes carry anchors, `anchors` `distance` and `axisOffset`."
- In the `--write` paragraph, after "one `allow` entry per current overlap with `maxDepth` set to its depth." add "It writes no `anchors` entries."

- [ ] **Step 7: Commit**

```bash
git add lib/measure.js lib/spec.js docs/user-manual.md test/spec.test.js
git commit -m "feat(verify-spec): assert anchor frame alignment"
```

---

### Task 5: Skill and backlogs

**Files:**
- Modify: `skills/jscad-assembly/SKILL.md`
- Modify: `docs/backlog.md:18-23`
- Modify (separate repo, separate commit): `../jscad-anchors/docs/backlog.md:45-58,91-94`

**Model:** `sonnet` — prose written from the spec and the fluent API.

**Interfaces:**
- Consumes: `measure --anchors` (Task 3), `verify-spec` `anchors` (Task 4). Fluent API from `../jscad-fluent/docs/user-manual.md` "Anchors": `.withAnchors(frames)`, `.subtract(tool, { carry: { prefix: tool } })`, `.attachTo(parent, parentAnchor, childAnchor, { flip, overlap, spin })`, `.anchor(ref)`.

- [ ] **Step 1: Add the skill section**

In `skills/jscad-assembly/SKILL.md`, insert a new section between `## Declaring clearances` and `## Checking fit`:

````markdown
## Aligning by construction

When a hole in one part must line up with a pin, bolt, or hole in another, carry
the hole's position as a named anchor instead of recomputing it in `layout.js`.

```js
const AXIS = { axis: { origin: [0, 0, 0], z: [0, 0, 1] } };

const cutter = jf.cylinder({ radius: 3, height: 10 }).withAnchors(AXIS).translate([6, 2, 0]);
const plate = jf.cuboid({ size: [30, 20, 5] }).subtract(cutter, { carry: { bolt1: cutter } });
const pin = jf.cylinder({ radius: 2.9, height: 12 }).withAnchors(AXIS).attachTo(plate, "bolt1.axis", "axis");
```

- Give the cutter an `axis` frame with `withAnchors`, in the cutter's own frame
  before it is moved.
- `subtract(cutter, { carry: { bolt1: cutter } })` keeps the cutter's frames on
  the result as `bolt1.axis`. Without `carry` they are dropped.
- `attachTo(parent, parentAnchor, childAnchor)` moves the mating part so its
  anchor sits on the parent's. The order is parent first, which differs from
  `anchors.attach(child, childAnchor, parent, parentAnchor)` in
  `@jbroll/jscad-anchors`. By default the two `z` axes point at each other;
  pass `{ flip: false }` to make them equal.
- Every part also has direction anchors from its bounding box (`top`,
  `bottom`, `top+right`), so `post.attachTo(base, "top", "bottom")` stacks
  parts without numbers.
- Hull, expand, offset, extrusion, and minkowski results carry no frames.
  Add anchors after those operations.
- `jscad-work measure <assembly>.js --anchors` lists each item's frames in
  world space. Check that the names you expect are there.
- In the spec, assert the alignment from frames:

  ```json
  "anchors": [{ "a": "0:bolt1.axis", "b": "1:axis", "axisAngle": 0, "axisOffset": 0 }]
  ```

  Unlike `between` axes, this finds holes inside a larger part.
- `jscad-work render` cannot load anchored models yet: the viewer's
  jscad-fluent has no anchor methods. Check them with `measure` and
  `verify-spec`.
````

In `## Checking fit` step 6, change "add `between` entries for the named clearances and coaxial parts" to "add `between` entries for the named clearances and coaxial parts, and `anchors` entries for anchored holes".

- [ ] **Step 2: Replace the backlog item**

In `docs/backlog.md`, replace the "Hole alignment across parts" bullet (lines 18-23) with:

```markdown
- Render anchored models in the viewer. The viewer loads `@jbroll/jscad-fluent`
  0.6.1 from jsdelivr, which has no anchor methods, and `@jbroll/jscad-anchors`
  is not on npm. Needs a single-file anchors build, a jscadui hook for extra
  module bundles, and `lib/viewer-server.js` serving the local packages.
```

- [ ] **Step 3: Commit in this repo**

```bash
git add skills/jscad-assembly/SKILL.md docs/backlog.md
git commit -m "docs: teach aligning parts by anchors"
```

- [ ] **Step 4: Update the jscad-anchors backlog**

In `/home/john/src/jscad-anchors/docs/backlog.md`:

- Delete the `## jscad-ai-studio` section (lines 45-58); that work has landed.
- Replace the `## Serializers and \`format-jscad\`` section body (line 93-94) with:

```markdown
Checked from jscad-ai-studio against an anchored, transformed plate:

- `@jscad/stl-serializer`, `3mf-serializer`, `obj-serializer`, and
  `svg-serializer` bake geometry with raw modeling. Their output bytes are
  unchanged by the `anchors` field, but the frames are stale afterward, so any
  later `anchors()` or wrapped call on the same object throws the raw-bake
  error. Callers that read geometry after serializing must do so first.
- `@jscadui/format-jscad` reads only `polygons`, `sides`, `outlines`, `color`,
  and `transforms`, never calls modeling, and ignores `anchors`.

Left open: whether the serializers should import modeling through this
package, which the field hook below would make unnecessary.
```

Run: `git -C /home/john/src/jscad-anchors status --short`
Expected: only `docs/backlog.md` modified.

```bash
git -C /home/john/src/jscad-anchors add docs/backlog.md
git -C /home/john/src/jscad-anchors commit -m "docs(backlog): record serializer and format-jscad findings"
```

Do not push.

---

### Task 6: Remove the working documents

**Files:**
- Delete: `docs/superpowers/specs/2026-09-14-anchors-node-design.md`
- Delete: `docs/superpowers/plans/2026-09-14-anchors-node.md`

**Model:** `haiku` — two deletions after the final review passes.

- [ ] **Step 1: Confirm nothing in the permanent docs points at them**

Run: `git grep -n "2026-09-14-anchors-node"`
Expected: matches only inside the two files being deleted.

- [ ] **Step 2: Delete and commit**

```bash
git rm docs/superpowers/specs/2026-09-14-anchors-node-design.md docs/superpowers/plans/2026-09-14-anchors-node.md
git commit -m "docs: remove anchors-node spec and plan"
```
