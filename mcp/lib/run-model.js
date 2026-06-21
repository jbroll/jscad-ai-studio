import { checkGeom } from "./check.js";
import { exportGeom } from "./export-geom.js";
import { measureGeom } from "./measure.js";
import { loadAndRun } from "./model-loader.js";

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
  const { params = {}, outputs = ["eval"], format = "stl", bed } = opts;
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
  if (outputs.includes("measure")) result.measure = measureGeom(run.geom, run.geomType);
  if (outputs.includes("check")) result.check = checkGeom(run.geom, run.geomType, bed);
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
