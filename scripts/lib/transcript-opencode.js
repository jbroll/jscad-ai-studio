import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { OUTPUT_LIMIT, ts } from "./transcript.js";

const DATA_DIR = join(homedir(), ".local/share/opencode");
const DEFAULT_STORAGE = join(DATA_DIR, "storage");
const DEFAULT_DB = join(DATA_DIR, "opencode.db");

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const listJson = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];

const turnFromParts = (role, parts) => {
  let text = "";
  let compactions = 0;
  const toolCalls = [];
  for (const part of parts) {
    if (part.type === "text" || part.type === "reasoning") text += `${part.text || ""}\n`;
    else if (part.type === "tool") {
      const call = {
        tool: part.tool,
        status: part.state?.status === "error" ? "error" : "ok",
        error: part.state?.error,
        input: part.state?.input,
      };
      if (typeof part.state?.output === "string")
        call.output = part.state.output.slice(0, OUTPUT_LIMIT);
      toolCalls.push(call);
    } else if (part.type === "compaction") compactions++;
  }
  return { turn: { role, text: text.trim(), toolCalls }, compactions };
};

// OpenCode before mid-2026: one JSON file per session, message, and part.
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
        const r = turnFromParts(msg.role, parts);
        turns.push(r.turn);
        compactions += r.compactions;
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

const parseJson = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// OpenCode from mid-2026 keeps everything in one SQLite file. The part table runs to gigabytes,
// so `prefilter` keeps only sessions whose parts contain `text` or whose directory passes `dir`.
export const readOpencodeDbSessions = async ({ dbPath = DEFAULT_DB, prefilter } = {}) => {
  if (!existsSync(dbPath)) return [];
  // Vite, under vitest, does not know node:sqlite as a builtin and fails an import of it.
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    let sessions = db
      .prepare("select id, directory, model, time_created from session order by time_created")
      .all();
    if (prefilter) {
      const hits = new Set(
        db
          .prepare("select distinct session_id from part where data like ?")
          .all(`%${prefilter.text}%`)
          .map((r) => r.session_id),
      );
      sessions = sessions.filter((s) => hits.has(s.id) || prefilter.dir?.(s.directory));
    }
    const messagesOf = db.prepare(
      "select id, data from message where session_id = ? order by time_created, id",
    );
    const partsOf = db.prepare("select data from part where message_id = ? order by id");
    return sessions.map((s) => {
      const turns = [];
      let compactions = 0;
      for (const m of messagesOf.all(s.id)) {
        const parts = partsOf
          .all(m.id)
          .map((p) => parseJson(p.data))
          .filter(Boolean);
        const r = turnFromParts(parseJson(m.data)?.role, parts);
        turns.push(r.turn);
        compactions += r.compactions;
      }
      return {
        agent: "opencode",
        sessionId: s.id,
        cwd: s.directory ?? null,
        model: s.model ?? null,
        startedAt: s.time_created || null,
        turns,
        events: { compactions },
      };
    });
  } finally {
    db.close();
  }
};
