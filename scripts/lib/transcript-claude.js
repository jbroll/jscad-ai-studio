import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_PROJECTS = join(homedir(), ".claude/projects");

// "-home-john-src-foo" -> "/home/john/src/foo" (best-effort; used only for filtering/labeling)
const decodeCwd = (name) => `/${name.replace(/^-/, "").replace(/-/g, "/")}`;

export const readClaudeSessions = ({ projectsDir = DEFAULT_PROJECTS } = {}) => {
  if (!existsSync(projectsDir)) return [];
  const out = [];
  for (const proj of readdirSync(projectsDir)) {
    const dir = join(projectsDir, proj);
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const file of files) {
      const turns = [];
      const pending = new Map();
      let model = null;
      let compactions = 0;
      let startedAt = null;
      for (const line of readFileSync(join(dir, file), "utf8").split("\n")) {
        if (!line.trim()) continue;
        let rec;
        try {
          rec = JSON.parse(line);
        } catch {
          continue;
        }
        if (rec.isCompactSummary || rec.type === "summary") {
          compactions++;
          continue;
        }
        if (rec.type !== "user" && rec.type !== "assistant") continue;
        if (startedAt === null && rec.timestamp) startedAt = Date.parse(rec.timestamp) || null;
        const msg = rec.message || {};
        model = model || msg.model || null;
        let text = "";
        const toolCalls = [];
        const content = msg.content;
        if (typeof content === "string") text = content;
        else if (Array.isArray(content)) {
          for (const b of content) {
            if (b.type === "text") text += `${b.text}\n`;
            else if (b.type === "tool_use") {
              const c = { tool: b.name, status: "ok", input: b.input };
              pending.set(b.id, c);
              toolCalls.push(c);
            } else if (b.type === "tool_result") {
              const c = pending.get(b.tool_use_id);
              if (c && b.is_error) {
                c.status = "error";
                c.error = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
              }
            }
          }
        }
        if (text.trim() || toolCalls.length)
          turns.push({ role: rec.type, text: text.trim(), toolCalls });
      }
      out.push({
        agent: "claude",
        sessionId: file.replace(/\.jsonl$/, ""),
        cwd: decodeCwd(proj),
        model,
        startedAt,
        turns,
        events: { compactions },
      });
    }
  }
  return out;
};
