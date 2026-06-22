import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeFriction } from "./lib/friction.js";
import { llmFriction } from "./lib/friction-llm.js";
import { renderReport } from "./lib/session-report.js";
import { isJscadWorkSession } from "./lib/transcript.js";
import { readClaudeSessions } from "./lib/transcript-claude.js";
import { readOpencodeSessions } from "./lib/transcript-opencode.js";

const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

const main = async () => {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const useLlm = args.includes("--llm");
  const toStdout = args.includes("--stdout");

  const sessions = [...readOpencodeSessions(), ...readClaudeSessions()];
  const filtered = all ? sessions : sessions.filter(isJscadWorkSession);
  console.error(
    `analyzing ${filtered.length}/${sessions.length} sessions${all ? "" : " (jscad-work; --all for all)"}`,
  );

  let client = null;
  if (useLlm && process.env.OLLAMA_HOST) {
    const { makeOllamaClient } = await import("./lib/ollama-client.js");
    client = makeOllamaClient({ host: process.env.OLLAMA_HOST, model: process.env.OLLAMA_MODEL });
  } else if (useLlm) {
    console.error("--llm set but OLLAMA_HOST is not — falling back to heuristics-only");
  }

  const results = [];
  for (const t of filtered) {
    const r = analyzeFriction(t);
    if (client) {
      try {
        r.llm = await llmFriction(client, t);
      } catch (e) {
        console.error(`llm failed for ${t.sessionId}: ${e.message}`);
      }
    }
    results.push(r);
  }

  const md = renderReport(results);
  if (toStdout) {
    process.stdout.write(`${md}\n`);
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  const outDir = resolve(PLUGIN_ROOT, "docs/session-analysis");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${date}-friction.md`);
  writeFileSync(outPath, `${md}\n`);
  console.error(`wrote ${outPath}`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
