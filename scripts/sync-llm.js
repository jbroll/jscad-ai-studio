import { syncLlm, UPSTREAM_LLM_TXT } from "./lib/llm-sync.js";

if (!syncLlm()) {
  console.error(`error: ${UPSTREAM_LLM_TXT} not found; clone jscad-fluent beside this repo`);
  process.exit(1);
}
console.log(`copied ${UPSTREAM_LLM_TXT} to docs/reference/jscad-fluent-llm.txt`);
