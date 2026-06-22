import { createParamsProxy, createProxyState } from "@jscadui/params-core";
import { loadModel } from "./cjs-loader.js";
import { FluentGeom2, FluentGeom3 } from "./jf.js";
import { evalScadModel } from "./openscad.js";

// Normalize a single raw @jscad/modeling geometry into a fluent wrapper so
// downstream measure/export/check (which use FluentGeom3/FluentGeom2 methods)
// work for jscad-native models too. Already-fluent geoms pass through; arrays
// (multi-part scenes) and unknown results are left as-is (multi-part jscad-native
// support is out of scope here — see sub-project D).
const normalize = (g) => {
  if (Array.isArray(g)) return g;
  if (g && typeof g.measureBoundingBox === "function") return g; // already fluent
  if (g && typeof g === "object" && "polygons" in g) return new FluentGeom3(g);
  if (g && typeof g === "object" && "sides" in g) return new FluentGeom2(g);
  return g;
};

const classify = (g) => {
  if (Array.isArray(g)) return "array";
  if (g && typeof g === "object" && "polygons" in g) return "geom3";
  if (g && typeof g === "object" && "sides" in g) return "geom2";
  return "unknown";
};

const errorLine = (err, modelPath) => {
  const stack = String(err.stack || "");
  const re = new RegExp(`${modelPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:(\\d+)`);
  const m = stack.match(re);
  return m ? Number(m[1]) : 0;
};

export const loadAndRun = (modelPath, params = {}) => {
  const uiValues = {};
  const userInteracted = new Set();
  for (const [k, v] of Object.entries(params)) {
    uiValues[k] = v;
    userInteracted.add(k);
  }
  const state = createProxyState(uiValues, userInteracted, { mode: "hierarchical" });
  const proxy = createParamsProxy(state);
  if (modelPath.endsWith(".scad")) {
    try {
      const geom = evalScadModel(modelPath);
      return { ok: true, geomType: "geom3", geom, params: [] };
    } catch (err) {
      return {
        ok: false,
        error: String(err.message || err),
        line: 0,
        geomType: "unknown",
        params: [],
      };
    }
  }
  try {
    const main = loadModel(modelPath);
    const geom = normalize(main(proxy));
    return {
      ok: true,
      geomType: classify(geom),
      geom,
      params: state.discovered,
    };
  } catch (err) {
    return {
      ok: false,
      error: String(err.message || err),
      line: errorLine(err, modelPath),
      geomType: "unknown",
      params: state.discovered,
    };
  }
};
