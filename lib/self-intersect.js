// Triangle pairs that cross each other, found through a BVH. Pairs sharing a welded vertex
// are skipped, since neighbors always meet at their shared edge or corner.

import { buildBvh, forEachInBox } from "./bvh.js";

const EPS = 1e-5;
const MAX_SAMPLES = 5;

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const unit = (p) => {
  const len = Math.hypot(...p);
  return len > 0 ? p.map((c) => c / len) : null;
};
const lerp = (p, q, s) => [
  p[0] + (q[0] - p[0]) * s,
  p[1] + (q[1] - p[1]) * s,
  p[2] + (q[2] - p[2]) * s,
];
const mid = (p, q) => lerp(p, q, 0.5);

// Distances of a triangle's corners from a plane, with near-zero snapped to 0.
const distances = (tri, n, origin) =>
  tri.map((p) => {
    const d = dot(sub(p, origin), n);
    return Math.abs(d) <= EPS ? 0 : d;
  });

const straddles = (d) => d.some((x) => x > 0) && d.some((x) => x < 0);

// The part of a triangle lying on the other triangle's plane, as its end points along dir.
const crossingSpan = (tri, d, dir) => {
  const pts = [];
  for (let k = 0; k < 3; k++) {
    const j = (k + 1) % 3;
    if (d[k] === 0) pts.push(tri[k]);
    if (d[k] * d[j] < 0) pts.push(lerp(tri[k], tri[j], d[k] / (d[k] - d[j])));
  }
  const ts = pts.map((p) => dot(p, dir));
  const lo = ts.indexOf(Math.min(...ts));
  const hi = ts.indexOf(Math.max(...ts));
  return { t0: ts[lo], t1: ts[hi], p0: pts[lo], p1: pts[hi] };
};

const DROP_AXES = [
  [1, 2],
  [0, 2],
  [0, 1],
];

// Signed distance of p from the 2D line through a and b.
const side = (p, a, b, [x, y]) => {
  const len = Math.hypot(b[x] - a[x], b[y] - a[y]);
  return ((b[x] - a[x]) * (p[y] - a[y]) - (b[y] - a[y]) * (p[x] - a[x])) / len;
};

const strictlyInside = (p, tri, axes) => {
  const s = tri.map((a, k) => side(p, a, tri[(k + 1) % 3], axes));
  return s.every((v) => v > EPS) || s.every((v) => v < -EPS);
};

const opposite = (u, v) => (u > EPS && v < -EPS) || (u < -EPS && v > EPS);

// Coplanar triangles facing the same way overlap when their edges cross or a corner of one
// lies inside the other. Opposite-facing ones are two faces touching, which is not counted.
const coplanarOverlap = (a, b, n) => {
  const big = n.map(Math.abs);
  const axes = DROP_AXES[big.indexOf(Math.max(...big))];
  for (let i = 0; i < 3; i++) {
    const [p, q] = [a[i], a[(i + 1) % 3]];
    for (let j = 0; j < 3; j++) {
      const [r, s] = [b[j], b[(j + 1) % 3]];
      const sr = side(r, p, q, axes);
      const ss = side(s, p, q, axes);
      if (opposite(sr, ss) && opposite(side(p, r, s, axes), side(q, r, s, axes))) {
        return lerp(r, s, sr / (sr - ss));
      }
    }
  }
  return (
    a.find((p) => strictlyInside(p, b, axes)) ?? b.find((p) => strictlyInside(p, a, axes)) ?? null
  );
};

// A point where the triangles cross, or null when they are apart or only touch.
const trianglesCross = (a, b) => {
  const na = unit(cross(sub(a[1], a[0]), sub(a[2], a[0])));
  const nb = unit(cross(sub(b[1], b[0]), sub(b[2], b[0])));
  if (!na || !nb) return null;
  const db = distances(b, na, a[0]);
  const da = distances(a, nb, b[0]);
  if (db.every((x) => x === 0) || da.every((x) => x === 0)) {
    return dot(na, nb) > 0 ? coplanarOverlap(a, b, na) : null;
  }
  if (!straddles(db) || !straddles(da)) return null;
  const dir = unit(cross(na, nb));
  if (!dir) return null;
  const sa = crossingSpan(a, da, dir);
  const sb = crossingSpan(b, db, dir);
  const start = sa.t0 > sb.t0 ? sa.p0 : sb.p0;
  const end = sa.t1 < sb.t1 ? sa.p1 : sb.p1;
  if (Math.min(sa.t1, sb.t1) - Math.max(sa.t0, sb.t0) <= EPS) return null;
  return mid(start, end);
};

const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

export const findSelfIntersections = ({ points, tris }) => {
  const bvh = buildBvh(points, tris);
  const corners = (t) => [points[tris[t * 3]], points[tris[t * 3 + 1]], points[tris[t * 3 + 2]]];
  const shares = (s, t) => {
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) if (tris[s * 3 + i] === tris[t * 3 + j]) return true;
    return false;
  };
  let count = 0;
  const samples = [];
  const n = tris.length / 3;
  for (let s = 0; s < n; s++) {
    const a = corners(s);
    const lo = [0, 1, 2].map((k) => bvh.lo[s * 3 + k] - EPS);
    const hi = [0, 1, 2].map((k) => bvh.hi[s * 3 + k] + EPS);
    forEachInBox(bvh, lo, hi, (t) => {
      if (t <= s || shares(s, t)) return;
      const at = trianglesCross(a, corners(t));
      if (!at) return;
      count++;
      if (samples.length < MAX_SAMPLES) samples.push(at.map(round3));
    });
  }
  return { selfIntersecting: count > 0, intersectingPairs: count, intersectionSamples: samples };
};
