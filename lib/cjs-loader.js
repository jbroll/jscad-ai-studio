import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve } from "node:path";
import vm from "node:vm";
import { jscadAnchors } from "./anchors.js";
import { jf } from "./jf.js";
import { evalScadModel } from "./openscad.js";

const resolveRelative = (dir, id) => {
  const base = resolve(dir, id);
  if (base.endsWith(".js") || base.endsWith(".scad")) return base;
  return `${base}.js`;
};

export const loadCjsModule = (absPath, cache = new Map()) => {
  if (cache.has(absPath)) return cache.get(absPath);
  const mod = { exports: {} };
  cache.set(absPath, mod.exports); // seed before executing (cycle tolerance)
  const src = readFileSync(absPath, "utf8");
  const dir = dirname(absPath);
  const req = (id) => {
    if (id === "@jbroll/jscad-fluent") return jf;
    // jscad-anchors re-exports every modeling namespace, so raw-style calls keep frames.
    if (id === "@jbroll/jscad-anchors" || id === "@jscad/modeling") return jscadAnchors;
    if (id.startsWith("./") || id.startsWith("../") || isAbsolute(id)) {
      const resolved = resolveRelative(dir, id);
      if (resolved.endsWith(".scad")) return evalScadModel(resolved);
      return loadCjsModule(resolved, cache);
    }
    return createRequire(absPath)(id);
  };
  const fn = vm.compileFunction(src, ["module", "exports", "require", "__dirname", "__filename"], {
    filename: absPath,
  });
  fn(mod, mod.exports, req, dir, absPath);
  cache.set(absPath, mod.exports); // update if module.exports was reassigned
  return mod.exports;
};

export const loadModel = (modelPath) => {
  const exports = loadCjsModule(modelPath, new Map());
  const main = exports.main ?? exports.default;
  if (typeof main !== "function") {
    throw new Error("model does not export a main() function");
  }
  return main;
};
