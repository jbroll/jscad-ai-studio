export const MODEL = "claude-haiku-4-5-20251001";
const MAX_SOURCE = 6000;

export const buildPrompt = ({ source, id }) =>
  `You are cataloging a CAD model file (id: ${id}) so other users can SEARCH for and reuse it. ` +
  `Read its source and reply with ONLY a JSON object (no prose, no markdown code fences):\n` +
  `{"name": short human title, ` +
  `"description": ONE concise sentence describing WHAT the object is and its purpose — start with the object/noun (e.g. "Parametric spur gear...", "A 608 ball bearing..."). NEVER use the phrase "CAD model" or "a model of". Do NOT enumerate specific dimension values, ` +
  `"tags": specific lowercase PART/DOMAIN nouns a user would search for (e.g. "bearing","gear","nema17","enclosure","608"). EXCLUDE generic filler ("cad","3d","model","parametric","design"), colors ("red","lightgreen"), and operation names ("translate","union"), ` +
  `"techniques": bare GEOMETRY operation/primitive names ACTUALLY used — no arguments or parentheses (e.g. "difference","union","hull","minkowski","rotate_extrude","linear_extrude","for","polyhedron"). Write "align" not "align(RIGHT)". EXCLUDE math/utility functions ("max","min","len","sin") and vague phrases ("3d modeling","parametric design")}.\n\n` +
  `SOURCE:\n${source.slice(0, MAX_SOURCE)}`;

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
