import { writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { measureArray, wrapOne } from "./array-geom.js";

const AXES = ["x", "y", "z"];

// Runs inside the viewer as the body of a generated wrapper model, so it must not
// reference anything outside its own parameters.
export const cutGeometry = (result, section, jf) => {
  const i = "xyz".indexOf(section.axis);
  const isSolid = (g) => !!g && typeof g === "object" && "polygons" in g;
  const items = [result]
    .flat(Infinity)
    .map((g) => (isSolid(g) && typeof g.intersect !== "function" ? new jf.FluentGeom3(g) : g));
  const boxes = items.filter(isSolid).map((g) => g.measureBoundingBox());
  if (!boxes.length) throw new Error("a section needs 3D geometry");
  const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k])));
  const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k])));
  const at = section.offset ?? (lo[i] + hi[i]) / 2;
  if (!(at > lo[i] && at < hi[i])) {
    throw new Error(
      `section offset ${at} is outside the model's ${section.axis} range ${lo[i]} to ${hi[i]}`,
    );
  }
  const min = lo.map((v) => v - 1);
  const max = hi.map((v) => v + 1);
  if (section.keep === "+") min[i] = at;
  else max[i] = at;
  const cutter = jf.cuboid({
    size: max.map((v, k) => v - min[k]),
    center: max.map((v, k) => (v + min[k]) / 2),
  });
  return items.flatMap((g) => {
    if (!isSolid(g)) return [g];
    const [glo, ghi] = g.measureBoundingBox();
    if (glo[i] >= min[i] && ghi[i] <= max[i]) return [g];
    if (ghi[i] <= min[i] || glo[i] >= max[i]) return [];
    const cut = g.intersect(cutter);
    return [g.color ? cut.colorize(g.color) : cut];
  });
};

const wrapperSource = (modelFile, section) => `const jf = require("@jbroll/jscad-fluent");
const model = require(${JSON.stringify(`./${modelFile}`)});
const cutGeometry = ${cutGeometry.toString()};
const main = (p) => cutGeometry((model.main ?? model.default)(p), ${JSON.stringify(section)}, jf);
module.exports = { main };
`;

// The wrapper sits beside the model so the viewer server serves it and its
// relative requires resolve. The leading dot keeps the file watcher from
// reloading open viewer tabs.
export const writeSectionWrapper = (modelPath, section) => {
  const path = join(dirname(modelPath), `.jscad-section-${process.pid}-${basename(modelPath)}.js`);
  writeFileSync(path, wrapperSource(basename(modelPath), section));
  return path;
};

// Right-handed in-plane axes (u, v) for a cut normal to each axis.
const PLANE = [
  [1, 2],
  [2, 0],
  [0, 1],
];

const newellNormal = (vertices) => {
  const n = [0, 0, 0];
  for (let j = 0; j < vertices.length; j++) {
    const [x1, y1, z1] = vertices[j];
    const [x2, y2, z2] = vertices[(j + 1) % vertices.length];
    n[0] += (y1 - y2) * (z1 + z2);
    n[1] += (z1 - z2) * (x1 + x2);
    n[2] += (x1 - x2) * (y1 + y2);
  }
  return n;
};

// One segment per convex polygon crossing the plane. A vertex on the plane
// counts as above it, so each crossing polygon yields exactly two points.
const crossing = (vertices, i, at) => {
  const points = [];
  for (let j = 0; j < vertices.length; j++) {
    const p = vertices[j];
    const q = vertices[(j + 1) % vertices.length];
    const sp = p[i] - at;
    const sq = q[i] - at;
    if (sp >= 0 === sq >= 0) continue;
    const t = sp / (sp - sq);
    points.push(p.map((c, k) => (k === i ? at : c + t * (q[k] - c))));
  }
  return points.length === 2 ? points : null;
};

const axisCross = (i, n) => {
  const a = [0, 0, 0];
  a[i] = 1;
  return [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
};

export const sectionOutline = (geom, geomType, { axis, offset }) => {
  const i = AXES.indexOf(axis);
  const [u, v] = PLANE[i];
  const items = (geomType === "array" ? geom.flat(Infinity) : [geom]).map(wrapOne);
  const solids = items.filter((g) => typeof g?.toPolygons === "function");
  if (!solids.length) throw new Error("a section needs 3D geometry");
  const [lo, hi] = measureArray(solids).boundingBox;
  const at = offset ?? (lo[i] + hi[i]) / 2;
  if (!(at >= lo[i] && at <= hi[i])) {
    throw new Error(
      `section offset ${at} is outside the model's ${axis} range ${lo[i]} to ${hi[i]}`,
    );
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let area = 0;
  for (const solid of solids) {
    for (const { vertices } of solid.toPolygons()) {
      const seg = crossing(vertices, i, at);
      if (!seg) continue;
      // Orienting each segment along axis x outward normal walks outer loops
      // counterclockwise and holes clockwise, so the shoelace sum nets out holes.
      const t = axisCross(i, newellNormal(vertices));
      let [p, q] = seg;
      if ((q[u] - p[u]) * t[u] + (q[v] - p[v]) * t[v] < 0) [p, q] = [q, p];
      area += (p[u] * q[v] - q[u] * p[v]) / 2;
      for (const pt of seg) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], pt[k]);
          max[k] = Math.max(max[k], pt[k]);
        }
      }
    }
  }
  if (min[0] === Infinity) {
    return { axis, offset: at, boundingBox: null, dimensions: [0, 0, 0], area: 0 };
  }
  return {
    axis,
    offset: at,
    boundingBox: [min, max],
    dimensions: max.map((m, k) => m - min[k]),
    area,
  };
};
