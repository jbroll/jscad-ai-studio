import { createRequire } from "node:module";

const pluginRequire = createRequire(import.meta.url);
export const jf = pluginRequire("@jbroll/jscad-fluent");
export const FluentGeom3 = jf.FluentGeom3;
export const FluentGeom2 = jf.FluentGeom2;
