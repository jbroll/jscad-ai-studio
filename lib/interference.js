import { wrapOne } from "./array-geom.js";
import { selectorRange } from "./measure.js";

const DEFAULT_TOLERANCE = 0.01;

const isSolid = (g) => !!g && typeof g === "object" && "polygons" in g;
const round = (n) => Math.round(n * 1e6) / 1e6 + 0;

const surfaceArea = (polygons) => {
  let area = 0;
  for (const { vertices } of polygons) {
    const n = [0, 0, 0];
    for (let k = 0; k < vertices.length; k++) {
      const [x1, y1, z1] = vertices[k];
      const [x2, y2, z2] = vertices[(k + 1) % vertices.length];
      n[0] += (y1 - y2) * (z1 + z2);
      n[1] += (z1 - z2) * (x1 + x2);
      n[2] += (x1 - x2) * (y1 + y2);
    }
    area += Math.hypot(...n) / 2;
  }
  return area;
};

const merge = (p, q) =>
  p ? [p[0].map((v, k) => Math.min(v, q[0][k])), p[1].map((v, k) => Math.max(v, q[1][k]))] : q;

// No overlap thicker than the tolerance fits in boxes that overlap by less.
const boxesOverlap = (p, q, tolerance) =>
  [0, 1, 2].every((k) => Math.min(p[1][k], q[1][k]) - Math.max(p[0][k], q[0][k]) > tolerance);

const itemOf = (item) => {
  const members = [item]
    .flat(Infinity)
    .filter(isSolid)
    .map((g) => {
      const solid = wrapOne(g);
      return { solid, box: solid.measureBoundingBox() };
    });
  return { members, box: members.reduce((box, m) => merge(box, m.box), null) };
};

const overlap = (p, q, tolerance) => {
  let volume = 0;
  let area = 0;
  let box = null;
  for (const g of p.members) {
    for (const h of q.members) {
      if (!boxesOverlap(g.box, h.box, tolerance)) continue;
      const cut = g.solid.intersect(h.solid);
      const v = cut.measureVolume();
      if (!(v > 0)) continue;
      volume += v;
      area += surfaceArea(cut.toPolygons());
      box = merge(box, cut.measureBoundingBox());
    }
  }
  if (!box) return null;
  // 2V/A is the thickness of a thin overlap such as a press fit or a sunk face.
  return {
    volume: round(volume),
    depth: round((2 * volume) / area),
    boundingBox: box.map((c) => c.map(round)),
    dimensions: box[1].map((v, k) => round(v - box[0][k])),
  };
};

const inRange = ([lo, hi], i) => i >= lo && i <= hi;

// `allow` entries are { a, b, maxDepth? } with item selectors "N" or "N-M".
export const findInterference = (geom, geomType, opts = {}) => {
  const { tolerance = DEFAULT_TOLERANCE, allow = [] } = opts;
  const raw = geomType === "array" ? geom : [geom];
  const rules = allow.map((rule) => ({
    ...rule,
    ranges: [selectorRange(rule.a, raw.length), selectorRange(rule.b, raw.length)],
  }));
  const ruleFor = (i, j) =>
    rules.find(
      ({ ranges: [a, b] }) => (inRange(a, i) && inRange(b, j)) || (inRange(a, j) && inRange(b, i)),
    );
  const items = raw.map(itemOf);
  const interferences = [];
  const allowed = [];
  let pairsChecked = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (!items[i].box || !items[j].box) continue;
      if (!boxesOverlap(items[i].box, items[j].box, tolerance)) continue;
      pairsChecked++;
      const found = overlap(items[i], items[j], tolerance);
      if (!found || found.depth <= tolerance) continue;
      const pair = { a: String(i), b: String(j), ...found };
      const rule = ruleFor(i, j);
      if (!rule) interferences.push(pair);
      else if (rule.maxDepth !== undefined && found.depth > rule.maxDepth) {
        interferences.push({ ...pair, allow: `${rule.a},${rule.b}`, maxDepth: rule.maxDepth });
      } else allowed.push({ ...pair, allow: `${rule.a},${rule.b}` });
    }
  }
  const skipped = items.flatMap((it, i) => (it.box ? [] : [i]));
  return {
    tolerance,
    itemCount: raw.length,
    pairsChecked,
    interferences,
    allowed,
    ...(skipped.length ? { notSolid: skipped.map(String) } : {}),
  };
};
