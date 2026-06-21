import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const stl = require("@jscad/stl-serializer");
const threemf = require("@jscad/3mf-serializer");
const obj = require("@jscad/obj-serializer");
const svg = require("@jscad/svg-serializer");

const need = (format, geomType, want) => {
  if (geomType !== want) throw new Error(`format ${format} requires geomType ${want}`);
};

export const exportGeom = (geom, geomType, format) => {
  switch (format) {
    case "stl": {
      need("stl", geomType, "geom3");
      const parts = stl.serialize({ binary: true }, geom);
      const data = Buffer.concat(parts.map((ab) => Buffer.from(ab)));
      return {
        data,
        bytes: data.length,
        triangleCount: (data.length - 84) / 50,
        mime: "model/stl",
      };
    }
    case "3mf": {
      need("3mf", geomType, "geom3");
      const [u8] = threemf.serialize({ compress: true, unit: "millimeter" }, geom);
      const data = Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength);
      return {
        data,
        bytes: data.length,
        triangleCount: geom.toPolygons().length,
        mime: threemf.mimeType,
      };
    }
    case "obj": {
      need("obj", geomType, "geom3");
      const [text] = obj.serialize({ triangulate: true }, geom);
      const data = Buffer.from(text, "utf8");
      return {
        data,
        bytes: data.length,
        triangleCount: geom.toPolygons().length,
        mime: obj.mimeType,
      };
    }
    case "svg": {
      need("svg", geomType, "geom2");
      const [text] = svg.serialize({ unit: "mm" }, geom);
      const data = Buffer.from(text, "utf8");
      return { data, bytes: data.length, triangleCount: 0, mime: svg.mimeType };
    }
    default:
      throw new Error(`unknown format ${format}`);
  }
};
