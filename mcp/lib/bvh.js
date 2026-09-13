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
  const nodes = [];
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
    nodes.push(node);
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
