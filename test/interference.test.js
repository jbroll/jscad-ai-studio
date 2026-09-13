import { expect, test } from "vitest";
import { axisRelation, symmetryAxis } from "../lib/axis.js";
import { findInterference } from "../lib/interference.js";
import { jf } from "../lib/jf.js";
import { loadAndRun } from "../lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const pressFit = () => loadAndRun(fx("press-fit.js"), {});

test("reports overlap volume, depth, and box for intersecting items only", () => {
  const { geom, geomType } = pressFit();
  const r = findInterference(geom, geomType);
  expect(r).toMatchObject({ tolerance: 0.01, itemCount: 6, pairsChecked: 3, allowed: [] });
  const [pin, sunk] = r.interferences;
  expect(pin).toMatchObject({ a: "0", b: "1", dimensions: [8.2, 8.2, 5] });
  expect(pin.depth).toBeCloseTo(0.1, 1);
  expect(sunk).toEqual({
    a: "0",
    b: "3",
    volume: 48,
    depth: 1.2,
    boundingBox: [
      [-10, -10, 2],
      [-6, -6, 5],
    ],
    dimensions: [4, 4, 3],
  });
  expect(r.interferences).toHaveLength(2);
});

test("a tolerance above the depth drops the press fit", () => {
  const { geom, geomType } = pressFit();
  const r = findInterference(geom, geomType, { tolerance: 0.5 });
  expect(r.interferences.map((p) => [p.a, p.b])).toEqual([["0", "3"]]);
});

test("allowed pairs match in either order and fail again past maxDepth", () => {
  const { geom, geomType } = pressFit();
  const r = findInterference(geom, geomType, { allow: [{ a: "0-3", b: "0", maxDepth: 0.5 }] });
  expect(r.allowed).toMatchObject([{ a: "0", b: "1", allow: "0-3,0" }]);
  expect(r.interferences).toMatchObject([{ a: "0", b: "3", allow: "0-3,0", maxDepth: 0.5 }]);
  expect(() => findInterference(geom, geomType, { allow: [{ a: "0", b: "9" }] })).toThrow(
    "part 9 is out of range; the model has 6 items (0-5)",
  );
});

test("nested items are one group, and 2D items are skipped", () => {
  const cube = (x) => jf.cube({ size: 2 }).translate([x, 0, 0]);
  const r = findInterference(
    [[cube(0), cube(10)], jf.rectangle({ size: [4, 4] }), [cube(1), cube(11)]],
    "array",
  );
  expect(r.notSolid).toEqual(["1"]);
  expect(r.interferences).toMatchObject([{ a: "0", b: "2", volume: 8, dimensions: [11, 2, 2] }]);
  expect(findInterference(cube(0), "geom3")).toMatchObject({ itemCount: 1, pairsChecked: 0 });
});

const polygons = (...solids) => solids.map((s) => s.toPolygons());
const rod = jf.cylinder({ radius: 2, height: 10, segments: 32 });

test("symmetryAxis finds a round part's axis and none for a cube or a plain box", () => {
  const along = symmetryAxis(polygons(rod.rotateY(Math.PI / 2).translate([5, 1, 2])));
  expect(along.axis).toEqual([1, 0, 0]);
  expect(along.centroid.map((c) => Math.round(c * 1e9) / 1e9)).toEqual([5, 1, 2]);
  const tube = jf.cylinder({ outer: 6, inner: 4, height: 3, segments: 32 });
  expect(symmetryAxis(polygons(tube, rod)).axis).toEqual([0, 0, 1]);
  expect(symmetryAxis(polygons(jf.cube({ size: 3 }))).axis).toBeNull();
  expect(symmetryAxis(polygons(jf.cuboid({ size: [2, 3, 4] }))).axis).toBeNull();
});

test("axisRelation gives the angle and the distance between axis lines", () => {
  const x = symmetryAxis(polygons(rod.rotateY(Math.PI / 2)));
  const shifted = symmetryAxis(polygons(rod.rotateY(Math.PI / 2).translate([7, 3, 4])));
  expect(axisRelation(x, shifted)).toEqual({ angle: 0, offset: 5 });
  const skew = symmetryAxis(polygons(rod.translate([0, 5, 0])));
  expect(axisRelation(x, skew)).toEqual({ angle: 90, offset: 5 });
  const none = symmetryAxis(polygons(jf.cube()));
  expect(axisRelation(x, none)).toEqual({ angle: null, offset: null });
});
