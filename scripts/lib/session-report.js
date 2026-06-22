const PROMPTS = ["AGENTS.md", "JSCAD.md", "llm.txt", "skill"];

export const renderReport = (results) => {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const total = sorted.length;
  const withErrors = sorted.filter((r) => r.signals.toolErrors.count > 0).length;
  const evalErrs = sorted.reduce((n, r) => n + r.signals.evalErrors.count, 0);

  const lines = [];
  lines.push("# Session Friction Report", "");
  lines.push("## Summary", "");
  lines.push(`- ${total} sessions analyzed`);
  lines.push(`- ${withErrors} with tool errors; ${evalErrs} eval failures total`);
  lines.push(`- ${sorted.filter((r) => r.signals.bootstrapMiss).length} bootstrap misses`);
  lines.push("");

  // By prompt: collect LLM promptFixes + deterministic mappings
  lines.push("## By prompt", "");
  const byPrompt = Object.fromEntries(PROMPTS.map((p) => [p, []]));
  for (const r of sorted) {
    if (r.signals.bootstrapMiss)
      byPrompt["AGENTS.md"].push(`${r.sessionId}: started without running jscad-work`);
    for (const h of r.signals.constraintHits)
      byPrompt["llm.txt"].push(`${r.sessionId}: possible ${h.kind} — \`${h.snippet}\``);
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
    "| score | agent | session | eval err | tool err | retries | compactions | bootstrap | cwd |",
  );
  lines.push("|--:|---|---|--:|--:|--:|--:|:-:|---|");
  for (const r of sorted) {
    const s = r.signals;
    lines.push(
      `| ${r.score} | ${r.agent} | ${r.sessionId} | ${s.evalErrors.count} | ${s.toolErrors.count} | ${s.retries} | ${s.compactions} | ${s.bootstrapMiss ? "✗" : ""} | ${r.cwd ?? ""} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
};
