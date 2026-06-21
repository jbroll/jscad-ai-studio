import { beforeAll, expect, test } from "vitest";
import { evalScadModel, initOpenscad, registerScadRequire } from "../mcp/lib/openscad.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

beforeAll(async () => {
  await initOpenscad();
  registerScadRequire();
});

test("evaluates a top-level .scad model to a fluent geometry", () => {
  const g = evalScadModel(fx("cube.scad"));
  expect(typeof g.union).toBe("function");
  expect(g.measureDimensions()).toEqual([10, 10, 10]);
  expect(g.measureVolume()).toBeCloseTo(1000, 3);
});

test("a .scad is require-able and composes with fluent", async () => {
  const require = (await import("node:module")).createRequire(import.meta.url);
  const part = require(fx("cube.scad")); // resolves via require.extensions['.scad']
  expect(part.measureDimensions()).toEqual([10, 10, 10]);
});

test("a malformed .scad throws (caller converts to structured error)", () => {
  expect(() => evalScadModel(fx("broken.scad"))).toThrow();
});
