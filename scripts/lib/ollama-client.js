// A client with the Anthropic-SDK-ish shape (`messages.create`), backed by a
// local/remote Ollama server (`POST <host>/api/chat`). No API key, no
// subscription usage — runs on your own GPU host. Drop-in for
// describeModel(client, ...). `fetchImpl` is injectable for testing.
export const makeOllamaClient = ({ host, model = "qwen2.5-coder", fetchImpl = fetch } = {}) => ({
  messages: {
    create: async ({ messages }) => {
      const res = await fetchImpl(`${host.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, stream: false, messages }),
      });
      if (!res.ok) {
        const detail = typeof res.text === "function" ? await res.text() : "";
        throw new Error(`ollama request failed (${res.status}): ${detail}`);
      }
      const data = await res.json();
      return { content: [{ type: "text", text: data?.message?.content ?? "" }] };
    },
  },
});
