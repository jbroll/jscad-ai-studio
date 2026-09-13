// Symmetry axis of a solid from its second moments of volume. A solid of revolution or a
// regular prism has two equal principal moments, and its axis is the third direction.

const EQUAL = 0.02;

const round = (n) => Math.round(n * 1e6) / 1e6 + 0;

const moments = (polygonLists) => {
  const ref = polygonLists.find((l) => l.length)?.[0].vertices[0];
  if (!ref) return null;
  let volume = 0;
  const sum = [0, 0, 0];
  const second = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const polygons of polygonLists) {
    for (const { vertices } of polygons) {
      const a = vertices[0].map((c, i) => c - ref[i]);
      for (let k = 1; k + 1 < vertices.length; k++) {
        const b = vertices[k].map((c, i) => c - ref[i]);
        const d = vertices[k + 1].map((c, i) => c - ref[i]);
        const dv =
          (a[0] * (b[1] * d[2] - b[2] * d[1]) -
            a[1] * (b[0] * d[2] - b[2] * d[0]) +
            a[2] * (b[0] * d[1] - b[1] * d[0])) /
          6;
        const s = [a[0] + b[0] + d[0], a[1] + b[1] + d[1], a[2] + b[2] + d[2]];
        volume += dv;
        for (let i = 0; i < 3; i++) {
          sum[i] += (dv * s[i]) / 4;
          for (let j = 0; j < 3; j++) {
            second[3 * i + j] +=
              (dv / 20) * (a[i] * a[j] + b[i] * b[j] + d[i] * d[j] + s[i] * s[j]);
          }
        }
      }
    }
  }
  if (!(volume > 0)) return null;
  const c = sum.map((v) => v / volume);
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => second[3 * i + j] - volume * c[i] * c[j]));
  return { centroid: c.map((v, i) => v + ref[i]), cov };
};

// Jacobi rotations; a 3x3 symmetric matrix converges in a few sweeps.
const eigen = (matrix) => {
  const A = matrix.map((r) => [...r]);
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const rotate = (M, p, q, c, s, rows) => {
    for (let k = 0; k < 3; k++) {
      if (rows) {
        const [mp, mq] = [M[p][k], M[q][k]];
        M[p][k] = c * mp - s * mq;
        M[q][k] = s * mp + c * mq;
      } else {
        const [mp, mq] = [M[k][p], M[k][q]];
        M[k][p] = c * mp - s * mq;
        M[k][q] = s * mp + c * mq;
      }
    }
  };
  const scale = Math.abs(A[0][0]) + Math.abs(A[1][1]) + Math.abs(A[2][2]);
  for (let sweep = 0; sweep < 50; sweep++) {
    if (Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]) <= 1e-15 * scale) break;
    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (A[p][q] === 0) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      rotate(A, p, q, c, t * c, false);
      rotate(A, p, q, c, t * c, true);
      rotate(V, p, q, c, t * c, false);
    }
  }
  return [0, 1, 2].map((i) => ({ value: A[i][i], vector: [V[0][i], V[1][i], V[2][i]] }));
};

const canonical = (v) => {
  const big = v.reduce((m, c, i) => (Math.abs(c) > Math.abs(v[m]) ? i : m), 0);
  return v.map((c) => round(v[big] < 0 ? -c : c));
};

// Returns { centroid, axis }, with axis null when no single direction stands out:
// a cube or sphere has three equal moments, a plain box three distinct ones.
export const symmetryAxis = (polygonLists) => {
  const m = moments(polygonLists);
  if (!m) return { centroid: null, axis: null };
  const [e0, e1, e2] = eigen(m.cov).sort((p, q) => p.value - q.value);
  const close = (p, q) => q.value - p.value <= EQUAL * e2.value;
  let odd = null;
  if (close(e0, e1) && !close(e1, e2)) odd = e2;
  else if (close(e1, e2) && !close(e0, e1)) odd = e0;
  return { centroid: m.centroid, axis: odd && canonical(odd.vector) };
};

const cross = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

// Angle in degrees between two axes (0 to 90) and the shortest distance between the lines.
export const axisRelation = (a, b) => {
  if (!a.axis || !b.axis) return { angle: null, offset: null };
  const cosine = Math.min(1, Math.abs(dot(a.axis, b.axis)));
  const d = b.centroid.map((c, i) => c - a.centroid[i]);
  const n = cross(a.axis, b.axis);
  const sin = Math.hypot(...n);
  const offset = sin < 1e-9 ? Math.hypot(...cross(d, a.axis)) : Math.abs(dot(d, n)) / sin;
  return { angle: round((Math.acos(cosine) * 180) / Math.PI), offset: round(offset) };
};
