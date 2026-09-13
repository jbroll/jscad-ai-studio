import { existsSync } from "node:fs";
import { join } from "node:path";

// Normalize a time field that may be a number or { created }.
export const ts = (x) => (typeof x === "number" ? x : (x?.created ?? 0));

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

const cliInput = (name, rest) => {
  const words = rest.match(/'[^']*'|"(?:\\.|[^"])*"|\S+/g) ?? [];
  const positionals = words
    .filter((w) => !w.startsWith("-"))
    .map((w) => w.replace(/^['"]|['"]$/g, ""));
  if (name === "library_search") return { query: positionals.join(" ") };
  if (name === "library_get") return { id: positionals[0] };
  if (name === "live_params") return { params: positionals.at(-1) };
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
    return { ...call, tool: `jscad-studio_${name}`, input: cliInput(name, m[2]) };
  }
  return call;
};

// A jscad-work session: cwd holds JSCAD.md/AGENTS.md, or a jscad tool was used.
export const isJscadWorkSession = (t) => {
  if (t.cwd && (existsSync(join(t.cwd, "JSCAD.md")) || existsSync(join(t.cwd, "AGENTS.md"))))
    return true;
  return t.turns?.some((turn) =>
    turn.toolCalls?.some((c) => /jscad/i.test(cliToolCall(c).tool || "")),
  );
};
