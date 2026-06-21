import { expect, test } from "vitest";
import { checkGeom } from "../mcp/lib/check.js";
import { loadAndRun } from "../mcp/lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("a solid cube is watertight and manifold", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const c = checkGeom(geom, geomType, [200, 200, 200]);
  expect(c.watertight).toBe(true);
  expect(c.manifold).toBe(true);
  expect(c.openEdges).toBe(0);
  expect(c.fitsBed).toBe(true);
});

test("flags a model larger than the bed", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), { size: 20 });
  const c = checkGeom(geom, geomType, [10, 10, 10]);
  expect(c.fitsBed).toBe(false);
});

test("flags an open (non-watertight) mesh", () => {
  const { geom, geomType } = loadAndRun(fx("open.js"), {});
  const c = checkGeom(geom, geomType);
  expect(c.watertight).toBe(false);
  expect(c.openEdges).toBeGreaterThan(0);
});

test("array geom does not throw and returns manifold:false, watertight:false", () => {
  const { geom, geomType } = loadAndRun(fx("array.js"), {});
  expect(geomType).toBe("array");
  expect(() => checkGeom(geom, geomType)).not.toThrow();
  const c = checkGeom(geom, geomType);
  expect(c.manifold).toBe(false);
  expect(c.watertight).toBe(false);
});
