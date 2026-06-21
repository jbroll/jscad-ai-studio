import { expect, test } from "vitest";
import { runModel } from "../mcp/lib/runner.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("eval + params + measure over a worker thread", async () => {
  const r = await runModel(fx("cube.js"), { outputs: ["eval", "params", "measure"] });
  expect(r.ok).toBe(true);
  expect(r.geomType).toBe("geom3");
  expect(r.params.find((p) => p.name === "size").default).toBe(10);
  expect(r.measure.dimensions).toEqual([10, 10, 10]);
});

test("export returns base64 STL", async () => {
  const r = await runModel(fx("cube.js"), { outputs: ["export"], format: "stl" });
  expect(r.export.mime).toMatch(/stl/);
  expect(Buffer.from(r.export.base64, "base64").length).toBe(r.export.bytes);
});

test("times out on an infinite loop", async () => {
  const r = await runModel(fx("infinite.js"), { outputs: ["eval"], timeoutMs: 1000 });
  expect(r.ok).toBe(false);
  expect(r.error).toBe("timeout");
});
