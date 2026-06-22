import { expect, test } from "vitest";
import { listParts } from "../mcp/lib/parts.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("lists sibling part files with their exports and main flag", () => {
  const parts = listParts(fx("assembly/top.js"));
  const byFile = Object.fromEntries(parts.map((p) => [p.file, p]));
  expect(byFile["top.js"].hasMain).toBe(true);
  expect(byFile["partA.js"].exports).toContain("widget");
  expect(byFile["partB.js"].exports).toContain("knob");
});
