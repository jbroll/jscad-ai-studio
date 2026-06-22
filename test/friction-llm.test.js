import { expect, test } from "vitest";
import { llmFriction } from "../scripts/lib/friction-llm.js";

const stub = (text) => ({ messages: { create: async () => ({ content: [{ text }] }) } });
const t = {
  agent: "opencode",
  sessionId: "s",
  cwd: "/w",
  turns: [
    {
      role: "assistant",
      text: "eval failed",
      toolCalls: [{ tool: "eval", status: "error", error: "X is not defined" }],
    },
  ],
  events: { compactions: 0 },
};

test("parses the model's JSON into summary + promptFixes", async () => {
  const json = JSON.stringify({
    summary: "agent fought the API",
    promptFixes: [{ prompt: "llm.txt", issue: "unclear import", suggestion: "show require line" }],
  });
  const r = await llmFriction(stub(json), t);
  expect(r.summary).toMatch(/API/);
  expect(r.promptFixes[0]).toMatchObject({ prompt: "llm.txt" });
});

test("returns an empty result on unparseable output (no throw)", async () => {
  const r = await llmFriction(stub("not json"), t);
  expect(r).toEqual({ summary: "", promptFixes: [] });
});
