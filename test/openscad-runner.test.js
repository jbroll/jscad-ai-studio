import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { runModel } from "../mcp/lib/runner.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("export produces a binary STL for a .scad", async () => {
  const r = await runModel(fx("cube.scad"), { outputs: ["export"], format: "stl" });
  expect(r.export.mime).toMatch(/stl/);
  expect(r.export.triangleCount).toBeGreaterThanOrEqual(12);
}, 30000);

test("check reports watertight for a .scad solid", async () => {
  const r = await runModel(fx("cube.scad"), { outputs: ["check"] });
  expect(r.check.watertight).toBe(true);
}, 30000);

// trochoids.scad is a standalone corpus file whose top-level calls produce ~2028 triangles.
test("a real mcad corpus part evaluates and exports", async () => {
  const part = "/home/john/src/jscadui/apps/jscad-web/examples/openscad/mcad/trochoids.scad";
  if (!existsSync(part)) return;
  const r = await runModel(part, { outputs: ["export"], format: "stl" });
  expect(r.ok ?? true).not.toBe(false);
  expect(r.export.bytes).toBeGreaterThan(84);
}, 60000);

test("runModel evaluates a top-level .scad", async () => {
  const r = await runModel(fx("cube.scad"), { outputs: ["eval", "measure"] });
  expect(r.ok).toBe(true);
  expect(r.geomType).toBe("geom3");
  expect(r.measure.dimensions).toEqual([10, 10, 10]);
});

test("a .js model can require a .scad part and union it", async () => {
  const r = await runModel(fx("combo.js"), { outputs: ["measure"] });
  expect(r.ok).toBe(true);
  // cube.scad is cube(10) → spans 0..10 (uncentered); jf.cube({size:4}) is centered → spans -2..2
  // translated to x=20: spans 18..22; union x = 0..22 = 22, y/z = -2..10 = 12
  expect(r.measure.dimensions).toEqual([22, 12, 12]);
});

test("a malformed .scad returns a structured error", async () => {
  const r = await runModel(fx("broken.scad"), { outputs: ["eval"] });
  expect(r.ok).toBe(false);
  expect(typeof r.error).toBe("string");
});
