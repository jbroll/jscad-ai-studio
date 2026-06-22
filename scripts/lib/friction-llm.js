const MAX_TEXT = 6000;

const errStr = (e) => (e && typeof e === "object" ? JSON.stringify(e) : String(e ?? ""));

const condense = (t) => {
  const lines = [];
  for (const turn of t.turns) {
    if (turn.text) lines.push(`${turn.role}: ${turn.text}`);
    for (const c of turn.toolCalls || []) {
      lines.push(
        `  tool ${c.tool} -> ${c.status}${c.status === "error" ? `: ${errStr(c.error).slice(0, 200)}` : ""}`,
      );
    }
  }
  return lines.join("\n").slice(0, MAX_TEXT);
};

const buildPrompt = (t) =>
  `You are improving the prompts that guide an AI through a jscad-fluent CAD modeling session ` +
  `(prompts: AGENTS.md = startup/bootstrap, JSCAD.md = session context, llm.txt = jscad-fluent API, skill = library search). ` +
  `Read this ${t.agent} session transcript and reply with ONLY JSON (no prose, no fences): ` +
  `{"summary": one sentence on where the agent struggled, ` +
  `"promptFixes": [{"prompt": one of "AGENTS.md"|"JSCAD.md"|"llm.txt"|"skill", "issue": short, "suggestion": concrete edit}]}. ` +
  `Empty promptFixes if the session was smooth.\n\nTRANSCRIPT:\n${condense(t)}`;

const tryParse = (text) => {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    const o = JSON.parse(m ? m[0] : text);
    return {
      summary: String(o.summary ?? ""),
      promptFixes: Array.isArray(o.promptFixes) ? o.promptFixes : [],
    };
  } catch {
    return null;
  }
};

export const llmFriction = async (client, t) => {
  const ask = async () => {
    const res = await client.messages.create({
      model: undefined,
      max_tokens: 500,
      messages: [{ role: "user", content: buildPrompt(t) }],
    });
    const text = res.content?.map((b) => b.text ?? "").join("") ?? "";
    return tryParse(text);
  };
  return (await ask()) ?? (await ask()) ?? { summary: "", promptFixes: [] };
};
