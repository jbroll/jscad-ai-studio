// Bounding volume hierarchy over mesh triangles, for pair queries and ray casts.

const LEAF_SIZE = 4;

const triangleBounds = (points, tris) => {
  const n = tris.length / 3;
  const lo = new Float64Array(n * 3).fill(Infinity);
  const hi = new Float64Array(n * 3).fill(-Infinity);
  const center = new Float64Array(n * 3);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const p = points[tris[t * 3 + k]];
      for (let a = 0; a < 3; a++) {
        lo[t * 3 + a] = Math.min(lo[t * 3 + a], p[a]);
        hi[t * 3 + a] = Math.max(hi[t * 3 + a], p[a]);
      }
    }
    for (let a = 0; a < 3; a++) center[t * 3 + a] = (lo[t * 3 + a] + hi[t * 3 + a]) / 2;
  }
  return { n, lo, hi, center };
};

export const buildBvh = (points, tris) => {
  const { n, lo, hi, center } = triangleBounds(points, tris);
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  const build = (start, end) => {
    const node = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    const cLo = [Infinity, Infinity, Infinity];
    const cHi = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) {
      const t = order[i];
      for (let a = 0; a < 3; a++) {
        node.lo[a] = Math.min(node.lo[a], lo[t * 3 + a]);
        node.hi[a] = Math.max(node.hi[a], hi[t * 3 + a]);
        cLo[a] = Math.min(cLo[a], center[t * 3 + a]);
        cHi[a] = Math.max(cHi[a], center[t * 3 + a]);
      }
    }
    const spread = [0, 1, 2].map((a) => cHi[a] - cLo[a]);
    const axis = spread.indexOf(Math.max(...spread));
    if (end - start <= LEAF_SIZE || spread[axis] === 0) {
      node.start = start;
      node.end = end;
      return node;
    }
    const sorted = Array.from(order.subarray(start, end)).sort(
      (p, q) => center[p * 3 + axis] - center[q * 3 + axis],
    );
    order.set(sorted, start);
    const mid = (start + end) >> 1;
    node.left = build(start, mid);
    node.right = build(mid, end);
    return node;
  };
  const root = n ? build(0, n) : null;
  return { points, tris, order, root, lo, hi };
};

const boxesTouch = (aLo, aHi, bLo, bHi) =>
  aLo[0] <= bHi[0] &&
  bLo[0] <= aHi[0] &&
  aLo[1] <= bHi[1] &&
  bLo[1] <= aHi[1] &&
  aLo[2] <= bHi[2] &&
  bLo[2] <= aHi[2];

// Calls visit(t) for each triangle whose box touches the box qLo..qHi.
export const forEachInBox = (bvh, qLo, qHi, visit) => {
  const stack = bvh.root ? [bvh.root] : [];
  while (stack.length) {
    const node = stack.pop();
    if (!boxesTouch(node.lo, node.hi, qLo, qHi)) continue;
    if (node.left) {
      stack.push(node.left, node.right);
      continue;
    }
    for (let i = node.start; i < node.end; i++) visit(bvh.order[i]);
  }
};

// Entry distance of the ray into a node's box, or Infinity when it misses.
const slab = (node, o, inv, tMax) => {
  let t0 = 0;
  let t1 = tMax;
  for (let a = 0; a < 3; a++) {
    let near = (node.lo[a] - o[a]) * inv[a];
    let far = (node.hi[a] - o[a]) * inv[a];
    if (near > far) [near, far] = [far, near];
    // A ray parallel to a slab from inside it gives NaN from 0 * Infinity.
    if (Number.isNaN(near) || Number.isNaN(far)) {
      if (o[a] < node.lo[a] || o[a] > node.hi[a]) return Infinity;
      continue;
    }
    t0 = Math.max(t0, near);
    t1 = Math.min(t1, far);
    if (t0 > t1) return Infinity;
  }
  return t0;
};

const BARY_SLACK = 1e-9;

// Möller-Trumbore: ray parameter where it crosses triangle t, or Infinity.
const rayTriangle = ({ points, tris }, t, o, d) => {
  const v0 = points[tris[t * 3]];
  const v1 = points[tris[t * 3 + 1]];
  const v2 = points[tris[t * 3 + 2]];
  const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-14) return Infinity;
  const s = [o[0] - v0[0], o[1] - v0[1], o[2] - v0[2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
  if (u < -BARY_SLACK || u > 1 + BARY_SLACK) return Infinity;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) / det;
  if (v < -BARY_SLACK || u + v > 1 + BARY_SLACK) return Infinity;
  return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det;
};

const MIN_HIT = 1e-6;

// Nearest triangle the ray o + s*d crosses with s > 0, skipping triangles `ignore` accepts.
export const castRay = (bvh, o, d, ignore = () => false) => {
  const inv = d.map((c) => 1 / c);
  let best = { t: Infinity, tri: -1 };
  const stack = bvh.root ? [bvh.root] : [];
  while (stack.length) {
    const node = stack.pop();
    if (slab(node, o, inv, best.t) === Infinity) continue;
    if (node.left) {
      stack.push(node.left, node.right);
      continue;
    }
    for (let i = node.start; i < node.end; i++) {
      const tri = bvh.order[i];
      if (ignore(tri)) continue;
      const t = rayTriangle(bvh, tri, o, d);
      if (t > MIN_HIT && t < best.t) best = { t, tri };
    }
  }
  return best;
};
