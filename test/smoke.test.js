import { existsSync } from "node:fs";
import { expect, test } from "vitest";

test("plugin manifest and fixture exist", () => {
  expect(existsSync(".claude-plugin/plugin.json")).toBe(true);
  expect(existsSync("test/fixtures/cube.js")).toBe(true);
});
