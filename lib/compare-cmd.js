import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseParams, parsePositiveInt, UsageError } from "./cli-args.js";
import { measureDelta, sideSummary } from "./compare.js";
import { decodePng, diffImages, encodePng } from "./png.js";
import { runModel } from "./runner.js";

const ext = (path) => extname(path).toLowerCase();
const stem = (path) => basename(path, extname(path));

const comparePngs = ([a, b], { values }, ctx, renderDir) => {
  if (values.params) throw new UsageError("-p applies to models, not PNGs");
  const threshold = values.threshold === undefined ? 0 : Number(values.threshold);
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) {
    throw new UsageError("--threshold takes an integer from 0 to 255");
  }
  const out = resolve(
    ctx.cwd,
    values.output ?? join(renderDir, `${stem(a)}-vs-${stem(b)}-diff.png`),
  );
  const [imageA, imageB] = [a, b].map((path) => decodePng(readFileSync(path)));
  const { image, ...diff } = diffImages(imageA, imageB, threshold);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(image));
  return { ok: true, a, b, threshold, ...diff, diff: out };
};

const loadSaved = (path) => {
  let saved;
  try {
    saved = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${basename(path)} is not valid JSON`);
  }
  if (!Array.isArray(saved?.measure?.dimensions)) {
    throw new Error(`${basename(path)} is not a jscad-work measure result`);
  }
  return saved;
};

const compareMeasures = async (paths, { values }) => {
  if (values.threshold !== undefined || values.output !== undefined) {
    throw new UsageError("--threshold and -o apply to comparing PNGs");
  }
  const params = (values.params ?? []).map(parseParams);
  if (params.length > 2) throw new UsageError("-p is given at most twice, for A and then B");
  const [pathA, pathB = pathA] = paths;
  if (paths.length === 1 && (params.length === 0 || ext(pathA) === ".json")) {
    throw new UsageError("give B as a second model or result file, or as -p JSON");
  }
  const sides = [
    ["a", pathA, params.length === 2 ? params[0] : undefined],
    ["b", pathB, params.length === 2 ? params[1] : params[0]],
  ];
  for (const [, path, p] of sides) {
    if (p && ext(path) === ".json") throw new UsageError(`-p cannot apply to ${basename(path)}`);
  }
  const timeoutMs = parsePositiveInt("--timeout", values.timeout);
  const results = await Promise.all(
    sides.map(async ([label, path, p]) => {
      if (ext(path) === ".json") return loadSaved(path);
      const r = await runModel(path, { params: p, timeoutMs, outputs: ["measure"], parts: "all" });
      if (!r.ok) return { ...r, error: `${label} (${basename(path)}): ${r.error}` };
      if (r.geomType !== "array") delete r.measure.parts;
      return r;
    }),
  );
  const failed = results.find((r) => r.ok === false);
  if (failed) return failed;
  const [ra, rb] = results;
  return {
    ok: true,
    a: sideSummary(pathA, sides[0][2], ra),
    b: sideSummary(pathB, sides[1][2], rb),
    ...measureDelta(ra.measure, rb.measure),
  };
};

export const compareCommand = async (args, ctx, renderDir) => {
  const { positionals } = args;
  if (positionals.length < 1 || positionals.length > 2) {
    throw new UsageError("compare takes one or two files");
  }
  const paths = positionals.map((text) => {
    const path = resolve(ctx.cwd, text);
    if (!existsSync(path)) throw new UsageError(`no such file: ${text}`);
    return path;
  });
  const pngs = paths.filter((path) => ext(path) === ".png").length;
  if (pngs === 0) return compareMeasures(paths, args);
  if (pngs !== 2) throw new UsageError("compare a PNG with another PNG");
  return comparePngs(paths, args, ctx, renderDir);
};
