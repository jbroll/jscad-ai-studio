import { createRequire } from "node:module";
import { checkGeom } from "./check.js";
import { FluentGeom2, FluentGeom3 } from "./jf.js";

const require = createRequire(import.meta.url);
const stl = require("@jscad/stl-serializer");
const threemf = require("@jscad/3mf-serializer");
const obj = require("@jscad/obj-serializer");

const wrapOne = (g) => {
  if (g && typeof g.measureBoundingBox === "function") return g;
  if (g && typeof g === "object" && "polygons" in g) return new FluentGeom3(g);
  if (g && typeof g === "object" && "sides" in g) return new FluentGeom2(g);
  return g;
};

export const normalizeItems = (arr) => arr.map(wrapOne);

const combinedBox = (items) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const it of items) {
    const bb = it.measureBoundingBox();
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], bb[0][i]);
      hi[i] = Math.max(hi[i], bb[1][i]);
    }
  }
  return [lo, hi];
};

export const measureArray = (arr) => {
  const items = normalizeItems(arr);
  if (items.length === 0) {
    return {
      boundingBox: [
        [0, 0, 0],
        [0, 0, 0],
      ],
      dimensions: [0, 0, 0],
      center: [0, 0, 0],
      volume: 0,
      polygonCount: 0,
      entityCount: 0,
    };
  }
  const [lo, hi] = combinedBox(items);
  let volume = 0;
  let polygonCount = 0;
  for (const it of items) {
    if (typeof it.measureVolume === "function") volume += it.measureVolume();
    if (typeof it.toPolygons === "function") polygonCount += it.toPolygons().length;
  }
  return {
    boundingBox: [lo, hi],
    dimensions: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]],
    center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2],
    volume,
    polygonCount,
    entityCount: items.length,
  };
};

export const exportArray = (arr, format) => {
  const items = normalizeItems(arr);
  if (format === "stl") {
    const parts = stl.serialize({ binary: true }, ...items);
    const data = Buffer.concat(parts.map((ab) => Buffer.from(ab)));
    return { data, bytes: data.length, triangleCount: (data.length - 84) / 50, mime: "model/stl" };
  }
  if (format === "3mf") {
    const [ab] = threemf.serialize({ compress: true, unit: "millimeter" }, ...items);
    const data = Buffer.from(ab);
    const tris = items.reduce(
      (n, it) =>
        n + (it.toPolygons ? it.toPolygons().reduce((m, p) => m + p.vertices.length - 2, 0) : 0),
      0,
    );
    return { data, bytes: data.length, triangleCount: tris, mime: threemf.mimeType };
  }
  if (format === "obj") {
    const [text] = obj.serialize({ triangulate: true }, ...items);
    const data = Buffer.from(text, "utf8");
    const tris = items.reduce(
      (n, it) =>
        n + (it.toPolygons ? it.toPolygons().reduce((m, p) => m + p.vertices.length - 2, 0) : 0),
      0,
    );
    return { data, bytes: data.length, triangleCount: tris, mime: obj.mimeType };
  }
  throw new Error(`format ${format} not supported for arrays`);
};

export const checkArray = (arr, bed) => {
  const items = normalizeItems(arr);
  const dims = measureArray(arr);
  if (items.length === 0) {
    return {
      empty: true,
      manifold: false,
      watertight: false,
      openEdges: 0,
      fitsBed: true,
      bbox: dims.boundingBox,
      dimensions: dims.dimensions,
      entityCount: 0,
    };
  }
  let openEdges = 0;
  let watertight = true;
  for (const it of items) {
    const c = checkGeom(it, "geom3", undefined);
    openEdges += c.openEdges ?? 0;
    if (!c.watertight) watertight = false;
  }
  const fitsBed = bed ? dims.dimensions.every((d, i) => d <= bed[i]) : true;
  return {
    empty: false,
    manifold: watertight,
    watertight,
    openEdges,
    fitsBed,
    bbox: dims.boundingBox,
    dimensions: dims.dimensions,
    entityCount: items.length,
  };
};
