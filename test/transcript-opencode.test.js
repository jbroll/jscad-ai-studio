import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { isJscadWorkSession } from "../scripts/lib/transcript.js";
import { readOpencodeSessions } from "../scripts/lib/transcript-opencode.js";

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
