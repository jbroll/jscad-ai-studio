import { expect, test } from "vitest";
import { redact, renderReport } from "../scripts/lib/session-report.js";

test("renders summary, by-prompt section, and per-session rows", () => {
  const results = [
    {
      sessionId: "s1",
      agent: "opencode",
      cwd: "/w",
      score: 12,
      signals: {
        toolErrors: { count: 2, samples: [] },
        evalErrors: { count: 2, samples: [{ tool: "eval", error: "X is not defined" }] },
        retries: 1,
        compactions: 0,
        bootstrapMiss: true,
        constraintHits: [],
      },
      llm: {
        summary: "fought the API",
        promptFixes: [{ prompt: "JSCAD.md", issue: "bootstrap", suggestion: "say run jscad-work" }],
      },
    },
    {
      sessionId: "s2",
      agent: "claude",
      cwd: "/x",
      score: 0,
      signals: {
        toolErrors: { count: 0, samples: [] },
        evalErrors: { count: 0, samples: [] },
        retries: 0,
        compactions: 0,
        bootstrapMiss: false,
        constraintHits: [],
      },
    },
  ];
  const md = renderReport(results);
  expect(md).toMatch(/## Summary/);
  expect(md).toMatch(/## By prompt/);
  expect(md).toMatch(/JSCAD\.md/);
  expect(md).toMatch(/s1/);
  expect(md).toMatch(/2 sessions/);
});

test("constraint hits go to llm.txt for API constraints and JSCAD.md for modeling rules", () => {
  const signals = {
    toolErrors: { count: 0, samples: [] },
    evalErrors: { count: 0, samples: [] },
    retries: 0,
    compactions: 0,
    bootstrapMiss: false,
    constraintHits: [
      { kind: "degrees", snippet: "rotateZ(90)" },
      { kind: "segmentsHigh", snippet: "segments: 256" },
    ],
  };
  const md = renderReport([{ sessionId: "s1", agent: "claude", cwd: "/w", score: 4, signals }]);
  const section = (name) => md.split(`### ${name}`)[1]?.split("###")[0] ?? "";
  expect(section("llm.txt")).toMatch(/possible degrees/);
  expect(section("llm.txt")).not.toMatch(/segmentsHigh/);
  expect(section("JSCAD.md")).toMatch(/possible segmentsHigh/);
});

test("design-correctness signals go to the skill section and the summary", () => {
  const signals = {
    toolErrors: { count: 0, samples: [] },
    evalErrors: { count: 0, samples: [] },
    retries: 0,
    compactions: 0,
    bootstrapMiss: false,
    constraintHits: [],
    noVerify: true,
    uninspectedRenders: [{ pngs: ["m.js-iso.png"] }],
    targetMisses: [{ target: "40x20x10", lastMeasured: [40, 20, 12] }],
  };
  const md = renderReport([{ sessionId: "s1", agent: "claude", cwd: "/w", score: 8, signals }]);
  expect(md).toMatch(/- 1 built a model without measure or check/);
  expect(md).toMatch(/- 1 renders never Read, in 1 sessions/);
  expect(md).toMatch(/- 1 stated targets never matched a measurement, in 1 sessions/);
  const skill = md.split("### skill")[1];
  expect(skill).toMatch(/s1: built a model without jscad-work measure or check/);
  expect(skill).toMatch(/s1: render never Read — `m\.js-iso\.png`/);
  expect(skill).toMatch(/s1: target `40x20x10` never measured; last dimensions \[40, 20, 12\]/);
  expect(md).toMatch(/\| 8 \| claude \| s1 \| 0 \| 0 \| 0 \| 0 \| {2}\| ✗ \| 1 \| 1 \| \/w \|/);
});

test.each([
  ["/repo/examples/JSCAD.md", "./examples/JSCAD.md"],
  ["/repo", "./"],
  ["/home/u/src/sandtable/axis.js", "~/src/sandtable/axis.js"],
  ["cwd /home/u/sandtable/parts", "cwd …/parts"],
  ["wrote /tmp/jscad-m.js-iso-800x600.png", "wrote …/jscad-m.js-iso-800x600.png"],
  ["mail john@example.com now", "mail <email> now"],
  ["key sk-ant-api03-abcdefghijklmnop", "key <secret>"],
  ["token ghp_abcdefghijklmnopqrstuvwxyz0123", "token <secret>"],
  ["https://example.com/a/b and/or 1/2", "https://example.com/a/b and/or 1/2"],
  ["ses_10fbc73acffeHgX9n1wYDbbFoI", "ses_10fbc73acffeHgX9n1wYDbbFoI"],
  ["43b75bda-020d-4aca-88b4-cbef56c3087d", "43b75bda-020d-4aca-88b4-cbef56c3087d"],
])("redact(%s)", (input, output) => {
  expect(redact(input, { repoRoot: "/repo", home: "/home/u" })).toBe(output);
});

test("renderReport redacts cwds and snippets", () => {
  const signals = {
    toolErrors: { count: 0, samples: [] },
    evalErrors: { count: 0, samples: [] },
    retries: 0,
    compactions: 0,
    bootstrapMiss: false,
    constraintHits: [{ kind: "thinWall", snippet: "wall: 0.4 // ask a@b.io" }],
  };
  const md = renderReport(
    [{ sessionId: "s1", agent: "opencode", cwd: "/home/u/private/cad", score: 2, signals }],
    { repoRoot: "/repo", home: "/home/u" },
  );
  expect(md).not.toMatch(/\/home\/u/);
  expect(md).not.toMatch(/a@b\.io/);
  expect(md).toMatch(/…\/cad \|/);
});
