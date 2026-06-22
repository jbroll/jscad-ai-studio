import { runModel } from "../../mcp/lib/runner.js";

export const classifyFailure = (r) => {
  const msg = String(r.error || "").toLowerCase();
  if (r.error === "timeout") return "timeout";
  if (/no geometry|empty/.test(msg)) return "empty";
  if (/parse|transpile|unexpected|not defined|undefined is not/.test(msg)) return "transpiler-gap";
  if (/font|rands|text/.test(msg)) return "font/rands";
  return "openscad-lib-bug";
};

export const verifyModel = async (absPath) => {
  const r = await runModel(absPath, { outputs: ["eval", "measure"], timeoutMs: 20000 });
  if (!r.ok) {
    return {
      runs: false,
      geomType: r.geomType ?? "unknown",
      dimensions: null,
      polygonCount: null,
      failureClass: classifyFailure(r),
      error: String(r.error ?? "unknown"),
    };
  }
  const m = r.measure ?? {};
  return {
    runs: true,
    geomType: r.geomType,
    dimensions: m.dimensions ?? null,
    polygonCount: m.polygonCount ?? null,
    failureClass: null,
    error: null,
  };
};
