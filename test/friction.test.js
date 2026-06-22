import { expect, test } from "vitest";
import { analyzeFriction } from "../scripts/lib/friction.js";

const mk = (over) => ({
  agent: "opencode",
  sessionId: "s",
  cwd: "/w",
  turns: [],
  events: { compactions: 0 },
  ...over,
});

test("flags eval errors, retries, compactions, and scores > 0", () => {
  const t = mk({
    events: { compactions: 2 },
    turns: [
      {
        role: "assistant",
        text: "",
        toolCalls: [
          {
            tool: "eval",
            status: "error",
            error: "X is not defined",
            input: { modelPath: "m.js" },
          },
          { tool: "eval", status: "error", error: "still broken", input: { modelPath: "m.js" } },
        ],
      },
    ],
  });
  const r = analyzeFriction(t);
  expect(r.signals.toolErrors.count).toBe(2);
  expect(r.signals.evalErrors.count).toBe(2);
  expect(r.signals.retries).toBeGreaterThanOrEqual(1); // same tool+target repeated
  expect(r.signals.compactions).toBe(2);
  expect(r.score).toBeGreaterThan(0);
});

test("flags a degrees-not-radians constraint hit", () => {
  const t = mk({ turns: [{ role: "assistant", text: "geom.rotate([0,0,90])", toolCalls: [] }] });
  const r = analyzeFriction(t);
  expect(r.signals.constraintHits.some((h) => h.kind === "degrees")).toBe(true);
});

test("clean session scores 0 with no signals", () => {
  const r = analyzeFriction(
    mk({
      turns: [
        { role: "assistant", text: "looks good", toolCalls: [{ tool: "measure", status: "ok" }] },
      ],
    }),
  );
  expect(r.score).toBe(0);
  expect(r.signals.toolErrors.count).toBe(0);
});
