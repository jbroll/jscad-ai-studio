import { expect, test } from "vitest";
import { makeOllamaClient } from "../scripts/lib/ollama-client.js";

test("messages.create POSTs to /api/chat and returns the SDK text shape", async () => {
  let seenUrl = null;
  let seenBody = null;
  const fetchImpl = async (url, opts) => {
    seenUrl = url;
    seenBody = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ message: { content: '{"name":"Gear"}' } }) };
  };
  const client = makeOllamaClient({ host: "http://gpu:11434", model: "qwen2.5-coder", fetchImpl });
  const res = await client.messages.create({ messages: [{ role: "user", content: "describe" }] });

  expect(seenUrl).toBe("http://gpu:11434/api/chat");
  expect(seenBody).toMatchObject({
    model: "qwen2.5-coder",
    stream: false,
    messages: [{ role: "user", content: "describe" }],
  });
  expect(res).toEqual({ content: [{ type: "text", text: '{"name":"Gear"}' }] });
});

test("throws a clear error on a non-ok response", async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => "boom" });
  const client = makeOllamaClient({ host: "http://gpu:11434", model: "m", fetchImpl });
  await expect(
    client.messages.create({ messages: [{ role: "user", content: "x" }] }),
  ).rejects.toThrow(/ollama/i);
});
