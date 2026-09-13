import { basename } from "node:path";
import { cliToolCall, isJscadWorkSession } from "./transcript.js";

const errStr = (e) => (e && typeof e === "object" ? JSON.stringify(e) : String(e ?? ""));

const targetOf = (input) => {
  if (!input || typeof input !== "object") return "";
  return (
    input.modelPath || input.filePath || input.path || input.file || Object.values(input)[0] || ""
  );
};

const countRetries = (calls) => {
  let retries = 0;
  for (let i = 1; i < calls.length; i++) {
    if (
      calls[i].tool === calls[i - 1].tool &&
      targetOf(calls[i].input) === targetOf(calls[i - 1].input)
    )
      retries++;
  }
  return retries;
};

// Each kind matches a hazard named in the generated prompts (llm.txt or JSCAD.md).
// Tool inputs are JSON-stringified, so quotes inside code may carry a backslash.
const CONSTRAINTS = [
  { kind: "degrees", re: /\brotate\w*\s*\(\s*\[?[^)]*\b(45|90|135|180|270|360)\b/i },
  { kind: "color255", re: /\bcolor\w*\s*\(\s*\[?[^)]*\b(1\d\d|2[0-4]\d|25[0-5])\b/i },
  { kind: "segmentsHigh", re: /\bsegments\s*:\s*(?:1(?:29|[3-9]\d)|[2-9]\d\d|[1-9]\d{3,})\b/ },
  {
    kind: "zeroSize",
    re: /\b(?:height|radius|size)\s*:\s*\[?\s*-?0(?![.\d])|must be greater th[ae]n zero/,
  },
  {
    kind: "coincidentFaces",
    re: /\b(?:z-fighting|coplanar|coincident faces?|zero[- ]thickness|non-manifold)\b/i,
  },
  {
    kind: "emptyGeometry",
    re: /\\?"dimensions\\?"\s*:\s*\[\s*0\s*,\s*0\s*,\s*0\s*\]|\bempty geometry\b/i,
  },
  { kind: "choiceOptions", re: /type\s*:\s*\\?['"](?:choice|radio)\\?['"][^}]*\boptions\s*:/ },
  { kind: "plainParam", re: /(?<![\w.])(?:p|params)\.\w+\s*=\s*-?\d/ },
  { kind: "thinWall", re: /\bwall\w*\s*[:=]\s*0?\.\d+\b/i },
];

const isTool = (call, name) => new RegExp(`(^|[_.])${name}$`, "i").test(call.tool || "");
const pathOf = (input) => input?.file_path ?? input?.filePath ?? input?.path ?? "";

const VIEWS = ["front", "back", "left", "right", "top", "bottom", "iso"];

// PNG basenames a successful render wrote: from its JSON output when captured, else derived
// from the defaults of bin/jscad-work or, in older transcripts, the removed MCP render tool.
const renderPngs = (call) => {
  const reported = [...(call.output ?? "").matchAll(/"path"\s*:\s*"([^"]+?\.png)"/gi)];
  if (reported.length) return reported.map((m) => basename(m[1]));
  const { modelPath = "", output, view, outPath, size } = call.input ?? {};
  const model = basename(modelPath);
  if (call.via === "cli") {
    const views = view === "all" ? VIEWS : (view ?? "iso").split(",");
    if (!output) return views.map((v) => `${model}-${v}.png`);
    const out = basename(output);
    return views.length === 1 ? [out] : views.map((v) => out.replace(/(\.png)?$/i, `-${v}.png`));
  }
  if (outPath) return [basename(outPath)];
  const [w, h] = Array.isArray(size) ? size : [800, 600];
  return [`jscad-${model}-${view ?? "default"}-${w}x${h}.png`];
};

// A render counts as inspected when any PNG it wrote is Read later in the session.
const uninspectedRenders = (calls) => {
  const out = [];
  calls.forEach((call, i) => {
    if (!isTool(call, "render") || call.status === "error") return;
    const pngs = renderPngs(call);
    const read = calls
      .slice(i + 1)
      .some((c) => /^read$/i.test(c.tool || "") && pngs.includes(basename(pathOf(c.input))));
    if (!read) out.push({ pngs });
  });
  return out;
};

const MODEL_FILE = /\.(?:js|jscad|scad)$/i;
const madeModel = (calls) =>
  calls.some(
    (c) =>
      isTool(c, "eval") ||
      isTool(c, "render") ||
      isTool(c, "export") ||
      (/^(?:edit|write|multiedit)$/i.test(c.tool || "") && MODEL_FILE.test(pathOf(c.input))),
  );

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const SCALE = { mm: 1, cm: 10 };
const TRIPLE = new RegExp(
  String.raw`(?<![\w.])${NUM}\s*(?:mm)?\s*[x×]\s*${NUM}\s*(?:mm)?\s*[x×]\s*${NUM}\s*(mm|cm)?(?![\w.])`,
  "gi",
);
// Only overall-size words: "thick", "deep", and "diameter" usually describe walls and holes,
// which a bounding box never matches.
const SINGLE_AFTER = new RegExp(
  String.raw`(?<![\w.])${NUM}\s*(mm|cm)\s+(?:wide|long|tall|high|across)\b`,
  "gi",
);
const SINGLE_BEFORE = new RegExp(
  String.raw`\b(?:width|length|height)\s*(?:of|is|=|:)?\s*${NUM}\s*(mm|cm)\b`,
  "gi",
);

const userProse = (text) =>
  text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<([\w-]+)[^>]*>[\s\S]*?<\/\1>/g, " ")
    .replace(/`[^`]*`/g, " ");

// Stated mm targets in a user message: "40x20x10", "40 mm wide", "height of 3 cm".
export const extractTargets = (text) => {
  let prose = userProse(text);
  const targets = [];
  for (const m of prose.matchAll(TRIPLE)) {
    const k = SCALE[(m[4] || "mm").toLowerCase()];
    targets.push({ values: [m[1], m[2], m[3]].map((v) => Number(v) * k), snippet: m[0].trim() });
  }
  prose = prose.replace(TRIPLE, " ");
  for (const re of [SINGLE_AFTER, SINGLE_BEFORE]) {
    for (const m of prose.matchAll(re)) {
      targets.push({ values: [Number(m[1]) * SCALE[m[2].toLowerCase()]], snippet: m[0].trim() });
    }
  }
  return targets;
};

const DIMENSIONS =
  /"dimensions"\s*:\s*\[\s*(-?[\d.e+-]+)\s*,\s*(-?[\d.e+-]+)\s*,\s*(-?[\d.e+-]+)\s*\]/g;
const measuredDimensions = (calls) =>
  calls
    .filter((c) => isTool(c, "measure") && c.status !== "error")
    .flatMap((c) =>
      [...(c.output ?? "").matchAll(DIMENSIONS)].map((m) => m.slice(1, 4).map(Number)),
    );

const near = (a, b) => Math.abs(a - b) <= Math.max(0.5, b * 0.02);
const sortNum = (xs) => [...xs].sort((a, b) => a - b);
const matches = (target, dims) =>
  target.length === 3
    ? sortNum(dims).every((d, i) => near(d, sortNum(target)[i]))
    : dims.some((d) => near(d, target[0]));

// Targets are compared only when the session measured something; noVerify covers the rest.
const targetMisses = (turns, dims) => {
  if (!dims.length) return [];
  const targets = turns
    .filter((turn) => turn.role === "user" && !turn.toolCalls?.length)
    .flatMap((turn) => extractTargets(turn.text || ""));
  return targets
    .filter((t) => !dims.some((d) => matches(t.values, d)))
    .map((t) => ({ target: t.snippet.slice(0, 40), lastMeasured: dims.at(-1) }));
};

export const analyzeFriction = (t) => {
  const calls = t.turns.flatMap((turn) => turn.toolCalls || []).map(cliToolCall);
  const errors = calls.filter((c) => c.status === "error");
  const evalErrors = errors.filter((c) => isTool(c, "eval"));
  const sample = (arr) =>
    arr.slice(0, 5).map((c) => ({ tool: c.tool, error: errStr(c.error).slice(0, 200) }));

  const text = t.turns.map((turn) => turn.text || "").join("\n");
  const usedJscadWork = calls.some((c) => /jscad/i.test(c.tool || "")) || /jscad-work/.test(text);
  const startConfusion =
    /how (do|to)\b.*\b(start|run|launch)/i.test(text) || /which (file|model)/i.test(text);
  const jscadSession = isJscadWorkSession(t);
  const bootstrapMiss = jscadSession && !usedJscadWork && startConfusion;

  const constraintHits = [];
  for (const turn of t.turns) {
    const hay = `${turn.text || ""} ${JSON.stringify(turn.toolCalls?.map((c) => c.input) ?? "")}`;
    for (const { kind, re } of CONSTRAINTS) {
      const m = hay.match(re);
      if (m) constraintHits.push({ kind, snippet: m[0].slice(0, 80) });
    }
  }

  const verified = calls.some((c) => isTool(c, "measure") || isTool(c, "check"));
  const signals = {
    toolErrors: { count: errors.length, samples: sample(errors) },
    evalErrors: { count: evalErrors.length, samples: sample(evalErrors) },
    retries: countRetries(calls),
    compactions: t.events?.compactions ?? 0,
    bootstrapMiss,
    constraintHits,
    noVerify: jscadSession && madeModel(calls) && !verified,
    uninspectedRenders: uninspectedRenders(calls),
    targetMisses: targetMisses(t.turns, measuredDimensions(calls)),
  };
  const score =
    signals.evalErrors.count * 5 +
    (signals.toolErrors.count - signals.evalErrors.count) * 2 +
    signals.retries * 3 +
    signals.compactions * 1 +
    (signals.bootstrapMiss ? 4 : 0) +
    signals.constraintHits.length * 2 +
    (signals.noVerify ? 3 : 0) +
    signals.uninspectedRenders.length * 2 +
    signals.targetMisses.length * 3;
  return { sessionId: t.sessionId, agent: t.agent, cwd: t.cwd, signals, score };
};
