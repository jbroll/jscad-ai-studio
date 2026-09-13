import { checkGeom } from "./check.js";
import { exportGeom } from "./export-geom.js";
import { findInterference } from "./interference.js";
import { measureBetween, measureGeom, measureParts } from "./measure.js";
import { loadAndRun } from "./model-loader.js";
import { sectionOutline } from "./section.js";

const mapParams = (discovered) =>
  discovered
    .filter((d) => !d.hidden)
    .map((d) => ({
      name: d.name,
      type: d.type,
      default: d.default,
      min: d.min,
      max: d.max,
      step: d.step,
      label: d.label,
    }));

export const runModelSync = (modelPath, opts = {}) => {
  const { params = {}, outputs = ["eval"], format = "stl", bed, section, parts, between } = opts;
  const { interference } = opts;
  const run = loadAndRun(modelPath, params);
  const result = { ok: run.ok, geomType: run.geomType };
  if (!run.ok) {
    result.error = run.error;
    result.line = run.line;
    if (outputs.includes("params")) result.params = mapParams(run.params);
    return result;
  }
  if (outputs.includes("eval")) {
    result.entityCount = run.geomType === "array" ? run.geom.length : 1;
  }
  if (outputs.includes("params")) result.params = mapParams(run.params);
  if (outputs.includes("measure")) {
    result.measure = measureGeom(run.geom, run.geomType);
    if (parts) result.measure.parts = measureParts(run.geom, run.geomType, parts);
    if (between) result.measure.between = measureBetween(run.geom, run.geomType, between);
    if (section) result.measure.section = sectionOutline(run.geom, run.geomType, section);
  }
  if (outputs.includes("check")) result.check = checkGeom(run.geom, run.geomType, bed);
  if (outputs.includes("interference")) {
    result.interference = findInterference(run.geom, run.geomType, interference);
  }
  if (outputs.includes("export")) {
    const e = exportGeom(run.geom, run.geomType, format);
    result.export = {
      base64: e.data.toString("base64"),
      bytes: e.bytes,
      triangleCount: e.triangleCount,
      mime: e.mime,
    };
  }
  return result;
};
