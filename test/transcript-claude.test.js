import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { readClaudeSessions } from "../scripts/lib/transcript-claude.js";

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("reconstructs a session with a failed tool_result and decoded cwd", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-"));
  dirs.push(root);
  const proj = join(root, "-work-widget");
  mkdirSync(proj, { recursive: true });
  const lines = [
    { type: "permission-mode", permissionMode: "default" },
    {
      type: "user",
      timestamp: "2026-06-22T00:00:00Z",
      message: { role: "user", content: "make a cube" },
    },
    {
      type: "assistant",
      message: {
        role: "assistant",
        model: "claude-x",
        content: [
          { type: "text", text: "running eval" },
          { type: "tool_use", id: "tu_1", name: "eval", input: { modelPath: "m.js" } },
        ],
      },
    },
    {
      type: "user",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu_1", is_error: true, content: "boom" }],
      },
    },
  ];
  writeFileSync(join(proj, "sess1.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));

  const [t] = readClaudeSessions({ projectsDir: root });
  expect(t.agent).toBe("claude");
  expect(t.sessionId).toBe("sess1");
  expect(t.cwd).toBe("/work/widget");
  expect(t.model).toBe("claude-x");
  const call = t.turns.flatMap((x) => x.toolCalls).find((c) => c.tool === "eval");
  expect(call).toMatchObject({ status: "error", error: "boom" });
});

test("takes cwd from records and keeps successful tool result text", () => {
  const root = mkdtempSync(join(tmpdir(), "cc-"));
  dirs.push(root);
  const proj = join(root, "-work-my-widget");
  mkdirSync(proj, { recursive: true });
  const measure = '{"ok":true,"measure":{"dimensions":[40,20,10]}}';
  const lines = [
    { type: "user", cwd: "/work/my-widget", message: { role: "user", content: "a box" } },
    {
      type: "assistant",
      cwd: "/work/my-widget",
      message: {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "a",
            name: "Bash",
            input: { command: "jscad-work measure m.js" },
          },
          { type: "tool_use", id: "b", name: "mcp__x__measure", input: { modelPath: "m.js" } },
        ],
      },
    },
    {
      type: "user",
      message: {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: measure },
          { type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: measure }] },
        ],
      },
    },
  ];
  writeFileSync(join(proj, "s.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n"));

  const [t] = readClaudeSessions({ projectsDir: root });
  expect(t.cwd).toBe("/work/my-widget");
  const outputs = t.turns.flatMap((x) => x.toolCalls).map((c) => c.output);
  expect(outputs).toEqual([measure, measure]);
});

test("missing projects dir → []", () => {
  expect(readClaudeSessions({ projectsDir: "/no/such/dir" })).toEqual([]);
});
