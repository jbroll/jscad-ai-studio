import { createRequire } from "node:module";

const pluginRequire = createRequire(import.meta.url);
export const jscadAnchors = pluginRequire("@jbroll/jscad-anchors");
export const { anchors } = jscadAnchors;
