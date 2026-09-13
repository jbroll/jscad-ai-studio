import { measureArray, wrapOne } from "./array-geom.js";
import { analyzeMesh, outlinesClosed, weldedTriangles } from "./mesh.js";
import { findSelfIntersections } from "./self-intersect.js";

const SOLID_NOTE = "wall thickness and overhangs: run jscad-work dfm";
const OUTLINE_NOTE = "watertight and manifold apply to 3D solids; closed covers 2D outlines";

const fitsBed = (dimensions, bed) =>
  !bed || !dimensions ? true : dimensions.every((d, i) => d <= bed[i]);

const classify = (g) => {
  if (g && typeof g === "object" && "polygons" in g) return "geom3";
  if (g && typeof g === "object" && "sides" in g) return "geom2";
  return "unknown";
};

const extent = (geom, bed) => {
  const dimensions = geom.measureDimensions();
  return { fitsBed: fitsBed(dimensions, bed), bbox: geom.measureBoundingBox(), dimensions };
};

const checkSolid = (geom, bed) => {
  const polygons = geom.toPolygons();
  if (polygons.length === 0) {
    return {
      empty: true,
      watertight: null,
      manifold: null,
      openEdges: 0,
      nonManifoldEdges: 0,
      nonManifoldVertices: 0,
      consistentNormals: null,
      selfIntersecting: null,
      ...extent(geom, bed),
      notes: [SOLID_NOTE],
    };
  }
  const mesh = analyzeMesh(polygons);
  return {
    empty: false,
    watertight: mesh.openEdges === 0,
    manifold: mesh.nonManifoldEdges === 0 && mesh.nonManifoldVertices === 0,
    ...mesh,
    ...findSelfIntersections(weldedTriangles(polygons)),
    ...extent(geom, bed),
    notes: [SOLID_NOTE],
  };
};

const checkOutline = (geom, bed) => {
  const sides = geom.sides ?? [];
  const closed = outlinesClosed(sides);
  return {
    empty: sides.length === 0,
    closed,
    outlines: closed ? geom.toOutlines().length : null,
    watertight: null,
    manifold: null,
    ...extent(geom, bed),
    notes: [OUTLINE_NOTE],
  };
};

const allOf = (values) => {
  const known = values.filter((v) => v !== null && v !== undefined);
  return known.length ? known.every(Boolean) : null;
};

const anyOf = (values) => {
  const known = values.filter((v) => v !== null && v !== undefined);
  return known.length ? known.some(Boolean) : null;
};

const checkArray = (arr, bed) => {
  const items = arr.map((item, index) => {
    const geomType = classify(item);
    if (geomType === "unknown") {
      return { index, geomType, empty: true, notes: ["not a geom2 or geom3"] };
    }
    return { index, geomType, ...checkGeom(wrapOne(item), geomType, bed) };
  });
  const measurable = arr.filter((_, i) => items[i].geomType !== "unknown");
  const { boundingBox, dimensions } = measureArray(measurable);
  const notes = [...new Set(items.flatMap((it) => it.notes))];
  return {
    empty: items.every((it) => it.empty),
    watertight: allOf(items.map((it) => it.watertight)),
    manifold: allOf(items.map((it) => it.manifold)),
    selfIntersecting: anyOf(items.map((it) => it.selfIntersecting)),
    openEdges: items.reduce((n, it) => n + (it.openEdges ?? 0), 0),
    fitsBed: fitsBed(dimensions, bed),
    bbox: boundingBox,
    dimensions,
    entityCount: items.length,
    items: items.map(({ notes: _, ...it }) => it),
    notes,
  };
};

export const checkGeom = (geom, geomType, bed) => {
  if (geomType === "array") return checkArray(geom, bed);
  if (geomType === "geom3") return checkSolid(geom, bed);
  if (geomType === "geom2") return checkOutline(geom, bed);
  return { empty: true, watertight: null, manifold: null, notes: ["not a geom2 or geom3"] };
};
