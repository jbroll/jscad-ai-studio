import { expect, test } from "vitest";
import { checkGeom } from "../mcp/lib/check.js";
import { jf } from "../mcp/lib/jf.js";
import { loadAndRun } from "../mcp/lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const checkFixture = (name, bed) => {
  const { geom, geomType } = loadAndRun(fx(name), {});
  return checkGeom(geom, geomType, bed);
};

const cubePoints = ([x, y, z]) =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [x + (i & 1), y + ((i >> 1) & 1), z + ((i >> 2) & 1)]);
const cubeFaces = (offset) =>
  [
    [0, 2, 3, 1],
    [4, 5, 7, 6],
    [0, 1, 5, 4],
    [2, 6, 7, 3],
    [0, 4, 6, 2],
    [1, 3, 7, 5],
  ].map((f) => f.map((i) => i + offset));
const twoCubes = (second) =>
  jf.polyhedron({
    points: [...cubePoints([0, 0, 0]), ...cubePoints(second)],
    faces: [...cubeFaces(0), ...cubeFaces(8)],
  });
const fromPolygons = (polygons) => {
  let next = 0;
  return jf.polyhedron({
    points: polygons.flatMap((p) => p.vertices),
    faces: polygons.map((p) => p.vertices.map(() => next++)),
  });
};

test("a solid cube is watertight and manifold", () => {
  const c = checkFixture("cube.js", [200, 200, 200]);
  expect(c).toMatchObject({
    empty: false,
    watertight: true,
    manifold: true,
    openEdges: 0,
    nonManifoldEdges: 0,
    nonManifoldVertices: 0,
    consistentNormals: true,
    selfIntersecting: null,
    fitsBed: true,
  });
});

test("flags a model larger than the bed", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), { size: 20 });
  expect(checkGeom(geom, geomType, [10, 10, 10]).fitsBed).toBe(false);
});

test.each([
  "plate-hole.js",
  "overlap-cubes.js",
])("boolean result %s has no open edges from T-junctions", (name) => {
  expect(checkFixture(name)).toMatchObject({ watertight: true, manifold: true, openEdges: 0 });
});

test("flags an open mesh", () => {
  expect(checkFixture("open.js")).toMatchObject({ watertight: false, openEdges: 3 });
});

test("a boolean result with one polygon removed is still open", () => {
  const polygons = loadAndRun(fx("plate-hole.js"), {}).geom.toPolygons();
  const c = checkGeom(fromPolygons(polygons.slice(1)), "geom3");
  expect(c.watertight).toBe(false);
  expect(c.openEdges).toBeGreaterThan(0);
});

test("solids sharing only an edge have a non-manifold edge", () => {
  expect(checkGeom(twoCubes([1, 1, 0]), "geom3")).toMatchObject({
    watertight: true,
    manifold: false,
    nonManifoldEdges: 1,
  });
});

test("solids sharing only a vertex have a non-manifold vertex", () => {
  expect(checkGeom(twoCubes([1, 1, 1]), "geom3")).toMatchObject({
    watertight: true,
    manifold: false,
    nonManifoldEdges: 0,
    nonManifoldVertices: 1,
  });
});

test("inside-out and mixed winding give consistentNormals false", () => {
  const reversed = cubeFaces(0).map((f) => [...f].reverse());
  const inverted = jf.polyhedron({ points: cubePoints([0, 0, 0]), faces: reversed });
  expect(checkGeom(inverted, "geom3").consistentNormals).toBe(false);
  const mixed = jf.polyhedron({
    points: cubePoints([0, 0, 0]),
    faces: [reversed[0], ...cubeFaces(0).slice(1)],
  });
  expect(checkGeom(mixed, "geom3")).toMatchObject({ watertight: true, consistentNormals: false });
});

test("geom2 reports closed outlines and marks solid checks not applicable", () => {
  const c = checkFixture("plate.js", [10, 10, 10]);
  expect(c).toMatchObject({
    empty: false,
    closed: true,
    outlines: 1,
    watertight: null,
    manifold: null,
    fitsBed: false,
  });
  expect(c.openEdges).toBeUndefined();
});

test("an array reports each item and aggregates only known values", () => {
  const c = checkGeom(
    [
      jf.cube({ size: 5 }),
      jf.rectangle({ size: [4, 4] }),
      fromPolygons(jf.cube().toPolygons().slice(1)),
    ],
    "array",
  );
  expect(c.entityCount).toBe(3);
  expect(c.items.map((it) => [it.index, it.geomType, it.watertight])).toEqual([
    [0, "geom3", true],
    [1, "geom2", null],
    [2, "geom3", false],
  ]);
  expect(c.items[1].closed).toBe(true);
  expect(c).toMatchObject({ empty: false, watertight: false, manifold: true, openEdges: 4 });
  expect(checkFixture("array.js")).toMatchObject({ watertight: true, manifold: true });
  expect(checkGeom([], "array")).toMatchObject({ empty: true, watertight: null, items: [] });
});
