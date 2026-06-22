import { measureArray } from "./array-geom.js";

export const measureGeom = (geom, geomType) => {
  if (geomType === "array") return measureArray(geom);
  const out = {
    boundingBox: geom.measureBoundingBox(),
    dimensions: geom.measureDimensions(),
    center: geom.measureCenter(),
  };
  if (geomType === "geom3") {
    out.volume = geom.measureVolume();
    out.polygonCount = geom.toPolygons().length;
  } else if (geomType === "geom2") {
    out.area = geom.measureArea();
    out.polygonCount = geom.toOutlines().length;
  }
  return out;
};
