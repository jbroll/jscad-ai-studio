import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import vm from "node:vm";

const pluginRequire = createRequire(import.meta.url);
const jf = pluginRequire("@jbroll/jscad-fluent");
// The real @jscad/modeling (resolves from node_modules). jscad-native examples
// use its API directly (jscad.primitives.cube, jscad.booleans.union, ...), which
// jscad-fluent does NOT expose — so `@jscad/modeling` must map to the real lib,
// while `@jbroll/jscad-fluent` maps to fluent.
const jscadModeling = pluginRequire("@jscad/modeling");

export const FluentGeom3 = jf.FluentGeom3;
export const FluentGeom2 = jf.FluentGeom2;

// Load a CommonJS model with a require-shim so @jbroll/jscad-fluent and
// @jscad/modeling always resolve to the plugin's instances regardless of where
// the model lives.
export const loadModel = (modelPath) => {
  const src = readFileSync(modelPath, "utf8");
  const modelRequire = createRequire(modelPath);
  const shim = (id) => {
    if (id === "@jbroll/jscad-fluent") return jf;
    if (id === "@jscad/modeling") return jscadModeling;
    return modelRequire(id);
  };
  const fn = vm.compileFunction(src, ["module", "exports", "require", "__dirname", "__filename"], {
    filename: modelPath,
  });
  const mod = { exports: {} };
  fn(mod, mod.exports, shim, dirname(modelPath), modelPath);
  const main = mod.exports.main ?? mod.exports.default;
  if (typeof main !== "function") {
    throw new Error("model does not export a main() function");
  }
  return main;
};
