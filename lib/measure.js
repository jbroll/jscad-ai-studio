import { anchors } from "./anchors.js";
import { measureArray, wrapOne } from "./array-geom.js";
import { axisRelation, symmetryAxis } from "./axis.js";

export const measureGeom = (geom, geomType) => {
  if (geomType === "array") return measureArray(geom);
  const out = {
    boundingBox: geom.measureBoundingBox(),
    dimensions: geom.measureDimensions(),
    center: geom.measureCenter(),
  };
  if (geomType === "geom3") {
    out.volume = geom.measureVolume();
    out.polygonCount = geom.toPolygons().length;
  } else if (geomType === "geom2") {
    out.area = geom.measureArea();
    out.polygonCount = geom.toOutlines().length;
  }
  return out;
};

const classify = (g) => {
  if (g && typeof g === "object" && "polygons" in g) return "geom3";
  if (g && typeof g === "object" && "sides" in g) return "geom2";
  return "unknown";
};

// Index the array as the model returns it, the same items `check` numbers.
const itemsOf = (geom, geomType) => (geomType === "array" ? geom : [geom]);

export const selectorRange = (selector, length) => {
  const [from, to = from] = selector.split("-").map(Number);
  if (to >= length) {
    const count = `${length} item${length === 1 ? "" : "s"}`;
    throw new Error(`part ${selector} is out of range; the model has ${count} (0-${length - 1})`);
  }
  return [from, to];
};

const selectItems = (items, selector) => {
  const [from, to] = selectorRange(selector, items.length);
  const picked = items.slice(from, to + 1).flat(Infinity);
  const bad = picked.find((g) => classify(g) === "unknown");
  if (bad !== undefined)
    throw new Error(`part ${selector} includes an item that is not a geom2 or geom3`);
  return picked;
};

const measureSelection = (items, selector) => {
  const picked = selectItems(items, selector);
  if (picked.length !== 1) return measureArray(picked);
  return measureGeom(wrapOne(picked[0]), classify(picked[0]));
};

// `selectors` is "all" or a list of "N" and "N-M" strings.
export const measureParts = (geom, geomType, selectors) => {
  const items = itemsOf(geom, geomType);
  const list = selectors === "all" ? items.map((_, i) => String(i)) : selectors;
  return list.map((part) => ({ part, ...measureSelection(items, part) }));
};

const roundMicron = (n) => Math.round(n * 1e6) / 1e6 + 0;

const roundFrame = ({ origin, z, x }) => ({
  origin: origin.map(roundMicron),
  z: z.map(roundMicron),
  x: x.map(roundMicron),
});

export const measureAnchors = (geom, geomType) =>
  itemsOf(geom, geomType).map((item, i) => ({
    part: String(i),
    anchors: Array.isArray(item)
      ? null
      : Object.fromEntries(
          Object.entries(anchors(item)).map(([name, frame]) => [name, roundFrame(frame)]),
        ),
  }));

const axisOf = (items, selector) =>
  symmetryAxis(
    selectItems(items, selector)
      .filter((g) => classify(g) === "geom3")
      .map((g) => wrapOne(g).toPolygons()),
  );

export const measureBetween = (geom, geomType, [a, b]) => {
  const items = itemsOf(geom, geomType);
  const ma = measureSelection(items, a);
  const mb = measureSelection(items, b);
  const [axisA, axisB] = [axisOf(items, a), axisOf(items, b)];
  const [[aLo, aHi], [bLo, bHi]] = [ma.boundingBox, mb.boundingBox];
  // Rounding keeps boolean noise (1e-14) from reading touching faces as overlap.
  const gap = [0, 1, 2].map((k) => roundMicron(Math.max(bLo[k] - aHi[k], aLo[k] - bHi[k])));
  return {
    a,
    b,
    gap,
    boxesOverlap: gap.every((g) => g < 0),
    distance: Math.hypot(...gap.map((g) => Math.max(g, 0))),
    centerOffset: mb.center.map((c, k) => roundMicron(c - ma.center[k])),
    axes: { a: axisA.axis, b: axisB.axis, ...axisRelation(axisA, axisB) },
  };
};
