import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeModel } from "./lib/describe.js";
import { enumerateModels } from "./lib/enumerate.js";
import { verifyModel } from "./lib/verify.js";

const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const JSCADUI_ROOT = resolve(PLUGIN_ROOT, "../jscadui");
const EXAMPLES = resolve(JSCADUI_ROOT, "apps/jscad-web/examples");
const CATALOG = resolve(PLUGIN_ROOT, "catalog/catalog.json");

export const SOURCES = {
  jscad: { dir: "jscad", ext: ".example.js" },
  mcad: { dir: "openscad/mcad", ext: ".scad" },
  nopscadlib: { dir: "openscad/nopscadlib", ext: ".scad" },
  bosl2: { dir: "openscad/bosl2", ext: ".scad", skipFile: "openscad/bosl2/skip.txt" },
  snippet: { dir: "openscad/snippet", ext: ".scad" },
  text: { dir: "openscad/text", ext: ".scad" },
};

export const buildCatalog = async ({
  models,
  existing = [],
  verify,
  describe,
  hashOf,
  concurrency = 6,
}) => {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const report = {};
  const entries = [];
  let i = 0;
  const worker = async () => {
    while (i < models.length) {
      const m = models[i++];
      const srcHash = hashOf(m);
      const prev = byId.get(m.id);
      let entry;
      if (prev && prev.srcHash === srcHash) {
        entry = prev;
      } else {
        const v = await verify(m);
        const d = await describe(m);
        entry = { id: m.id, path: m.path, lang: m.lang, source: m.source, ...d, ...v, srcHash };
      }
      if (entry.failureClass) report[entry.failureClass] = (report[entry.failureClass] || 0) + 1;
      entries.push(entry);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, models.length || 1) }, worker));
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return { entries, report };
};

const main = async () => {
  // Choose the description backend by environment:
  //   OLLAMA_HOST set      -> Ollama on a local/remote GPU host (no key, no subscription)
  //   ANTHROPIC_API_KEY set -> Anthropic API
  //   otherwise            -> the logged-in `claude` CLI (Pro/Max subscription auth)
  let client;
  if (process.env.OLLAMA_HOST) {
    const { makeOllamaClient } = await import("./lib/ollama-client.js");
    client = makeOllamaClient({ host: process.env.OLLAMA_HOST, model: process.env.OLLAMA_MODEL });
    console.log(
      `describe: Ollama (${process.env.OLLAMA_HOST}, model ${process.env.OLLAMA_MODEL ?? "qwen2.5-coder"})`,
    );
  } else if (process.env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic();
    console.log("describe: Anthropic API (ANTHROPIC_API_KEY set)");
  } else {
    const { makeClaudeCliClient } = await import("./lib/claude-cli-client.js");
    client = makeClaudeCliClient();
    console.log("describe: claude CLI (subscription auth, no API key)");
  }
  const force = process.argv.includes("--force");
  const models = enumerateModels(EXAMPLES, SOURCES, JSCADUI_ROOT);
  const existing = !force && existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : [];
  const hashOf = (m) =>
    createHash("sha256")
      .update(readFileSync(resolve(JSCADUI_ROOT, m.path), "utf8"))
      .digest("hex");
  let done = 0;
  const { entries, report } = await buildCatalog({
    models,
    existing,
    verify: (m) => verifyModel(resolve(JSCADUI_ROOT, m.path)),
    describe: (m) =>
      describeModel(client, {
        source: readFileSync(resolve(JSCADUI_ROOT, m.path), "utf8"),
        id: m.id,
      }),
    hashOf,
  });
  for (const e of entries) if (++done) process.stdout.write(`\r${done}/${entries.length}`);
  writeFileSync(CATALOG, JSON.stringify(entries, null, 2) + "\n");
  process.stdout.write(`\nwrote ${entries.length} entries\n`);
  console.log("gap report (failures by class):", report);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
