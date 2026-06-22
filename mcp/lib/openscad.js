import { existsSync } from "node:fs";
import Module from "node:module";
import { dirname, join, resolve } from "node:path";
import { evalScadSolidSync, initScadRuntime, manifoldToGeom3 } from "@jscadui/openscad/run";
import { FluentGeom3 } from "./jf.js";

let ctx = null;
let registered = false;

export const initOpenscad = async () => {
  if (!ctx) ctx = await initScadRuntime();
};

// Detect the OpenSCAD library search root for a .scad file so `include <lib/...>`
// resolves — mirrors jscadui's test-harness detectLibraryDir. Without this,
// library models (BOSL2's `include <lib/std.scad>`, NopSCADlib, etc.) fail with
// "X_$m is not defined" because their lib/ tree is never on the search path.
export const detectLibraryDir = (scadPath) => {
  const corpus = scadPath.match(/(.*\/corpus\/[^/]+)(?:\/|$)/);
  if (corpus) return corpus[1];
  const examples = scadPath.match(/(.*\/examples\/openscad\/[^/]+)(?:\/|$)/);
  if (examples) return examples[1];
  let dir = dirname(scadPath);
  for (let i = 0; i < 3; i++) {
    if (existsSync(join(dir, "lib"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

const toFluent = (scadPath) => {
  const libDir = detectLibraryDir(scadPath);
  const libPaths = libDir ? [resolve(libDir)] : [];
  // preview:true matches what the jscadui viewer shows (F5 preview mode) and is
  // required by libraries like NopSCADlib that gate their assembly geometry on
  // `$preview`; it produces identical geometry for models that don't branch on it.
  const solid = evalScadSolidSync(scadPath, ctx, { libPaths, preview: true });
  // A non-manifold result (e.g. a `$preview`-gated sentinel, empty geometry, or a
  // 2D-only result) has no mesh — treat as empty rather than crashing the convert.
  if (!solid || typeof (solid.manifold ?? solid)?.getMesh !== "function") return new FluentGeom3();
  return new FluentGeom3(manifoldToGeom3(solid.manifold ?? solid));
};

export const evalScadModel = (scadPath) => {
  if (!ctx) throw new Error("initOpenscad() must be awaited before evalScadModel");
  return toFluent(scadPath);
};

export const registerScadRequire = () => {
  if (registered) return;
  registered = true;
  Module._extensions[".scad"] = (module, filename) => {
    module.exports = toFluent(filename);
  };
};
