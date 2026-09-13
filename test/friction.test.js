import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { analyzeFriction } from "../scripts/lib/friction.js";
import { cliToolCall, isJscadWorkSession } from "../scripts/lib/transcript.js";

const bash = (command, over = {}) => ({ tool: "Bash", status: "ok", input: { command }, ...over });

test.each([
  ["jscad-work eval m.js", "jscad-studio_eval", { modelPath: "m.js" }],
  [
    "jscad-work measure parts/arm.js -p '{\"len\": 40}'",
    "jscad-studio_measure",
    { modelPath: "parts/arm.js" },
  ],
  ["cd /w && jscad-work render m.js --view all", "jscad-studio_render", { modelPath: "m.js" }],
  [
    "node /opt/studio/bin/jscad-work.js check m.js --bed 220,220,250",
    "jscad-studio_check",
    { modelPath: "m.js" },
  ],
  ["timeout 60 jscad-work export m.js -o m.stl", "jscad-studio_export", { modelPath: "m.js" }],
  [
    "jscad-work library search 608 bearing --runnable",
    "jscad-studio_library_search",
    { query: "608 bearing" },
  ],
  ["jscad-work library get bosl2/gear", "jscad-studio_library_get", { id: "bosl2/gear" }],
  ["jscad-work live-params '{\"size\":33}'", "jscad-studio_live_params", { params: '{"size":33}' }],
  [
    "jscad-work live-params parts/arm.js '{\"size\":33}'",
    "jscad-studio_live_params",
    { params: '{"size":33}' },
  ],
])("CLI call %s maps to %s", (command, tool, input) => {
  expect(cliToolCall(bash(command))).toMatchObject({ tool, input });
});

test.each([
  "jscad-work init m.js",
  "jscad-work stop",
  "jscad-work evaluate.js",
  "npm test",
  "echo jscad-work eval m.js",
])("leaves a non-tool command alone: %s", (command) => {
  expect(cliToolCall(bash(command)).tool).toBe("Bash");
});

test("CLI eval errors score the same as MCP eval errors", () => {
  const mcpName = "mcp__plugin_jscad-ai-studio_jscad-studio__eval";
  const fail = { status: "error", error: "Exit code 1" };
  const cli = analyzeFriction(
    mk({
      turns: [
        {
          role: "assistant",
          text: "",
          toolCalls: [bash("jscad-work eval m.js", fail), bash("jscad-work eval m.js", fail)],
        },
      ],
    }),
  );
  const mcp = analyzeFriction(
    mk({
      turns: [
        {
          role: "assistant",
          text: "",
          toolCalls: [
            { tool: mcpName, input: { modelPath: "m.js" }, ...fail },
            { tool: mcpName, input: { modelPath: "m.js" }, ...fail },
          ],
        },
      ],
    }),
  );
  expect(cli.signals.evalErrors.count).toBe(2);
  expect(cli.signals.retries).toBe(1);
  expect(cli.score).toBe(mcp.score);
});

test("a Bash jscad-work subcommand marks the session and avoids bootstrapMiss", () => {
  const t = mk({
    cwd: "/nonexistent-project",
    turns: [
      { role: "user", text: "how do I start the viewer?", toolCalls: [] },
      { role: "assistant", text: "", toolCalls: [bash("jscad-work measure m.js")] },
    ],
  });
  expect(isJscadWorkSession(t)).toBe(true);
  expect(analyzeFriction(t).signals.bootstrapMiss).toBe(false);
});

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

const kindsFor = (text, input) =>
  analyzeFriction(
    mk({ turns: [{ role: "assistant", text, toolCalls: input ? [{ tool: "Edit", input }] : [] }] }),
  ).signals.constraintHits.map((h) => h.kind);

test.each([
  ["segmentsHigh", "jf.sphere({ radius: 10, segments: 256 })"],
  ["segmentsHigh", "jf.cylinder({ radius: 2, segments: 129 })"],
  ["zeroSize", "jf.cylinder({ radius: 3, height: 0 })"],
  ["zeroSize", "Error: height must be greater then zero"],
  ["coincidentFaces", "the render shows z-fighting on the top face"],
  ["coincidentFaces", "that coplanar cut left a skin"],
  ["emptyGeometry", 'measure returned "dimensions":[0,0,0]'],
  ["choiceOptions", "p.size = { type: 'choice', default: '608', options: ['608', '6001'] }"],
  ["plainParam", "p.width = 50;"],
  ["thinWall", "const WALL = 0.8; const wallThickness = 0.6"],
])("%s constraint hit: %s", (kind, text) => {
  expect(kindsFor(text)).toContain(kind);
});

test("constraint hits match code inside JSON-stringified tool inputs", () => {
  const kinds = kindsFor("", {
    new_string:
      'p.size = { type: "radio", default: 1, options: [1, 2] }; jf.sphere({ segments: 200 })',
  });
  expect(kinds).toContain("choiceOptions");
  expect(kinds).toContain("segmentsHigh");
});

test.each([
  "jf.cylinder({ radius: 2, segments: 64 })",
  "jf.cylinder({ radius: 2, segments: 128 })",
  "jf.cylinder({ radius: 0.5, height: 10 })",
  "jf.cube({ size: 10 })",
  "p.width = { type: 'slider', default: 50 }",
  "if (p.width === 50) {}",
  "p.platform.shelfHeight = shelfHeight",
  "p.size = { type: 'choice', default: '608', values: ['608', '6001'] }",
  "const WALL = 1.2",
])("no constraint hit for correct code: %s", (text) => {
  expect(kindsFor(text)).toEqual([]);
});

test("color255 constraint hit on colorize call with 0-255 values", () => {
  const t = mk({
    turns: [{ role: "assistant", text: "colorize([255,128,0], shape)", toolCalls: [] }],
  });
  const r = analyzeFriction(t);
  expect(r.signals.constraintHits.some((h) => h.kind === "color255")).toBe(true);
});
