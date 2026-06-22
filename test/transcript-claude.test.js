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

test("missing projects dir → []", () => {
  expect(readClaudeSessions({ projectsDir: "/no/such/dir" })).toEqual([]);
});
