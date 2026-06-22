export const MODEL = "claude-haiku-4-5-20251001";
const MAX_SOURCE = 6000;

export const buildPrompt = ({ source, id }) =>
  `You are cataloging a CAD model file (id: ${id}). Read its source and reply with ONLY a JSON object: ` +
  `{"name": short title, "description": one paragraph of what it models, "tags": [lowercase nouns], "techniques": [cad techniques used]}. ` +
  `No prose, no code fences.\n\nSOURCE:\n${source.slice(0, MAX_SOURCE)}`;

const tryParse = (text) => {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    const o = JSON.parse(m ? m[0] : text);
    if (typeof o.name !== "string") return null;
    return {
      name: o.name,
      description: String(o.description ?? ""),
      tags: Array.isArray(o.tags) ? o.tags : [],
      techniques: Array.isArray(o.techniques) ? o.techniques : [],
    };
  } catch {
    return null;
  }
};

export const describeModel = async (client, { source, id }) => {
  const ask = async () => {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: buildPrompt({ source, id }) }],
    });
    const text = res.content?.map((b) => b.text ?? "").join("") ?? "";
    return tryParse(text);
  };
  return (await ask()) ?? (await ask()) ?? { name: id, description: "", tags: [], techniques: [] };
};
