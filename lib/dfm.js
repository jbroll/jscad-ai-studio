// Design-for-printing checks: wall thickness by inward ray casts, and overhanging faces.
// See "dfm" in docs/user-manual.md.

import { buildBvh, castRay } from "./bvh.js";
import { weldedTriangles } from "./mesh.js";

const DFM_DEFAULTS = { wall: 0.8, overhang: 45, up: "+z" };
export const UP_AXES = {
  "+x": [1, 0, 0],
  "-x": [-1, 0, 0],
  "+y": [0, 1, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
  "-z": [0, 0, -1],
};

// Large faces get several ray samples so one centroid does not stand for a whole face.
const SAMPLE_SPACING = 2;
const MAX_SPLIT = 8;
const PLATE_TOLERANCE = 0.01;
// Keeps a wall or face modeled exactly at the limit from failing on float noise.
const ANGLE_SLACK = 1e-6;
const LENGTH_SLACK = 1e-6;
const MAX_REGIONS = 5;

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const round = (n) => Math.round(n * 1e6) / 1e6 + 0;
const round3 = (n) => Math.round(n * 1000) / 1000 + 0;

const faces = ({ points, tris }) => {
  const out = [];
  for (let t = 0; t < tris.length / 3; t++) {
    const c = [points[tris[t * 3]], points[tris[t * 3 + 1]], points[tris[t * 3 + 2]]];
    const n = cross(sub(c[1], c[0]), sub(c[2], c[0]));
    const len = Math.hypot(...n);
    out.push({
      corners: c,
      ids: [tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]],
      area: len / 2,
      normal: n.map((x) => x / len),
    });
  }
  return out;
};

// Groups flagged faces that share a vertex, so one thin wall or ledge is one region.
const regionsOf = (flagged, faceList) => {
  const parent = new Map(flagged.map((f) => [f, f]));
  const root = (f) => {
    while (parent.get(f) !== f) f = parent.get(f);
    return f;
  };
  const byVertex = new Map();
  for (const f of flagged) {
    for (const id of faceList[f].ids) {
      if (byVertex.has(id)) parent.set(root(f), root(byVertex.get(id)));
      else byVertex.set(id, f);
    }
  }
  const groups = new Map();
  for (const f of flagged) groups.set(root(f), [...(groups.get(root(f)) ?? []), f]);
  return [...groups.values()];
};

const boxOf = (fs, faceList) => {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const f of fs)
    for (const p of faceList[f].corners)
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], p[a]);
        hi[a] = Math.max(hi[a], p[a]);
      }
  return [lo.map(round), hi.map(round)];
};

const samplePoints = ([a, b, c]) => {
  const longest = Math.max(
    Math.hypot(...sub(b, a)),
    Math.hypot(...sub(c, b)),
    Math.hypot(...sub(a, c)),
  );
  const k = Math.min(MAX_SPLIT, Math.max(1, Math.ceil(longest / SAMPLE_SPACING)));
  const at = (u, v) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * u + (c[i] - a[i]) * v);
  const pts = [];
  for (let i = 0; i < k; i++)
    for (let j = 0; i + j < k; j++) {
      pts.push(at((i + 1 / 3) / k, (j + 1 / 3) / k));
      if (i + j < k - 1) pts.push(at((i + 2 / 3) / k, (j + 2 / 3) / k));
    }
  return { pts, share: 1 / (k * k) };
};

const wallThickness = (mesh, faceList, threshold) => {
  const bvh = buildBvh(mesh.points, mesh.tris);
  let min = null;
  let minAt = null;
  let thinArea = 0;
  const thinByFace = new Map();
  faceList.forEach((face, f) => {
    const inward = face.normal.map((x) => -x);
    const { pts, share } = samplePoints(face.corners);
    // A neighbor meeting this face at a sharp edge is hit just past the edge, which measures
    // the edge angle rather than a wall.
    const neighbor = (t) => faceList[t].ids.some((id) => face.ids.includes(id));
    for (const p of pts) {
      const hit = castRay(bvh, p, inward, neighbor);
      // The far side of a wall faces along the ray; any other hit is a nested or inverted shell.
      if (hit.tri < 0 || dot(faceList[hit.tri].normal, inward) <= 0) continue;
      if (min === null || hit.t < min) {
        min = hit.t;
        minAt = p;
      }
      if (hit.t < threshold - LENGTH_SLACK) {
        thinArea += face.area * share;
        thinByFace.set(f, Math.min(thinByFace.get(f) ?? Infinity, hit.t));
      }
    }
  });
  const regions = regionsOf([...thinByFace.keys()], faceList)
    .map((fs) => ({
      minWall: round(Math.min(...fs.map((f) => thinByFace.get(f)))),
      area: round(fs.reduce((s, f) => s + faceList[f].area, 0)),
      boundingBox: boxOf(fs, faceList),
    }))
    .sort((p, q) => p.minWall - q.minWall);
  return {
    minWall: min === null ? null : round(min),
    minWallAt: minAt ? minAt.map(round3) : null,
    thinArea: round(thinArea),
    thinRegions: regions.slice(0, MAX_REGIONS),
  };
};

const overhangs = (faceList, limit, up) => {
  const heights = faceList.flatMap((face) => face.corners.map((p) => dot(p, up)));
  const plate = Math.min(...heights) + PLATE_TOLERANCE;
  let maxAngle = 0;
  const angleOf = new Map();
  faceList.forEach((face, f) => {
    const down = -dot(face.normal, up);
    if (down <= 0 || face.corners.every((p) => dot(p, up) <= plate)) return;
    const angle = (Math.asin(Math.min(1, down)) * 180) / Math.PI;
    maxAngle = Math.max(maxAngle, angle);
    if (angle > limit + ANGLE_SLACK) angleOf.set(f, angle);
  });
  const flagged = [...angleOf.keys()];
  const regions = regionsOf(flagged, faceList)
    .map((fs) => ({
      area: round(fs.reduce((s, f) => s + faceList[f].area, 0)),
      maxAngle: round(Math.max(...fs.map((f) => angleOf.get(f)))),
      boundingBox: boxOf(fs, faceList),
    }))
    .sort((p, q) => q.area - p.area);
  return {
    overhangArea: round(flagged.reduce((s, f) => s + faceList[f].area, 0)),
    maxOverhangAngle: round(maxAngle),
    overhangRegions: regions.slice(0, MAX_REGIONS),
  };
};

const isSolid = (g) => !!g && typeof g === "object" && "polygons" in g;
const solidPolygons = (item) =>
  [item]
    .flat(Infinity)
    .filter(isSolid)
    .flatMap((g) => (typeof g.toPolygons === "function" ? g.toPolygons() : g.polygons));

const analyzeItem = (polygons, { wall, overhang, up }) => {
  const mesh = weldedTriangles(polygons);
  const faceList = faces(mesh);
  if (!faceList.length) return null;
  return { ...wallThickness(mesh, faceList, wall), ...overhangs(faceList, overhang, UP_AXES[up]) };
};

export const analyzeDfm = (geom, geomType, opts = {}) => {
  const settings = { ...DFM_DEFAULTS, ...opts };
  const head = { up: settings.up, wallThreshold: settings.wall, overhangLimit: settings.overhang };
  if (geomType !== "array") {
    const r = analyzeItem(solidPolygons(geom), settings);
    return { ...head, empty: !r, ...r };
  }
  const items = geom
    .map((item, index) => ({ index, r: analyzeItem(solidPolygons(item), settings) }))
    .filter(({ r }) => r)
    .map(({ index, r }) => ({ index, ...r }));
  const walls = items.filter((it) => it.minWall !== null);
  const thinnest = walls.reduce(
    (best, it) => (!best || it.minWall < best.minWall ? it : best),
    null,
  );
  return {
    ...head,
    empty: items.length === 0,
    minWall: thinnest ? thinnest.minWall : null,
    minWallAt: thinnest ? thinnest.minWallAt : null,
    thinArea: round(items.reduce((s, it) => s + it.thinArea, 0)),
    overhangArea: round(items.reduce((s, it) => s + it.overhangArea, 0)),
    maxOverhangAngle: round(Math.max(0, ...items.map((it) => it.maxOverhangAngle))),
    items,
  };
};
