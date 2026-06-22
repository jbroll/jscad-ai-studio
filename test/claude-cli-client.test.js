import { expect, test } from "vitest";
import { makeClaudeCliClient } from "../scripts/lib/claude-cli-client.js";

test("messages.create joins message content into the prompt and returns the SDK text shape", async () => {
  let seenPrompt = null;
  let seenModel = null;
  const run = async (prompt, model) => {
    seenPrompt = prompt;
    seenModel = model;
    return '{"name":"X"}';
  };
  const client = makeClaudeCliClient({ model: "claude-haiku-4-5-20251001", run });
  const res = await client.messages.create({
    max_tokens: 400,
    messages: [{ role: "user", content: "describe this" }],
  });
  expect(seenPrompt).toBe("describe this");
  expect(seenModel).toBe("claude-haiku-4-5-20251001");
  expect(res).toEqual({ content: [{ type: "text", text: '{"name":"X"}' }] });
});

test("concatenates multiple messages with blank lines", async () => {
  const run = async (prompt) => prompt;
  const client = makeClaudeCliClient({ run });
  const res = await client.messages.create({
    messages: [
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ],
  });
  expect(res.content[0].text).toBe("a\n\nb");
});
