import { homedir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS = ["AGENTS.md", "JSCAD.md", "llm.txt", "skill"];
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

// degrees and color255 are llm.txt constraints; every other kind is a JSCAD.md rule.
const LLM_TXT_KINDS = new Set(["degrees", "color255"]);
const promptForKind = (kind) => (LLM_TXT_KINDS.has(kind) ? "llm.txt" : "JSCAD.md");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The report is committed, and snippets and cwds come straight from transcripts.
export const redact = (text, { repoRoot = REPO_ROOT, home = homedir() } = {}) =>
  text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>")
    .replace(
      /\b(?:sk-[\w-]{16,}|gh[pousr]_\w{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,})/g,
      "<secret>",
    )
    .replace(/\b(?=[\w+/-]*\d)(?=[\w+/-]*[A-Za-z])[\w+/-]{40,}/g, "<secret>")
    .replace(new RegExp(`${escapeRe(repoRoot)}(?=/|\\b)/?`, "g"), "./")
    .replace(new RegExp(`${escapeRe(home)}/src(?=/|\\b)`, "g"), "~/src")
    .replace(/(?<![\w.~:/<>-])\/(?:[\w.@+-]+\/)+([\w.@+-]+)/g, "…/$1");

const count = (r, key) => r.signals[key]?.length ?? 0;

export const renderReport = (results, opts = {}) => {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const total = sorted.length;
  const withErrors = sorted.filter((r) => r.signals.toolErrors.count > 0).length;
  const evalErrs = sorted.reduce((n, r) => n + r.signals.evalErrors.count, 0);
  const sum = (key) => sorted.reduce((n, r) => n + count(r, key), 0);
  const sessionsWith = (key) => sorted.filter((r) => count(r, key) > 0).length;

  const lines = [];
  lines.push("# Session Friction Report", "");
  lines.push("## Summary", "");
  lines.push(`- ${total} sessions analyzed`);
  lines.push(`- ${withErrors} with tool errors; ${evalErrs} eval failures total`);
  lines.push(`- ${sorted.filter((r) => r.signals.bootstrapMiss).length} bootstrap misses`);
  lines.push(
    `- ${sorted.filter((r) => r.signals.noVerify).length} built a model without measure or check`,
  );
  lines.push(
    `- ${sum("uninspectedRenders")} renders never Read, in ${sessionsWith("uninspectedRenders")} sessions`,
  );
  lines.push(
    `- ${sum("targetMisses")} stated targets never matched a measurement, in ${sessionsWith("targetMisses")} sessions`,
  );
  lines.push("");

  // By prompt: collect LLM promptFixes + deterministic mappings
  lines.push("## By prompt", "");
  const byPrompt = Object.fromEntries(PROMPTS.map((p) => [p, []]));
  for (const r of sorted) {
    const s = r.signals;
    if (s.bootstrapMiss)
      byPrompt["AGENTS.md"].push(`${r.sessionId}: started without running jscad-work`);
    for (const h of s.constraintHits)
      byPrompt[promptForKind(h.kind)].push(`${r.sessionId}: possible ${h.kind} — \`${h.snippet}\``);
    if (s.noVerify)
      byPrompt.skill.push(`${r.sessionId}: built a model without jscad-work measure or check`);
    for (const u of s.uninspectedRenders ?? [])
      byPrompt.skill.push(`${r.sessionId}: render never Read — \`${u.pngs.join(", ")}\``);
    for (const m of s.targetMisses ?? [])
      byPrompt.skill.push(
        `${r.sessionId}: target \`${m.target}\` never measured; last dimensions [${m.lastMeasured.join(", ")}]`,
      );
    for (const fix of r.llm?.promptFixes ?? []) {
      const key = PROMPTS.includes(fix.prompt) ? fix.prompt : "JSCAD.md";
      byPrompt[key].push(`${r.sessionId}: ${fix.issue} → ${fix.suggestion}`);
    }
  }
  for (const p of PROMPTS) {
    if (!byPrompt[p].length) continue;
    lines.push(`### ${p}`, "");
    for (const item of byPrompt[p]) lines.push(`- ${item}`);
    lines.push("");
  }

  lines.push("## Sessions (by score)", "");
  lines.push(
    "| score | agent | session | eval err | tool err | retries | compactions | bootstrap | no verify | unread renders | target misses | cwd |",
  );
  lines.push("|--:|---|---|--:|--:|--:|--:|:-:|:-:|--:|--:|---|");
  for (const r of sorted) {
    const s = r.signals;
    lines.push(
      `| ${r.score} | ${r.agent} | ${r.sessionId} | ${s.evalErrors.count} | ${s.toolErrors.count} | ${s.retries} | ${s.compactions} | ${s.bootstrapMiss ? "✗" : ""} | ${s.noVerify ? "✗" : ""} | ${count(r, "uninspectedRenders")} | ${count(r, "targetMisses")} | ${r.cwd ?? ""} |`,
    );
  }
  lines.push("");

  lines.push("## Signals", "");
  lines.push(
    "- no verify: a jscad-work session that ran eval, render, or export, or edited a `.js`, `.jscad`, or `.scad` file, with no measure or check call in either the CLI or MCP form.",
    "- unread renders: a successful render none of whose PNGs (by file name, from its output or its flags' defaults) is opened by a later Read (Claude) or read (OpenCode) call. Looking at the open browser tab instead is not seen.",
    "- target misses: numbers stated in user messages as `AxBxC` or `N mm wide|long|tall|high|across` or `width|length|height N mm`, compared with every `dimensions` a measure returned, within 2% or 0.5 mm. It compares against whole-model bounding boxes, so a part-level target in an assembly session is a false miss, and thickness, depth, and diameter are not extracted.",
    "- Paths outside this repo and `~/src`, email addresses, and token-like strings are redacted.",
  );
  lines.push("");
  return redact(lines.join("\n"), opts);
};
