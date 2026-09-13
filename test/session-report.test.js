import { expect, test } from "vitest";
import { renderReport } from "../scripts/lib/session-report.js";

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
