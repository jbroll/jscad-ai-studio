import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { isJscadWorkSession } from "../scripts/lib/transcript.js";
import {
  readOpencodeDbSessions,
  readOpencodeSessions,
} from "../scripts/lib/transcript-opencode.js";

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const build = () => {
  const root = mkdtempSync(join(tmpdir(), "oc-"));
  dirs.push(root);
  const w = (p, o) => {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), JSON.stringify(o));
  };
  w("session/proj1/ses_A.json", {
    id: "ses_A",
    directory: "/work/widget",
    time: { created: 100 },
    model: "qwen",
  });
  w("message/ses_A/msg_1.json", { id: "msg_1", role: "user", time: { created: 101 } });
  w("message/ses_A/msg_2.json", {
    id: "msg_2",
    role: "assistant",
    time: { created: 102 },
    model: "qwen",
  });
  w("part/msg_1/p1.json", { type: "text", text: "make a cube", time: { created: 101 } });
  w("part/msg_2/p1.json", { type: "text", text: "running eval", time: { created: 102 } });
  w("part/msg_2/p2.json", {
    type: "tool",
    tool: "eval",
    state: { status: "error", error: "boom", input: { modelPath: "m.js" } },
    time: { created: 103 },
  });
  w("part/msg_2/p3.json", { type: "compaction", time: { created: 104 } });
  return root;
};

test("reconstructs sessions: cwd, model, turns, tool error, compactions", () => {
  const [t] = readOpencodeSessions({ storageDir: build() });
  expect(t.agent).toBe("opencode");
  expect(t.sessionId).toBe("ses_A");
  expect(t.cwd).toBe("/work/widget");
  expect(t.model).toBe("qwen");
  expect(t.turns).toHaveLength(2);
  expect(t.turns[0]).toMatchObject({ role: "user", text: "make a cube" });
  const call = t.turns[1].toolCalls[0];
  expect(call).toMatchObject({ tool: "eval", status: "error", error: "boom" });
  expect(t.events.compactions).toBe(1);
});

test("missing storage dir → []", () => {
  expect(readOpencodeSessions({ storageDir: "/no/such/dir" })).toEqual([]);
});

const buildDb = async () => {
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");
  const root = mkdtempSync(join(tmpdir(), "ocdb-"));
  dirs.push(root);
  const dbPath = join(root, "opencode.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`
    create table session (id text primary key, directory text, model text, time_created integer);
    create table message (id text primary key, session_id text, time_created integer, data text);
    create table part (id text primary key, message_id text, session_id text, data text);
  `);
  const session = db.prepare("insert into session values (?, ?, ?, ?)");
  const message = db.prepare("insert into message values (?, ?, ?, ?)");
  const part = db.prepare("insert into part values (?, ?, ?, ?)");
  session.run("ses_A", "/work/widget", "qwen", 100);
  message.run("msg_1", "ses_A", 101, JSON.stringify({ role: "user" }));
  message.run("msg_2", "ses_A", 102, JSON.stringify({ role: "assistant" }));
  part.run("prt_1", "msg_1", "ses_A", JSON.stringify({ type: "text", text: "a box" }));
  part.run(
    "prt_2",
    "msg_2",
    "ses_A",
    JSON.stringify({
      type: "tool",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "jscad-work measure m.js" },
        output: '{"dimensions":[1,2,3]}',
      },
    }),
  );
  part.run("prt_3", "msg_2", "ses_A", JSON.stringify({ type: "compaction" }));
  session.run("ses_B", "/work/other", "qwen", 200);
  message.run("msg_3", "ses_B", 201, JSON.stringify({ role: "user" }));
  part.run("prt_4", "msg_3", "ses_B", JSON.stringify({ type: "text", text: "fix the router" }));
  db.close();
  return dbPath;
};

test("reads sessions from the OpenCode SQLite database", async () => {
  const sessions = await readOpencodeDbSessions({ dbPath: await buildDb() });
  expect(sessions.map((s) => s.sessionId)).toEqual(["ses_A", "ses_B"]);
  const [t] = sessions;
  expect(t).toMatchObject({ agent: "opencode", cwd: "/work/widget", model: "qwen" });
  expect(t.turns[0]).toMatchObject({ role: "user", text: "a box" });
  expect(t.turns[1].toolCalls[0]).toMatchObject({
    tool: "bash",
    status: "ok",
    output: '{"dimensions":[1,2,3]}',
  });
  expect(t.events.compactions).toBe(1);
});

test("prefilter keeps sessions whose parts contain the text or whose directory passes", async () => {
  const dbPath = await buildDb();
  const byText = await readOpencodeDbSessions({ dbPath, prefilter: { text: "jscad" } });
  expect(byText.map((s) => s.sessionId)).toEqual(["ses_A"]);
  const byDir = await readOpencodeDbSessions({
    dbPath,
    prefilter: { text: "jscad", dir: (d) => d === "/work/other" },
  });
  expect(byDir.map((s) => s.sessionId)).toEqual(["ses_A", "ses_B"]);
});

test("missing database → []", async () => {
  expect(await readOpencodeDbSessions({ dbPath: "/no/such/opencode.db" })).toEqual([]);
});

test("isJscadWorkSession: AGENTS.md counts only when it mentions jscad", () => {
  const plain = mkdtempSync(join(tmpdir(), "agents-"));
  const jscad = mkdtempSync(join(tmpdir(), "agents-"));
  dirs.push(plain, jscad);
  writeFileSync(join(plain, "AGENTS.md"), "# Router\nRun cargo test.\n");
  writeFileSync(join(jscad, "AGENTS.md"), "Run jscad-work eval before editing.\n");
  expect(isJscadWorkSession({ cwd: plain, turns: [] })).toBe(false);
  expect(isJscadWorkSession({ cwd: jscad, turns: [] })).toBe(true);
});

test("isJscadWorkSession: jscad tool → true", () => {
  const t = {
    cwd: "/tmp/no-jscad-files",
    turns: [
      { role: "user", text: "hi", toolCalls: [] },
      { role: "assistant", text: "ok", toolCalls: [{ tool: "jscad-studio_eval", status: "ok" }] },
    ],
    events: { compactions: 0 },
  };
  expect(isJscadWorkSession(t)).toBe(true);
});

test("isJscadWorkSession: no jscad tool, no marker files → false", () => {
  const t = {
    cwd: "/tmp/no-jscad-files",
    turns: [
      { role: "user", text: "hi", toolCalls: [] },
      { role: "assistant", text: "ok", toolCalls: [{ tool: "bash", status: "ok" }] },
    ],
    events: { compactions: 0 },
  };
  expect(isJscadWorkSession(t)).toBe(false);
});
