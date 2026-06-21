import Module from "node:module";
import { evalScadSolidSync, initScadRuntime, manifoldToGeom3 } from "@jscadui/openscad/run";
import { FluentGeom3 } from "./jf.js";

let ctx = null;
let registered = false;

export const initOpenscad = async () => {
  if (!ctx) ctx = await initScadRuntime();
};

const toFluent = (scadPath) => {
  const solid = evalScadSolidSync(scadPath, ctx);
  if (!solid) return new FluentGeom3();
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
