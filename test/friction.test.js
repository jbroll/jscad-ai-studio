import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { analyzeFriction, extractTargets } from "../scripts/lib/friction.js";
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

const session = (...calls) =>
  mk({ agent: "claude", turns: [{ role: "assistant", text: "", toolCalls: calls }] });
const read = (file_path) => ({ tool: "Read", status: "ok", input: { file_path } });

test("noVerify when a jscad-work session evaluates a model but never measures or checks", () => {
  const r = analyzeFriction(session(bash("jscad-work eval m.js")));
  expect(r.signals.noVerify).toBe(true);
  expect(r.score).toBe(3);
});

test.each([
  "jscad-work measure m.js",
  "jscad-work check m.js --bed 220,220,250",
])("no noVerify after %s", (command) => {
  const r = analyzeFriction(session(bash("jscad-work eval m.js"), bash(command)));
  expect(r.signals.noVerify).toBe(false);
});

test("MCP measure counts as verification", () => {
  const r = analyzeFriction(
    session(
      { tool: "Write", status: "ok", input: { file_path: "/w/m.js" } },
      { tool: "mcp__plugin_jscad-ai-studio_jscad-studio__eval", status: "ok", input: {} },
      { tool: "mcp__plugin_jscad-ai-studio_jscad-studio__measure", status: "ok", input: {} },
    ),
  );
  expect(r.signals.noVerify).toBe(false);
});

test("no noVerify for a session that built nothing", () => {
  const r = analyzeFriction(session(bash("jscad-work library search gear")));
  expect(r.signals.noVerify).toBe(false);
});

test("a render whose PNG is Read later is inspected", () => {
  const output = '{"ok":true,"renders":[{"view":"iso","path":"/w/.jscad-work/m.js-iso.png"}]}';
  const r = analyzeFriction(
    session(
      bash("jscad-work render m.js", { output }),
      read("/w/.jscad-work/m.js-iso.png"),
      bash("jscad-work measure m.js"),
    ),
  );
  expect(r.signals.uninspectedRenders).toEqual([]);
});

test("a render never Read is flagged, and a Read before it does not count", () => {
  const r = analyzeFriction(
    session(
      read("/w/.jscad-work/m.js-iso.png"),
      bash("jscad-work render m.js"),
      bash("jscad-work check m.js"),
    ),
  );
  expect(r.signals.uninspectedRenders).toEqual([{ pngs: ["m.js-iso.png"] }]);
  expect(r.score).toBe(2);
});

test("without captured output the PNG names come from the render flags", () => {
  const r = analyzeFriction(
    session(
      bash("jscad-work render parts/arm.js --view all -o shots/arm.png"),
      read("shots/arm-top.png"),
      bash("jscad-work render parts/arm.js --view=front,top"),
      read("/w/.jscad-work/arm.js-front.png"),
      bash("jscad-work render parts/arm.js -o out.png"),
    ),
  );
  expect(r.signals.uninspectedRenders).toEqual([{ pngs: ["out.png"] }]);
});

test("an OpenCode MCP render is inspected by a later read of its temp PNG", () => {
  const r = analyzeFriction(
    mk({
      turns: [
        {
          role: "assistant",
          text: "",
          toolCalls: [
            {
              tool: "jscad-studio_render",
              status: "ok",
              input: { modelPath: "m.js", view: "top" },
            },
            { tool: "read", status: "ok", input: { filePath: "/tmp/jscad-m.js-top-800x600.png" } },
          ],
        },
      ],
    }),
  );
  expect(r.signals.uninspectedRenders).toEqual([]);
});

test.each([
  ["make a box 40x20x10", [[40, 20, 10]]],
  ["a 4 x 2 x 1 cm enclosure", [[40, 20, 10]]],
  ["the plate should be 60 mm wide and 30mm long", [[60], [30]]],
  ["give it a height of 12.5 mm", [[12.5]]],
])("extractTargets(%s)", (text, values) => {
  expect(extractTargets(text).map((t) => t.values)).toEqual(values);
});

test.each([
  "use a 0.4 mm nozzle",
  "render at 800x600",
  "an M3 hole 5 mm deep, 3 mm diameter, walls 2 mm thick",
  "```\nconst size = [40x20x10]\n```",
  "<system-reminder>a box 40x20x10</system-reminder>",
])("no target in: %s", (text) => {
  expect(extractTargets(text)).toEqual([]);
});

const measured = (dims, model = "m.js") =>
  bash(`jscad-work measure ${model}`, {
    output: `{"ok":true,"measure":{"dimensions":[${dims}]}}`,
  });
const withUser = (text, ...calls) =>
  mk({
    agent: "claude",
    turns: [
      { role: "user", text, toolCalls: [] },
      { role: "assistant", text: "", toolCalls: calls },
    ],
  });

test("a measured dimension within tolerance matches the stated target in any axis order", () => {
  const r = analyzeFriction(withUser("a box 40x20x10 mm", measured("10.1,40,20")));
  expect(r.signals.targetMisses).toEqual([]);
});

test("a target no measurement matched is a miss", () => {
  const r = analyzeFriction(
    withUser("a box 40x20x10 mm, 60 mm wide", measured("40,20,12"), measured("40,20,14", "n.js")),
  );
  expect(r.signals.targetMisses).toEqual([
    { target: "40x20x10 mm", lastMeasured: [40, 20, 14] },
    { target: "60 mm wide", lastMeasured: [40, 20, 14] },
  ]);
  expect(r.score).toBe(6);
});

test("targets are not compared when nothing was measured", () => {
  const r = analyzeFriction(withUser("a box 40x20x10 mm", bash("jscad-work check m.js")));
  expect(r.signals.targetMisses).toEqual([]);
});

test("color255 constraint hit on colorize call with 0-255 values", () => {
  const t = mk({
    turns: [{ role: "assistant", text: "colorize([255,128,0], shape)", toolCalls: [] }],
  });
  const r = analyzeFriction(t);
  expect(r.signals.constraintHits.some((h) => h.kind === "color255")).toBe(true);
});
