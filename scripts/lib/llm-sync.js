import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LLM_TXT, STUDIO_ROOT } from "../../mcp/lib/workspace.js";

export const UPSTREAM_LLM_TXT = resolve(STUDIO_ROOT, "../jscad-fluent/llm.txt");

export const SYNC_HINT =
  "docs/reference/jscad-fluent-llm.txt differs from ../jscad-fluent/llm.txt; run npm run sync-llm";

export const llmInSync = (from = UPSTREAM_LLM_TXT, to = LLM_TXT) =>
  readFileSync(from, "utf8") === readFileSync(to, "utf8");

// Returns false when there is no upstream file to copy.
export const syncLlm = (from = UPSTREAM_LLM_TXT, to = LLM_TXT) => {
  if (!existsSync(from)) return false;
  copyFileSync(from, to);
  return true;
};
