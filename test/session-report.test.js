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
