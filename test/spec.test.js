import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runCli } from "../lib/cli.js";
import { loadAndRun } from "../lib/model-loader.js";
import { validateSpec, verifySpec } from "../lib/spec.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const fixtureSpec = () => JSON.parse(readFileSync(fx("press-fit.spec.json"), "utf8"));
const pressFit = () => loadAndRun(fx("press-fit.js"), {});

const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "spec-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const run = async (argv) => {
  const out = [];
  const err = [];
  const code = await runCli(argv, { stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  const stdout = out.join("\n");
  return { code, stderr: err.join("\n"), json: stdout ? JSON.parse(stdout) : undefined };
};

test.each([
  [{ modle: {} }, /unknown field "modle"/],
  [{}, /has no assertions/],
  [{ parts: { a: { dimensions: [1, 1, 1] } } }, /"a" is not an item index/],
  [{ model: { dimensions: [1, 2] } }, /model\.dimensions: takes three values/],
  [{ model: { volume: { min: 1, value: 2 } } }, /model\.volume: takes a number/],
  [{ between: [{ a: "0", b: "1", gapp: [0, 0, 0] }] }, /between\.0: unknown field "gapp"/],
  [{ interference: { allow: [{ a: "0", b: "x" }] } }, /interference\.allow\.0\.b/],
  [{ anchors: {} }, /anchors: must be an array/],
  [
    { anchors: [{ a: "0", b: "1:axis", distance: 0 }] },
    /anchors\.0\.a: "0" is not an anchor N:name/,
  ],
  [
    { anchors: [{ a: "0:axis", b: "0-1:axis", distance: 0 }] },
    /anchors\.0\.b: "0-1:axis" is not an anchor N:name/,
  ],
  [{ anchors: [{ a: "0:axis", b: "1:axis", gap: [0, 0, 0] }] }, /anchors\.0: unknown field "gap"/],
])("validateSpec rejects %j", (spec, message) => {
  expect(() => validateSpec(spec)).toThrow(message);
});

test("a dfm block asserts minimum wall and overhang area under its own thresholds", () => {
  expect(() => validateSpec({ dfm: { up: "z" } })).toThrow(/dfm\.up: must be one of/);
  expect(() => validateSpec({ dfm: { wall: 0 } })).toThrow(/dfm\.wall/);
  expect(() => validateSpec({ dfm: { minWal: 1 } })).toThrow(/dfm: unknown field "minWal"/);
  const { geom, geomType } = loadAndRun(fx("t-shape.js"), {});
  const spec = { dfm: { wall: 1, minWall: { min: 1 }, overhangArea: { max: 0 } } };
  expect(() => validateSpec(spec)).not.toThrow();
  expect(verifySpec(geom, geomType, spec).results).toEqual([
    { assert: "dfm.minWall", expected: { min: 1 }, actual: 5, pass: true },
    { assert: "dfm.overhangArea", expected: { max: 0 }, actual: 200, pass: false },
  ]);
  expect(verifySpec(geom, geomType, { dfm: { up: "-z", overhangArea: { max: 0 } } })).toMatchObject(
    {
      failed: 0,
    },
  );
});

test("the fixture spec passes with actual values beside each expectation", () => {
  const spec = fixtureSpec();
  expect(() => validateSpec(spec)).not.toThrow();
  const { geom, geomType } = pressFit();
  const r = verifySpec(geom, geomType, spec);
  expect(r).toMatchObject({ passed: 10, failed: 0 });
  expect(r.results[4]).toEqual({
    assert: "between.0,2.gap",
    expected: [null, null, 0],
    actual: [-4, -4, 0],
    pass: true,
  });
});

test("a wrong dimension, an unallowed overlap, and a deeper one fail", () => {
  const spec = fixtureSpec();
  spec.model.dimensions = [20, 20, 15];
  spec.interference.allow = [{ a: "0", b: "1", maxDepth: 0.05 }];
  const { geom, geomType } = pressFit();
  const r = verifySpec(geom, geomType, spec);
  expect(r.failed).toBe(2);
  expect(r.results[0]).toMatchObject({ assert: "model.dimensions", pass: false });
  const overlaps = r.results.at(-1);
  expect(overlaps.actual.map((p) => [p.a, p.b, p.maxDepth])).toEqual([
    ["0", "1", 0.05],
    ["0", "3", undefined],
  ]);
  expect(overlaps.actual[1]).toEqual({
    a: "0",
    b: "3",
    volume: 48,
    depth: 1.2,
    dimensions: [4, 4, 3],
  });
});

test("value tolerances, ranges, and volumeTolerance", () => {
  const { geom, geomType } = pressFit();
  const check = (spec) => verifySpec(geom, geomType, spec).results.map((x) => x.pass);
  expect(
    check({ model: { dimensions: [{ value: 20.4, tolerance: 0.5 }, { max: 19 }, null] } }),
  ).toEqual([false]);
  expect(check({ parts: { 0: { volume: 1760 } } })).toEqual([false]);
  expect(check({ volumeTolerance: 0.01, parts: { 0: { volume: 1760 } } })).toEqual([true]);
  expect(check({ tolerance: 0.5, model: { dimensions: [20.4, null, null] } })).toEqual([true]);
});

test("verify-spec exits 1 naming failed assertions, and merges -p over the spec's params", async () => {
  const dir = tmp();
  const spec = join(dir, "cube.spec.json");
  writeFileSync(
    spec,
    JSON.stringify({ params: { size: 12 }, model: { dimensions: [12, 12, 12] } }),
  );
  const ok = await run(["verify-spec", fx("cube.js"), "--spec", spec]);
  expect(ok.code).toBe(0);
  expect(ok.json).toMatchObject({ ok: true, params: { size: 12 }, passed: 1, failed: 0 });
  const bad = await run(["verify-spec", fx("cube.js"), "--spec", spec, "-p", '{"size":18}']);
  expect(bad.code).toBe(1);
  expect(bad.json).toMatchObject({ ok: false, params: { size: 18 }, failed: 1 });
  expect(bad.stderr).toBe("error: 1 of 1 spec assertions failed: model.dimensions");
}, 30000);

test("verify-spec finds <model>.spec.json beside the model and reports a missing one", async () => {
  const found = await run(["verify-spec", fx("press-fit.js")]);
  expect(found.code).toBe(0);
  expect(found.json.spec).toBe(fx("press-fit.spec.json"));
  const missing = await run(["verify-spec", fx("cube.js")]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toBe("error: no spec file cube.spec.json; record one with --write");
  const force = await run(["verify-spec", fx("press-fit.js"), "--force"]);
  expect(force.code).toBe(2);
}, 30000);

const anchoredPlate = (params = {}) => loadAndRun(fx("anchored-plate.js"), params);
const coaxial = {
  anchors: [{ a: "0:bolt1.axis", b: "1:axis", axisAngle: 0, axisOffset: 0, distance: 0 }],
};

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
  expect(
    verifySpec(moved.geom, moved.geomType, coaxial).results.map((x) => [x.actual, x.pass]),
  ).toEqual([
    [0, true],
    [0.5, false],
    [0.5, false],
  ]);
  const tops = { anchors: [{ a: "0:top", b: "1:top", distance: { min: 7.2, max: 7.3 } }] };
  expect(verifySpec(geom, geomType, tops).results[0]).toMatchObject({
    actual: 7.228416,
    pass: true,
  });
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

test("verify-spec --write records measurements and current overlaps, then passes", async () => {
  const spec = join(tmp(), "draft.spec.json");
  const wrote = await run(["verify-spec", fx("press-fit.js"), "--write", "--spec", spec]);
  expect(wrote.json).toEqual({ ok: true, wrote: spec, assertions: 22, recordedOverlaps: 2 });
  const draft = JSON.parse(readFileSync(spec, "utf8"));
  expect(draft.model).toMatchObject({ dimensions: [20, 20, 14], center: [0, 0, 3] });
  expect(Object.keys(draft.parts)).toEqual(["0", "1", "2", "3", "4", "5"]);
  expect(draft.interference.allow.map((x) => [x.a, x.b, x.maxDepth])).toEqual([
    ["0", "1", 0.098],
    ["0", "3", 1.2],
  ]);
  expect((await run(["verify-spec", fx("press-fit.js"), "--spec", spec])).code).toBe(0);
  const again = await run(["verify-spec", fx("press-fit.js"), "--write", "--spec", spec]);
  expect(again.code).toBe(2);
  expect(again.stderr).toMatch(/draft\.spec\.json exists; add --force to replace it/);
}, 30000);
