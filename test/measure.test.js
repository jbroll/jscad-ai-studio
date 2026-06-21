import { expect, test } from "vitest";
import { measureGeom } from "../mcp/lib/measure.js";
import { loadAndRun } from "../mcp/lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("measures a geom3 cube", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const m = measureGeom(geom, geomType);
  expect(m.dimensions).toEqual([10, 10, 10]);
  expect(m.volume).toBeCloseTo(1000, 3);
  expect(m.polygonCount).toBeGreaterThan(0);
});

test("measures a geom2 plate with area", () => {
  const { geom, geomType } = loadAndRun(fx("plate.js"), {});
  const m = measureGeom(geom, geomType);
  expect(m.area).toBeCloseTo(900, 3);
});
