import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseParams, parsePositiveInt, UsageError } from "./cli-args.js";
import { runModel } from "./runner.js";
import { draftSpec, validateSpec } from "./spec.js";

const specPath = (model, override, cwd) =>
  override
    ? resolve(cwd, override)
    : join(dirname(model), `${basename(model, extname(model))}.spec.json`);

const readSpec = (path) => {
  if (!existsSync(path)) {
    throw new Error(`no spec file ${basename(path)}; record one with --write`);
  }
  let spec;
  try {
    spec = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${basename(path)} is not valid JSON`);
  }
  validateSpec(spec);
  return spec;
};

const writeSpec = async (model, path, { params, timeoutMs, force }) => {
  if (existsSync(path) && !force) {
    throw new UsageError(`${basename(path)} exists; add --force to replace it`);
  }
  const r = await runModel(model, {
    params,
    timeoutMs,
    outputs: ["measure", "interference"],
    parts: "all",
  });
  if (!r.ok) return r;
  const spec = draftSpec(r, params);
  writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);
  const fields = (shape) => Object.keys(shape).length;
  const assertions =
    fields(spec.model) + Object.values(spec.parts ?? {}).reduce((n, p) => n + fields(p), 0) + 1;
  return {
    ok: true,
    wrote: path,
    assertions,
    recordedOverlaps: spec.interference.allow.length,
  };
};

export const verifySpecCommand = async (model, { values }, ctx) => {
  const path = specPath(model, values.spec, ctx.cwd);
  const cliParams = parseParams(values.params);
  const timeoutMs = parsePositiveInt("--timeout", values.timeout);
  if (values.write)
    return writeSpec(model, path, { params: cliParams, timeoutMs, force: values.force });
  if (values.force) throw new UsageError("--force applies to --write");
  const spec = readSpec(path);
  const params = spec.params || cliParams ? { ...spec.params, ...cliParams } : undefined;
  const r = await runModel(model, { params, timeoutMs, outputs: ["spec"], spec });
  if (!r.ok) return r;
  const { passed, failed, results } = r.spec;
  const failures = results.filter((x) => !x.pass).map((x) => x.assert);
  return {
    ok: failed === 0,
    spec: path,
    ...(params ? { params } : {}),
    passed,
    failed,
    results,
    ...(failed
      ? { error: `${failed} of ${results.length} spec assertions failed: ${failures.join(", ")}` }
      : {}),
  };
};
