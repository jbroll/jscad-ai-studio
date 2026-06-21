import { createParamsProxy, createProxyState } from "@jscadui/params-core";
import { loadModel } from "./jf.js";

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
  try {
    const main = loadModel(modelPath);
    const geom = main(proxy);
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
