import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ts } from "./transcript.js";

const DEFAULT_STORAGE = join(homedir(), ".local/share/opencode/storage");
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const listJson = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

export const readOpencodeSessions = ({ storageDir = DEFAULT_STORAGE } = {}) => {
  const sessRoot = join(storageDir, "session");
  if (!existsSync(sessRoot)) return [];
  const out = [];
  for (const projDir of readdirSync(sessRoot)) {
    for (const sf of listJson(join(sessRoot, projDir))) {
      const session = readJson(join(sessRoot, projDir, sf));
      if (!session?.id) continue;
      const sessionId = session.id;
      const msgDir = join(storageDir, "message", sessionId);
      const messages = listJson(msgDir)
        .map((m) => readJson(join(msgDir, m)))
        .filter(Boolean)
        .sort((a, b) => ts(a.time) - ts(b.time));
      const turns = [];
      let compactions = 0;
      let model = session.model ?? null;
      for (const msg of messages) {
        model = model || msg.model || null;
        const partDir = join(storageDir, "part", msg.id);
        const parts = listJson(partDir)
          .map((p) => readJson(join(partDir, p)))
          .filter(Boolean)
          .sort((a, b) => ts(a.time) - ts(b.time));
        let text = "";
        const toolCalls = [];
        for (const part of parts) {
          if (part.type === "text" || part.type === "reasoning") text += `${part.text || ""}\n`;
          else if (part.type === "tool")
            toolCalls.push({
              tool: part.tool,
              status: part.state?.status === "error" ? "error" : "ok",
              error: part.state?.error,
              input: part.state?.input,
            });
          else if (part.type === "compaction") compactions++;
        }
        turns.push({ role: msg.role, text: text.trim(), toolCalls });
      }
      out.push({
        agent: "opencode",
        sessionId,
        cwd: session.directory ?? null,
        model,
        startedAt: ts(session.time) || null,
        turns,
        events: { compactions },
      });
    }
  }
  return out;
};
