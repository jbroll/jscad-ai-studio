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

export const analyzeFriction = (t) => {
  const calls = t.turns.flatMap((turn) => turn.toolCalls || []).map(cliToolCall);
  const errors = calls.filter((c) => c.status === "error");
  const evalErrors = errors.filter((c) => /(^|[_.])eval$/i.test(c.tool || ""));
  const sample = (arr) =>
    arr.slice(0, 5).map((c) => ({ tool: c.tool, error: errStr(c.error).slice(0, 200) }));

  const text = t.turns.map((turn) => turn.text || "").join("\n");
  const usedJscadWork = calls.some((c) => /jscad/i.test(c.tool || "")) || /jscad-work/.test(text);
  const startConfusion =
    /how (do|to)\b.*\b(start|run|launch)/i.test(text) || /which (file|model)/i.test(text);
  const bootstrapMiss = isJscadWorkSession(t) && !usedJscadWork && startConfusion;

  const constraintHits = [];
  for (const turn of t.turns) {
    const hay = `${turn.text || ""} ${JSON.stringify(turn.toolCalls?.map((c) => c.input) ?? "")}`;
    for (const { kind, re } of CONSTRAINTS) {
      const m = hay.match(re);
      if (m) constraintHits.push({ kind, snippet: m[0].slice(0, 80) });
    }
  }

  const signals = {
    toolErrors: { count: errors.length, samples: sample(errors) },
    evalErrors: { count: evalErrors.length, samples: sample(evalErrors) },
    retries: countRetries(calls),
    compactions: t.events?.compactions ?? 0,
    bootstrapMiss,
    constraintHits,
  };
  const score =
    signals.evalErrors.count * 5 +
    (signals.toolErrors.count - signals.evalErrors.count) * 2 +
    signals.retries * 3 +
    signals.compactions * 1 +
    (signals.bootstrapMiss ? 4 : 0) +
    signals.constraintHits.length * 2;
  return { sessionId: t.sessionId, agent: t.agent, cwd: t.cwd, signals, score };
};
