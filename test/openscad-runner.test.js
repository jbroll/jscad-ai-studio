import { expect, test } from "vitest";
import { runModel } from "../mcp/lib/runner.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

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
