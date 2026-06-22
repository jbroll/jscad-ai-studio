import { expect, test } from "vitest";
import { runModel } from "../mcp/lib/runner.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("measure aggregates an array's combined bbox without unioning", async () => {
  const r = await runModel(fx("scene.js"), { outputs: ["eval", "measure"] });
  expect(r.geomType).toBe("array");
  expect(r.entityCount).toBe(2);
  // cube -5..5; sphere r3 at x=20 → 17..23. combined x = -5..23 = 28
  expect(r.measure.dimensions[0]).toBeCloseTo(28, 0);
  expect(r.measure.entityCount).toBe(2);
});

test("export contains all items as separate solids (not unioned)", async () => {
  const r = await runModel(fx("scene.js"), { outputs: ["export"], format: "stl" });
  // a 12-triangle cube + a sphere → strictly more than 12 triangles, both present
  expect(r.export.triangleCount).toBeGreaterThan(12);
  expect(r.export.bytes).toBeGreaterThan(84);
});

test("check aggregates manifoldness over items", async () => {
  const r = await runModel(fx("scene.js"), { outputs: ["check"] });
  expect(r.check.watertight).toBe(true);
  expect(r.check.entityCount).toBe(2);
});
