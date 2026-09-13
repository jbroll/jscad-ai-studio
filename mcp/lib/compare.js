const round = (n) => Math.round(n * 1e6) / 1e6 + 0;
const vecDelta = (a, b) => b.map((v, k) => round(v - a[k]));
const isZero = (v) => (Array.isArray(v) ? v.every((n) => n === 0) : v === 0);

const SCALARS = ["volume", "area", "polygonCount", "entityCount"];

const scalarDeltas = (a, b) => {
  const out = {};
  for (const key of SCALARS) {
    if (typeof a[key] === "number" && typeof b[key] === "number") out[key] = round(b[key] - a[key]);
  }
  return out;
};

const partDelta = (a, b) => ({
  dimensions: vecDelta(a.dimensions, b.dimensions),
  center: vecDelta(a.center, b.center),
  ...scalarDeltas(a, b),
});

// Parts are matched by selector, so an item inserted mid-array shows every later
// index as changed.
const partDeltas = (aParts, bParts) => {
  const before = new Map(aParts.map((p) => [p.part, p]));
  const after = new Set(bParts.map((p) => p.part));
  const changed = [];
  let unchanged = 0;
  for (const p of bParts) {
    const q = before.get(p.part);
    if (!q) {
      changed.push({ part: p.part, added: true, dimensions: p.dimensions, center: p.center });
      continue;
    }
    const d = partDelta(q, p);
    if (Object.values(d).every(isZero)) unchanged++;
    else changed.push({ part: p.part, ...d });
  }
  for (const q of aParts) if (!after.has(q.part)) changed.push({ part: q.part, removed: true });
  return { parts: changed, unchangedParts: unchanged };
};

// `a` and `b` are `measure` results; `delta` is b minus a.
export const measureDelta = (a, b) => ({
  delta: partDelta(a, b),
  ...(a.parts && b.parts ? partDeltas(a.parts, b.parts) : {}),
});

export const sideSummary = (source, params, { geomType, measure }) => {
  const out = { source, ...(params ? { params } : {}), geomType, dimensions: measure.dimensions };
  for (const key of ["volume", "area", "entityCount"]) {
    if (typeof measure[key] === "number") out[key] = measure[key];
  }
  return out;
};
