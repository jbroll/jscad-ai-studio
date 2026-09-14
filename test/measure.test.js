import { expect, test } from "vitest";
import { jf } from "../lib/jf.js";
import { measureAnchors, measureBetween, measureGeom, measureParts } from "../lib/measure.js";
import { loadAndRun } from "../lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("measures a geom3 cube", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const m = measureGeom(geom, geomType);
  expect(m.dimensions).toEqual([10, 10, 10]);
  expect(m.volume).toBeCloseTo(1000, 3);
  expect(m.polygonCount).toBeGreaterThan(0);
});

test("measures a geom2 plate with area", () => {
  const { geom, geomType } = loadAndRun(fx("plate.js"), {});
  const m = measureGeom(geom, geomType);
  expect(m.area).toBeCloseTo(900, 3);
});

const cube = (x) => jf.cube({ size: 5 }).translate([x, 0, 0]);

test("measureParts measures every item, a single item, and a range together", () => {
  const scene = [cube(0), cube(10), [cube(20), cube(30)]];
  const all = measureParts(scene, "array", "all");
  expect(all.map((p) => p.part)).toEqual(["0", "1", "2"]);
  expect(all[1]).toMatchObject({ center: [10, 0, 0], dimensions: [5, 5, 5] });
  expect(all[1].volume).toBeCloseTo(125, 6);
  expect(all[2]).toMatchObject({ dimensions: [15, 5, 5], entityCount: 2 });
  const [range] = measureParts(scene, "array", ["0-1"]);
  expect(range).toMatchObject({ part: "0-1", dimensions: [15, 5, 5], center: [5, 0, 0] });
});

test("measureParts treats a single geometry as item 0 and rejects an index past the end", () => {
  expect(measureParts(cube(0), "geom3", "all")).toHaveLength(1);
  expect(() => measureParts([cube(0), cube(10)], "array", ["1-2"])).toThrow(
    "part 1-2 is out of range; the model has 2 items (0-1)",
  );
});

test("measureBetween reports per-axis gap, box distance, and center offset", () => {
  const apart = measureBetween([cube(0), cube(10)], "array", ["0", "1"]);
  expect(apart).toEqual({
    a: "0",
    b: "1",
    gap: [5, -5, -5],
    boxesOverlap: false,
    distance: 5,
    centerOffset: [10, 0, 0],
    axes: { a: null, b: null, angle: null, offset: null },
  });
  const overlapping = measureBetween([cube(0), cube(3)], "array", ["1", "0"]);
  expect(overlapping).toMatchObject({ gap: [-2, -5, -5], boxesOverlap: true, distance: 0 });
  expect(overlapping.centerOffset).toEqual([-3, 0, 0]);
});

test("measureBetween reports the symmetry axes of two round parts", () => {
  const pin = jf.cylinder({ radius: 2, height: 10, segments: 32 });
  const bore = jf.cylinder({ outer: 5, inner: 2, height: 4, segments: 32 }).translate([0.5, 0, 3]);
  const r = measureBetween([pin, bore], "array", ["0", "1"]);
  expect(r.axes).toEqual({ a: [0, 0, 1], b: [0, 0, 1], angle: 0, offset: 0.5 });
});

test("measureBetween reads faces that touch within boolean noise as a zero gap", () => {
  const base = jf.cube({ size: 10 }).subtract(jf.cylinder({ radius: 2, height: 20 }));
  const post = jf.cube({ size: 4 }).translate([0, 0, 7 + 1e-13]);
  const r = measureBetween([base, post], "array", ["0", "1"]);
  expect(r.gap[2]).toBe(0);
  expect(r).toMatchObject({ boxesOverlap: false, distance: 0 });
});

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
