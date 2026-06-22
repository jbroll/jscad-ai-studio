import { existsSync } from "node:fs";
import { join } from "node:path";

// Normalize a time field that may be a number or { created }.
export const ts = (x) => (typeof x === "number" ? x : (x?.created ?? 0));

// A jscad-work session: cwd holds JSCAD.md/AGENTS.md, or a jscad tool was used.
export const isJscadWorkSession = (t) => {
  if (t.cwd && (existsSync(join(t.cwd, "JSCAD.md")) || existsSync(join(t.cwd, "AGENTS.md"))))
    return true;
  return t.turns.some((turn) => turn.toolCalls.some((c) => /jscad/i.test(c.tool || "")));
};
