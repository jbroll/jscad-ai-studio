import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Default runner: drive the `claude` CLI in headless print mode. This uses the
// logged-in Claude Code subscription (Pro/Max) — NO ANTHROPIC_API_KEY required.
// `claude -p <prompt> --output-format json --model <model>` prints a JSON object
// whose `result` field holds the model's reply text. The prompt is passed as an
// argv argument; describe.js caps source length well under ARG_MAX.
const defaultRun = async (prompt, model) => {
  const { stdout } = await execFileAsync(
    "claude",
    ["-p", prompt, "--output-format", "json", "--model", model],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout);
  return parsed.result ?? "";
};

// A client with the Anthropic-SDK-ish shape (`messages.create`), backed by the
// `claude` CLI instead of the API. Drop-in for describeModel(client, ...).
// `run(prompt, model) => Promise<string>` is injectable for testing.
export const makeClaudeCliClient = ({
  model = "claude-haiku-4-5-20251001",
  run = defaultRun,
} = {}) => ({
  messages: {
    create: async ({ messages }) => {
      const prompt = messages.map((m) => m.content).join("\n\n");
      const text = await run(prompt, model);
      return { content: [{ type: "text", text }] };
    },
  },
});
