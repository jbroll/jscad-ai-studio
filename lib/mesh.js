// Mesh topology for check: open edges, non-manifold edges and vertices, winding.
// See "check" in docs/user-manual.md for what each count means.

const TOL = 1e-5;
const CELL = 4 * TOL;
// Offsets the weld grid so round coordinates do not sit on cell boundaries.
const SHIFT = 0.37 * CELL;

const near = (p, q) =>
  Math.abs(p[0] - q[0]) <= TOL && Math.abs(p[1] - q[1]) <= TOL && Math.abs(p[2] - q[2]) <= TOL;

const neighborOffsets = (frac) => {
  if (frac < 0.25) return [0, -1];
  if (frac > 0.75) return [0, 1];
  return [0];
};

// Boolean results repeat a vertex with rounding noise, so exact keys split one vertex in two.
const makeWelder = () => {
  const grid = new Map();
  const points = [];
  const find = (base, offsets, v) => {
    for (const di of offsets[0])
      for (const dj of offsets[1])
        for (const dk of offsets[2]) {
          const bucket = grid.get(`${base[0] + di},${base[1] + dj},${base[2] + dk}`);
          const hit = bucket?.find((id) => near(points[id], v));
          if (hit !== undefined) return hit;
        }
    return -1;
  };
  const index = (v) => {
    const scaled = [0, 1, 2].map((a) => ((v[a] ?? 0) + SHIFT) / CELL);
    const base = scaled.map(Math.floor);
    const found = find(
      base,
      scaled.map((s, a) => neighborOffsets(s - base[a])),
      v,
    );
    if (found >= 0) return found;
    const id = points.length;
    points.push([v[0], v[1], v[2] ?? 0]);
    const key = base.join(",");
    const bucket = grid.get(key);
    if (bucket) bucket.push(id);
    else grid.set(key, [id]);
    return id;
  };
  return { points, index };
};

const toLoops = (polygons, weld) => {
  const loops = [];
  for (const poly of polygons) {
    const loop = [];
    for (const v of poly.vertices) {
      const id = weld.index(v);
      if (loop[loop.length - 1] !== id) loop.push(id);
    }
    while (loop.length > 1 && loop[0] === loop[loop.length - 1]) loop.pop();
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
};

const edgeKey = (a, b, n) => (a < b ? a * n + b : b * n + a);

const countEdges = (loops, n) => {
  const edges = new Map();
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const key = edgeKey(a, b, n);
      const e = edges.get(key) ?? { count: 0, forward: 0 };
      e.count++;
      if (a < b) e.forward++;
      edges.set(key, e);
    }
  }
  return edges;
};

const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

const firstAtLeast = (sorted, points, x) => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[sorted[mid]][0] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const verticesOnEdge = (key, n, points, candidates) => {
  const lo = Math.floor(key / n);
  const hi = key % n;
  const a = points[lo];
  const d = sub(points[hi], a);
  const len2 = dot(d, d);
  const xMax = Math.max(a[0], points[hi][0]) + TOL;
  const hits = [];
  for (
    let i = firstAtLeast(candidates, points, Math.min(a[0], points[hi][0]) - TOL);
    i < candidates.length && points[candidates[i]][0] <= xMax;
    i++
  ) {
    const id = candidates[i];
    if (id === lo || id === hi) continue;
    const t = dot(sub(points[id], a), d) / len2;
    if (t <= 0 || t >= 1) continue;
    const onLine = [a[0] + t * d[0], a[1] + t * d[1], a[2] + t * d[2]];
    if (near(points[id], onLine)) hits.push({ id, t });
  }
  return hits.sort((p, q) => p.t - q.t).map((h) => h.id);
};

// A T-junction leaves one long edge on one side and two short edges on the other, all used
// once. Inserting the middle vertex into the long edge makes the halves match.
const splitTJunctions = (loops, points) => {
  const n = points.length;
  const open = [...countEdges(loops, n)].filter(([, e]) => e.count === 1).map(([k]) => k);
  if (!open.length) return loops;
  const ends = new Set(open.flatMap((k) => [Math.floor(k / n), k % n]));
  const candidates = [...ends].sort((p, q) => points[p][0] - points[q][0]);
  const inserts = new Map();
  for (const key of open) {
    const ids = verticesOnEdge(key, n, points, candidates);
    if (ids.length) inserts.set(key, ids);
  }
  if (!inserts.size) return loops;
  return loops.map((loop) => {
    const out = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      out.push(a);
      const ids = inserts.get(edgeKey(a, b, n));
      if (ids) out.push(...(a < b ? ids : [...ids].reverse()));
    }
    return out;
  });
};

// A vertex is manifold when the faces around it form one fan: corners joined through
// shared edges. Two solids touching at a point give two fans.
const countNonManifoldVertices = (loops) => {
  const corners = new Map();
  for (const loop of loops) {
    for (let i = 0; i < loop.length; i++) {
      const v = loop[i];
      const pair = [loop[(i - 1 + loop.length) % loop.length], loop[(i + 1) % loop.length]];
      const list = corners.get(v);
      if (list) list.push(pair);
      else corners.set(v, [pair]);
    }
  }
  let count = 0;
  for (const list of corners.values()) {
    if (list.length < 2) continue;
    const parent = list.map((_, i) => i);
    const root = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]];
        i = parent[i];
      }
      return i;
    };
    const byNeighbor = new Map();
    list.forEach((pair, i) => {
      for (const nb of pair) {
        if (byNeighbor.has(nb)) parent[root(i)] = root(byNeighbor.get(nb));
        else byNeighbor.set(nb, i);
      }
    });
    const roots = new Set(list.map((_, i) => root(i)));
    if (roots.size > 1) count++;
  }
  return count;
};

const signedVolume = (loops, points) => {
  let v = 0;
  for (const loop of loops) {
    const p0 = points[loop[0]];
    for (let i = 1; i + 1 < loop.length; i++) {
      const p1 = points[loop[i]];
      const p2 = points[loop[i + 1]];
      v +=
        p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) -
        p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) +
        p0[2] * (p1[0] * p2[1] - p1[1] * p2[0]);
    }
  }
  return v / 6;
};

const weldLoops = (polygons) => {
  const weld = makeWelder();
  return { points: weld.points, loops: splitTJunctions(toLoops(polygons, weld), weld.points) };
};

const MIN_TWICE_AREA = 1e-12;

// Fan triangles of the welded loops, as vertex ids in threes. A fan from a vertex that a
// T-junction split put on a straight edge makes zero-area triangles, which are dropped.
export const weldedTriangles = (polygons) => {
  const { points, loops } = weldLoops(polygons);
  const tris = [];
  for (const loop of loops) {
    const p0 = points[loop[0]];
    for (let i = 1; i + 1 < loop.length; i++) {
      const u = sub(points[loop[i]], p0);
      const v = sub(points[loop[i + 1]], p0);
      const cross = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      if (Math.hypot(...cross) > MIN_TWICE_AREA) tris.push(loop[0], loop[i], loop[i + 1]);
    }
  }
  return { points, tris: Uint32Array.from(tris) };
};

export const analyzeMesh = (polygons) => {
  const { points, loops } = weldLoops(polygons);
  let openEdges = 0;
  let nonManifoldEdges = 0;
  let sameWayEdges = 0;
  for (const e of countEdges(loops, points.length).values()) {
    if (e.count === 1) openEdges++;
    else if (e.count > 2) nonManifoldEdges++;
    else if (e.forward !== 1) sameWayEdges++;
  }
  const nonManifoldVertices = countNonManifoldVertices(loops);
  const inverted = openEdges === 0 && signedVolume(loops, points) < 0;
  return {
    openEdges,
    nonManifoldEdges,
    nonManifoldVertices,
    consistentNormals: sameWayEdges === 0 && !inverted,
  };
};

const key2 = (p) => `${Math.round(p[0] / TOL)},${Math.round(p[1] / TOL)}`;

// Closed when every outline point starts as many sides as it ends.
export const outlinesClosed = (sides) => {
  const balance = new Map();
  for (const [a, b] of sides) {
    balance.set(key2(a), (balance.get(key2(a)) ?? 0) + 1);
    balance.set(key2(b), (balance.get(key2(b)) ?? 0) - 1);
  }
  return [...balance.values()].every((d) => d === 0);
};
