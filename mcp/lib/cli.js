import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { getEntry, loadCatalog, searchResults } from "./catalog.js";
import { liveParams } from "./live-params.js";
import { listParts } from "./parts.js";
import { runModel } from "./runner.js";

export const VIEWS = ["front", "back", "left", "right", "top", "bottom", "iso"];
const FORMATS = ["stl", "3mf", "obj", "svg"];
export const RENDER_DIR = ".jscad-work";

class UsageError extends Error {}

const HELP = { help: { type: "boolean", short: "h" } };
const PARAMS = { params: { type: "string", short: "p" } };
const TIMEOUT = { timeout: { type: "string", short: "t" } };
const OUTPUT = { output: { type: "string", short: "o" } };

const PARAMS_HELP =
  '  -p, --params JSON   parameter overrides, e.g. \'{"size":18,"motor.stack":30}\'';
const TIMEOUT_HELP = "  -t, --timeout MS    evaluation timeout in ms (default 10000)";

const parseParams = (json) => {
  if (json === undefined) return undefined;
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new UsageError(`--params is not valid JSON: ${json}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UsageError("--params must be a JSON object");
  }
  return value;
};

const parsePositiveInt = (flag, text) => {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`${flag} must be a positive integer`);
  return n;
};

const modelArg = ({ positionals }, ctx) => {
  const [model] = positionals;
  if (!model) throw new UsageError("model path required");
  const path = resolve(ctx.cwd, model);
  if (!existsSync(path)) throw new UsageError(`no such model file: ${model}`);
  return path;
};

const report = (ctx, result) => {
  ctx.stdout(JSON.stringify(result));
  if (result.ok !== false) return 0;
  const line = result.line ? ` (line ${result.line})` : "";
  const hint = /^eval timeout/.test(result.error) ? "; raise it with --timeout MS" : "";
  ctx.stderr(`error: ${result.error}${line}${hint}`);
  return 1;
};

const evalWith =
  (outputs, extra = () => ({})) =>
  async (args, ctx) =>
    report(
      ctx,
      await runModel(modelArg(args, ctx), {
        params: parseParams(args.values.params),
        timeoutMs: parsePositiveInt("--timeout", args.values.timeout),
        outputs,
        ...extra(args),
      }),
    );

const parseBed = (text) => {
  if (text === undefined) return undefined;
  const bed = text.split(/[,x]/).map(Number);
  if (bed.length !== 3 || bed.some((n) => !(n > 0))) {
    throw new UsageError("--bed takes three positive numbers, e.g. 220,220,250");
  }
  return bed;
};

const parseSize = (text = "800x600") => {
  const m = text.match(/^(\d+)x(\d+)$/);
  if (!m) throw new UsageError("--size takes WIDTHxHEIGHT, e.g. 800x600");
  return [Number(m[1]), Number(m[2])];
};

const parseViews = (text = "iso") => {
  const views = text === "all" ? VIEWS : text.split(",");
  const bad = views.filter((v) => !VIEWS.includes(v));
  if (bad.length) throw new UsageError(`unknown view "${bad[0]}"; use ${VIEWS.join(", ")} or all`);
  return views;
};

const exportModel = async (args, ctx) => {
  const { output, format: formatOpt } = args.values;
  const format = (formatOpt ?? (output ? extname(output).slice(1) : "stl")).toLowerCase();
  if (!FORMATS.includes(format)) {
    throw new UsageError(`unknown format "${format}"; use ${FORMATS.join(", ")}`);
  }
  const model = modelArg(args, ctx);
  const path = resolve(ctx.cwd, output ?? `${basename(model, extname(model))}.${format}`);
  const result = await runModel(model, {
    params: parseParams(args.values.params),
    timeoutMs: parsePositiveInt("--timeout", args.values.timeout),
    outputs: ["export"],
    format,
  });
  if (!result.ok) return report(ctx, result);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(result.export.base64, "base64"));
  const { base64: _, ...info } = result.export;
  return report(ctx, { ok: true, geomType: result.geomType, export: { path, ...info } });
};

const renderPaths = (args, ctx, model, views) => {
  const { output } = args.values;
  return views.map((view) => {
    if (!output) return resolve(ctx.cwd, RENDER_DIR, `${basename(model)}-${view}.png`);
    const path = resolve(ctx.cwd, output);
    return views.length === 1 ? path : path.replace(/(\.png)?$/i, `-${view}.png`);
  });
};

const renderCmd = async (args, ctx) => {
  const model = modelArg(args, ctx);
  const views = parseViews(args.values.view);
  const size = parseSize(args.values.size);
  const params = parseParams(args.values.params);
  const timeoutMs = parsePositiveInt("--timeout", args.values.timeout);
  const paths = renderPaths(args, ctx, model, views);
  for (const path of paths) mkdirSync(dirname(path), { recursive: true });
  const { closeRender, renderViews } = await (ctx.render ?? import("./render.js"));
  try {
    const renders = await renderViews(model, { size, views, paths, params, timeoutMs });
    return report(ctx, {
      ok: true,
      width: size[0],
      height: size[1],
      ...(params ? { params } : {}),
      renders,
    });
  } finally {
    await closeRender();
  }
};

const catalogOf = (ctx) => ctx.catalog ?? loadCatalog();

const listOpt = (text) => (text ? text.split(",").filter(Boolean) : undefined);

const sizeNumber = (flag, text) => {
  const n = Number(text);
  if (text.trim() === "" || !(n >= 0)) {
    throw new UsageError(`${flag} takes N or X,Y,Z in mm, with an empty or - axis for no bound`);
  }
  return n;
};

const parseSizeBound = (flag, text) => {
  if (text === undefined) return undefined;
  const axes = text.split(",");
  if (axes.length === 1) return sizeNumber(flag, text);
  if (axes.length !== 3) sizeNumber(flag, "");
  return axes.map((a) => (a === "" || a === "-" ? null : sizeNumber(flag, a)));
};

const librarySearch = async ({ positionals, values }, ctx) => {
  if (values.lang && !["scad", "js"].includes(values.lang)) {
    throw new UsageError("--lang must be scad or js");
  }
  const results = searchResults(
    positionals.join(" "),
    {
      tags: listOpt(values.tags),
      source: values.source,
      lang: values.lang,
      runnableOnly: !values["include-broken"],
      parametric: values.parametric || undefined,
      minSize: parseSizeBound("--min-size", values["min-size"]),
      maxSize: parseSizeBound("--max-size", values["max-size"]),
      limit: parsePositiveInt("--limit", values.limit),
    },
    catalogOf(ctx),
  );
  return report(ctx, { results });
};

const libraryGet = async ({ positionals, values }, ctx) => {
  const [id] = positionals;
  if (!id) throw new UsageError("catalog id required");
  const got = getEntry(id, catalogOf(ctx));
  if (!got) {
    ctx.stdout(JSON.stringify({ entry: null, path: null }));
    ctx.stderr(`error: no catalog entry "${id}"`);
    return 1;
  }
  const { source, ...rest } = got;
  return report(ctx, values["with-source"] ? got : rest);
};

const liveParamsCmd = async ({ positionals, values }, ctx) => {
  const [first, second] = positionals;
  const json = values.params ?? second ?? first;
  if (json === undefined) throw new UsageError("params JSON required");
  const model = values.params !== undefined || second !== undefined ? first : undefined;
  const modelPath = model === undefined ? undefined : modelArg({ positionals: [model] }, ctx);
  return report(ctx, await liveParams(parseParams(json), { cwd: ctx.cwd, modelPath }));
};

const COMMANDS = {
  eval: {
    summary: "Run a model; report errors, geometry type, entity count",
    usage: "jscad-work eval <model> [-p JSON] [-t MS]",
    options: { ...PARAMS, ...TIMEOUT },
    help: [PARAMS_HELP, TIMEOUT_HELP],
    run: evalWith(["eval"]),
  },
  params: {
    summary: "List a model's declared parameters",
    usage: "jscad-work params <model> [-t MS]",
    options: { ...TIMEOUT },
    help: [TIMEOUT_HELP],
    run: evalWith(["params"]),
  },
  measure: {
    summary: "Bounding box, dimensions, volume or area, polygon count",
    usage: "jscad-work measure <model> [-p JSON] [-t MS]",
    options: { ...PARAMS, ...TIMEOUT },
    help: [PARAMS_HELP, TIMEOUT_HELP],
    run: evalWith(["measure"]),
  },
  check: {
    summary: "Empty, watertight, manifold, and bed-fit checks",
    usage: "jscad-work check <model> [--bed X,Y,Z] [-p JSON] [-t MS]",
    options: { ...PARAMS, ...TIMEOUT, bed: { type: "string" } },
    help: ["  --bed X,Y,Z         printer bed size in mm; sets fitsBed", PARAMS_HELP, TIMEOUT_HELP],
    run: evalWith(["check"], (args) => ({ bed: parseBed(args.values.bed) })),
  },
  export: {
    summary: "Write the model to an STL, 3MF, OBJ, or SVG file",
    usage: "jscad-work export <model> [-o FILE] [-f FORMAT] [-p JSON] [-t MS]",
    options: { ...PARAMS, ...TIMEOUT, ...OUTPUT, format: { type: "string", short: "f" } },
    help: [
      "  -o, --output FILE   output file (default <model name>.<format> in the current directory)",
      "  -f, --format FMT    stl, 3mf, obj, or svg (default: from the -o extension, else stl)",
      PARAMS_HELP,
      TIMEOUT_HELP,
    ],
    run: exportModel,
  },
  render: {
    summary: "PNG screenshots from the headless viewer (needs Chromium)",
    usage:
      "jscad-work render <model> [--view V[,V...]|all] [-o FILE] [--size WxH] [-p JSON] [-t MS]",
    options: {
      ...PARAMS,
      ...TIMEOUT,
      ...OUTPUT,
      view: { type: "string" },
      size: { type: "string" },
    },
    help: [
      `  --view VIEWS        comma list of ${VIEWS.join(", ")}, or all (default iso)`,
      `  -o, --output FILE   PNG path; with several views, -<view> is added before .png (default ${RENDER_DIR}/<model>-<view>.png)`,
      "  --size WxH          viewport in pixels (default 800x600)",
      PARAMS_HELP,
      "  -t, --timeout MS    time allowed for the viewer to load and run the model (default 60000)",
    ],
    run: renderCmd,
  },
  parts: {
    summary: "List the part files next to a model and their exports",
    usage: "jscad-work parts <model>",
    options: {},
    help: [],
    run: async (args, ctx) => report(ctx, { parts: listParts(modelArg(args, ctx)) }),
  },
  "library search": {
    summary: "Search the model catalog by word, synonym, size, and kind",
    usage:
      "jscad-work library search [QUERY...] [--tags A,B] [--source S] [--lang scad|js] [--parametric] [--min-size N|X,Y,Z] [--max-size N|X,Y,Z] [--include-broken] [--limit N]",
    options: {
      tags: { type: "string" },
      source: { type: "string" },
      lang: { type: "string" },
      parametric: { type: "boolean" },
      "min-size": { type: "string" },
      "max-size": { type: "string" },
      "include-broken": { type: "boolean" },
      limit: { type: "string" },
    },
    help: [
      "  --tags A,B          require every tag",
      "  --source S          mcad, nopscadlib, bosl2, snippet, text, or jscad",
      "  --lang L            scad or js",
      "  --parametric        only entries that take parameter overrides",
      "  --min-size N|X,Y,Z  smallest dimensions in mm; N bounds every axis, an empty axis has no bound (e.g. 30,30,)",
      "  --max-size N|X,Y,Z  largest dimensions in mm, same form (e.g. ,,20 or --max-size=-,-,20)",
      "  --include-broken    also entries that failed to evaluate headlessly",
      "  --limit N           maximum results (default 20)",
    ],
    run: librarySearch,
  },
  "library get": {
    summary: "Show a catalog entry and the absolute path of its model file",
    usage: "jscad-work library get <id> [--with-source]",
    options: { "with-source": { type: "boolean" } },
    help: ["  --with-source       include the model file's text as source"],
    run: libraryGet,
  },
  "live-params": {
    summary: "Push parameter values into the open viewer tab (needs a running server)",
    usage: "jscad-work live-params [MODEL] JSON",
    options: { ...PARAMS },
    help: [
      "  MODEL               find the server's .jscad-studio from this model's directory upward",
      "                      (default: from the current directory upward)",
      "  JSON                parameter values, e.g. '{\"size\":33}' (or -p JSON)",
    ],
    run: liveParamsCmd,
  },
};

export const SUBCOMMANDS = new Set(Object.keys(COMMANDS).map((name) => name.split(" ")[0]));

export const commandSummary = () =>
  Object.entries(COMMANDS).map(([name, c]) => `  jscad-work ${name.padEnd(15)} ${c.summary}`);

const helpText = (c) => [c.usage, "", c.summary, ...(c.help.length ? ["", ...c.help] : [])];

const resolveCommand = (argv) => {
  if (argv[0] !== "library") return { name: argv[0], rest: argv.slice(1) };
  if (argv[1] === "search" || argv[1] === "get") {
    return { name: `library ${argv[1]}`, rest: argv.slice(2) };
  }
  if (argv[1] === undefined || argv[1] === "--help" || argv[1] === "-h") {
    return { name: "library", rest: ["--help"] };
  }
  return { name: "library", rest: [], error: `unknown library subcommand "${argv[1]}"` };
};

// Returns the process exit code: 0 ok, 1 model or runtime error, 2 usage error.
export const runCli = async (argv, io = {}) => {
  const ctx = {
    cwd: io.cwd ?? process.cwd(),
    stdout: io.stdout ?? ((s) => process.stdout.write(`${s}\n`)),
    stderr: io.stderr ?? ((s) => process.stderr.write(`${s}\n`)),
    catalog: io.catalog,
    render: io.render,
  };
  const { name, rest, error } = resolveCommand(argv);
  if (name === "library") {
    const lines = ["jscad-work library search|get", "", ...commandSummary().slice(-3, -1)];
    if (error) {
      ctx.stderr(`${error}\n${lines.join("\n")}`);
      return 2;
    }
    ctx.stdout(lines.join("\n"));
    return 0;
  }
  const command = COMMANDS[name];
  if (!command) {
    ctx.stderr(`unknown subcommand "${name}"`);
    return 2;
  }
  try {
    const args = parseArgs({
      args: rest,
      options: { ...HELP, ...command.options },
      allowPositionals: true,
      strict: true,
    });
    if (args.values.help) {
      ctx.stdout(helpText(command).join("\n"));
      return 0;
    }
    return await command.run(args, ctx);
  } catch (err) {
    if (err instanceof UsageError || err.code?.startsWith("ERR_PARSE_ARGS")) {
      ctx.stderr(`error: ${err.message}\nusage: ${command.usage}`);
      return 2;
    }
    ctx.stderr(`error: ${err.message}`);
    return 1;
  }
};
