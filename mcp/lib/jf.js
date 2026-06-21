import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import vm from "node:vm";

const pluginRequire = createRequire(import.meta.url);
const jf = pluginRequire("@jbroll/jscad-fluent");

export const FluentGeom3 = jf.FluentGeom3;

// Load a CommonJS model with a require-shim so @jbroll/jscad-fluent always
// resolves to the plugin's instance regardless of where the model lives.
export const loadModel = (modelPath) => {
  const src = readFileSync(modelPath, "utf8");
  const modelRequire = createRequire(modelPath);
  const shim = (id) =>
    id === "@jbroll/jscad-fluent" || id === "@jscad/modeling" ? jf : modelRequire(id);
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
