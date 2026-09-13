import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Normalize a time field that may be a number or { created }.
export const ts = (x) => (typeof x === "number" ? x : (x?.created ?? 0));

// Tool output is kept only to read measure dimensions and render paths, which come early.
export const OUTPUT_LIMIT = 4000;

const CLI_TOOLS = {
  eval: "eval",
  params: "params",
  measure: "measure",
  check: "check",
  export: "export",
  render: "render",
  parts: "parts",
  "live-params": "live_params",
  "library search": "library_search",
  "library get": "library_get",
};

const CLI_RE =
  /^(?:(?:nohup|time|nice|command|timeout\s+\S+)\s+)*(?:node\s+)?(?:\S*\/)?jscad-work(?:\.js)?\s+(library\s+(?:search|get)|eval|params|measure|check|export|render|parts|live-params)(?=\s|$)(.*)$/s;

const unquote = (w) => w?.replace(/^['"]|['"]$/g, "");

const flagValue = (words, names) => {
  for (const [i, w] of words.entries()) {
    for (const n of names) {
      if (w === n) return unquote(words[i + 1]);
      if (w.startsWith(`${n}=`)) return unquote(w.slice(n.length + 1));
    }
  }
  return undefined;
};

const cliInput = (name, rest) => {
  const words = rest.match(/'[^']*'|"(?:\\.|[^"])*"|\S+/g) ?? [];
  const positionals = words.filter((w) => !w.startsWith("-")).map(unquote);
  if (name === "library_search") return { query: positionals.join(" ") };
  if (name === "library_get") return { id: positionals[0] };
  if (name === "live_params") return { params: positionals.at(-1) };
  if (name === "render") {
    return {
      modelPath: positionals[0],
      output: flagValue(words, ["-o", "--output"]),
      view: flagValue(words, ["--view"]),
    };
  }
  return { modelPath: positionals[0] };
};

// A Bash call to a jscad-work model subcommand becomes the MCP tool call it replaced,
// named like OpenCode's `jscad-studio_eval`, so old and new transcripts score alike.
export const cliToolCall = (call) => {
  if (!/^bash$/i.test(call?.tool || "") || typeof call.input?.command !== "string") return call;
  for (const segment of call.input.command.split(/&&|\|\||;|\||\n/)) {
    const m = segment.trim().match(CLI_RE);
    if (!m) continue;
    const name = CLI_TOOLS[m[1].replace(/\s+/, " ")];
    return { ...call, tool: `jscad-studio_${name}`, via: "cli", input: cliInput(name, m[2]) };
  }
  return call;
};

// Many unrelated repos carry an AGENTS.md, so only one that mentions jscad marks the session.
const jscadAgentsMd = (dir) => {
  try {
    return /jscad/i.test(readFileSync(join(dir, "AGENTS.md"), "utf8"));
  } catch {
    return false;
  }
};

// A jscad-work session: cwd holds JSCAD.md or a jscad AGENTS.md, or a jscad tool was used.
export const isJscadWorkSession = (t) => {
  if (t.cwd && (existsSync(join(t.cwd, "JSCAD.md")) || jscadAgentsMd(t.cwd))) return true;
  return t.turns?.some((turn) =>
    turn.toolCalls?.some((c) => /jscad/i.test(cliToolCall(c).tool || "")),
  );
};
