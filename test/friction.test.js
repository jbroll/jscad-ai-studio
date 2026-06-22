import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("bootstrapMiss true when cwd set, no jscad tool/text, and start-confusion text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jscad-test-"));
  await writeFile(join(dir, "JSCAD.md"), "# JSCAD\n");
  const t = mk({
    cwd: dir,
    turns: [{ role: "user", text: "how do I start the viewer?", toolCalls: [] }],
  });
  const r = analyzeFriction(t);
  expect(r.signals.bootstrapMiss).toBe(true);
  expect(r.score).toBeGreaterThanOrEqual(4);
});

test("bootstrapMiss false when jscad tool is used, even with start-confusion text", () => {
  const t = mk({
    cwd: "/project",
    turns: [
      { role: "user", text: "how do I start the viewer?", toolCalls: [] },
      {
        role: "assistant",
        text: "",
        toolCalls: [{ tool: "jscad-studio_eval", status: "ok", input: {} }],
      },
    ],
  });
  const r = analyzeFriction(t);
  expect(r.signals.bootstrapMiss).toBe(false);
});

test("bootstrapMiss false for non-jscad-work session (no JSCAD.md/AGENTS.md, no jscad tool)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "plain-session-"));
  // no JSCAD.md or AGENTS.md written — plain temp dir
  const t = mk({
    cwd: dir,
    turns: [{ role: "user", text: "how do I start the viewer?", toolCalls: [] }],
  });
  const r = analyzeFriction(t);
  expect(r.signals.bootstrapMiss).toBe(false);
});

test("evaluate and reeval tool errors are NOT counted as evalErrors but are counted as toolErrors", () => {
  const t = mk({
    turns: [
      {
        role: "assistant",
        text: "",
        toolCalls: [
          { tool: "evaluate", status: "error", error: "fail", input: {} },
          { tool: "reeval", status: "error", error: "fail2", input: {} },
        ],
      },
    ],
  });
  const r = analyzeFriction(t);
  expect(r.signals.evalErrors.count).toBe(0);
  expect(r.signals.toolErrors.count).toBe(2);
});

test("color255 constraint hit on colorize call with 0-255 values", () => {
  const t = mk({
    turns: [{ role: "assistant", text: "colorize([255,128,0], shape)", toolCalls: [] }],
  });
  const r = analyzeFriction(t);
  expect(r.signals.constraintHits.some((h) => h.kind === "color255")).toBe(true);
});
