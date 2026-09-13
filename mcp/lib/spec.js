import { findInterference } from "./interference.js";
import { measureBetween, measureGeom, measureParts } from "./measure.js";

const LENGTH_TOLERANCE = 0.01;
const VOLUME_TOLERANCE = 0.001;
const ANGLE_TOLERANCE = 0.1;

const SHAPE = { vector: ["dimensions", "center"], scalar: ["volume", "area"] };
const BETWEEN = {
  vector: ["gap", "centerOffset"],
  scalar: ["distance", "axisAngle", "axisOffset"],
};
const TOP = ["params", "tolerance", "volumeTolerance", "model", "parts", "between", "interference"];
const SELECTOR = /^(\d+)(?:-(\d+))?$/;

const fail = (where, what) => {
  throw new Error(`spec ${where}: ${what}`);
};

const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isNumber = (v) => typeof v === "number" && Number.isFinite(v);

const isExpectation = (e) => {
  if (isNumber(e)) return true;
  if (!isObject(e) || !Object.values(e).every(isNumber)) return false;
  const keys = Object.keys(e).sort().join(",");
  return ["min", "max", "max,min", "value", "tolerance,value"].includes(keys);
};

const EXPECTATION = "a number, {min, max}, or {value, tolerance}";

const checkSelector = (where, text) => {
  const m = typeof text === "string" && text.match(SELECTOR);
  if (!m || (m[2] !== undefined && Number(m[2]) < Number(m[1]))) {
    fail(where, `"${text}" is not an item index N or range N-M`);
  }
};

const checkFields = (where, obj, fields, extra = []) => {
  if (!isObject(obj)) fail(where, "must be an object");
  for (const [key, value] of Object.entries(obj)) {
    if (fields.vector.includes(key)) {
      const ok =
        Array.isArray(value) &&
        value.length === 3 &&
        value.every((e) => e === null || isExpectation(e));
      if (!ok) fail(`${where}.${key}`, `takes three values, each ${EXPECTATION}, or null`);
    } else if (fields.scalar.includes(key)) {
      if (!isExpectation(value)) fail(`${where}.${key}`, `takes ${EXPECTATION}`);
    } else if (!extra.includes(key)) {
      const known = [...fields.vector, ...fields.scalar].join(", ");
      fail(where, `unknown field "${key}"; use ${known}`);
    }
  }
};

const checkInterference = (spec) => {
  checkFields("interference", spec, { vector: [], scalar: ["tolerance"] }, ["allow"]);
  if (spec.allow === undefined) return;
  if (!Array.isArray(spec.allow)) fail("interference.allow", "must be an array");
  spec.allow.forEach((rule, i) => {
    const where = `interference.allow.${i}`;
    checkFields(where, rule, { vector: [], scalar: ["maxDepth"] }, ["a", "b", "why"]);
    checkSelector(`${where}.a`, rule.a);
    checkSelector(`${where}.b`, rule.b);
  });
};

export const validateSpec = (spec) => {
  if (!isObject(spec)) fail("file", "must hold a JSON object");
  const unknown = Object.keys(spec).find((k) => !TOP.includes(k));
  if (unknown) fail("file", `unknown field "${unknown}"; use ${TOP.join(", ")}`);
  if (!["model", "parts", "between", "interference"].some((k) => k in spec)) {
    fail("file", "has no assertions; add model, parts, between, or interference");
  }
  for (const key of ["tolerance", "volumeTolerance"]) {
    if (key in spec && !(isNumber(spec[key]) && spec[key] >= 0)) fail(key, "must be 0 or more");
  }
  if (spec.params !== undefined && !isObject(spec.params)) fail("params", "must be an object");
  if (spec.model !== undefined) checkFields("model", spec.model, SHAPE);
  if (spec.parts !== undefined) {
    if (!isObject(spec.parts)) fail("parts", "must be an object keyed by item selector");
    for (const [selector, fields] of Object.entries(spec.parts)) {
      checkSelector("parts", selector);
      checkFields(`parts.${selector}`, fields, SHAPE);
    }
  }
  if (spec.between !== undefined) {
    if (!Array.isArray(spec.between)) fail("between", "must be an array");
    spec.between.forEach((entry, i) => {
      checkFields(`between.${i}`, entry, BETWEEN, ["a", "b"]);
      checkSelector(`between.${i}.a`, entry.a);
      checkSelector(`between.${i}.b`, entry.b);
    });
  }
  if (spec.interference !== undefined) checkInterference(spec.interference);
};

const round = (v) => {
  if (Array.isArray(v)) return v.map(round);
  return isNumber(v) ? Math.round(v * 1e6) / 1e6 + 0 : (v ?? null);
};

const toleranceFor = (spec, key, expected) => {
  if (key === "volume" || key === "area") {
    return Math.abs(expected) * (spec.volumeTolerance ?? VOLUME_TOLERANCE);
  }
  return key === "axisAngle" ? ANGLE_TOLERANCE : (spec.tolerance ?? LENGTH_TOLERANCE);
};

const meets = (actual, e, tolerance) => {
  if (!isNumber(actual)) return false;
  if (isNumber(e)) return Math.abs(actual - e) <= tolerance(e) + 1e-9;
  if ("value" in e) return Math.abs(actual - e.value) <= (e.tolerance ?? tolerance(e.value)) + 1e-9;
  return (e.min === undefined || actual >= e.min) && (e.max === undefined || actual <= e.max);
};

const assertFields = (spec, prefix, expectations, measured) =>
  Object.entries(expectations)
    .filter(([key]) => ![`a`, `b`].includes(key))
    .map(([key, expected]) => {
      const actual = round(measured[key]);
      const tolerance = (e) => toleranceFor(spec, key, e);
      const pass = Array.isArray(expected)
        ? expected.every((e, k) => e === null || meets(actual?.[k], e, tolerance))
        : meets(actual, expected, tolerance);
      return { assert: `${prefix}.${key}`, expected, actual, pass };
    });

export const verifySpec = (geom, geomType, spec) => {
  const results = [];
  if (spec.model) {
    results.push(...assertFields(spec, "model", spec.model, measureGeom(geom, geomType)));
  }
  if (spec.parts) {
    for (const m of measureParts(geom, geomType, Object.keys(spec.parts))) {
      results.push(...assertFields(spec, `parts.${m.part}`, spec.parts[m.part], m));
    }
  }
  for (const entry of spec.between ?? []) {
    const m = measureBetween(geom, geomType, [entry.a, entry.b]);
    const measured = { ...m, axisAngle: m.axes.angle, axisOffset: m.axes.offset };
    results.push(...assertFields(spec, `between.${entry.a},${entry.b}`, entry, measured));
  }
  if (spec.interference) {
    const { interferences } = findInterference(geom, geomType, spec.interference);
    results.push({
      assert: "interference",
      expected: [],
      actual: interferences.map(({ boundingBox: _, ...pair }) => pair),
      pass: interferences.length === 0,
    });
  }
  const failed = results.filter((r) => !r.pass).length;
  return { passed: results.length - failed, failed, results };
};

const r3 = (n) => Math.round(n * 1000) / 1000 + 0;

const shapeOf = (m) => ({
  dimensions: m.dimensions.map(r3),
  center: m.center.map(r3),
  ...(m.volume !== undefined ? { volume: r3(m.volume) } : {}),
  ...(m.area !== undefined ? { area: r3(m.area) } : {}),
});

// A starting spec: the current measurements, and each current overlap allowed at its
// present depth so an edit that deepens it or adds another fails.
export const draftSpec = ({ geomType, measure, interference }, params) => ({
  ...(params ? { params } : {}),
  tolerance: LENGTH_TOLERANCE,
  volumeTolerance: VOLUME_TOLERANCE,
  model: shapeOf(measure),
  ...(geomType === "array"
    ? { parts: Object.fromEntries(measure.parts.map((p) => [p.part, shapeOf(p)])) }
    : {}),
  interference: {
    allow: interference.interferences.map(({ a, b, depth }) => ({
      a,
      b,
      maxDepth: Math.ceil(depth * 1000 - 1e-6) / 1000,
      why: "recorded by --write; confirm it is intended or fix it",
    })),
  },
});
