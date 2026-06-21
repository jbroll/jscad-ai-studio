import { expect, test } from "vitest";
import { exportGeom } from "../mcp/lib/export-geom.js";
import { loadAndRun } from "../mcp/lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("exports a binary STL with a header and triangles", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const r = exportGeom(geom, geomType, "stl");
  expect(r.mime).toMatch(/stl/);
  expect(r.bytes).toBeGreaterThan(84); // 80-byte header + 4-byte count
  expect(r.triangleCount).toBe(12); // a cube = 12 triangles
});

test("exports OBJ text", () => {
  const { geom, geomType } = loadAndRun(fx("cube.js"), {});
  const r = exportGeom(geom, geomType, "obj");
  expect(r.data.toString("utf8")).toMatch(/^v /m);
});

test("rejects STL for a 2D model", () => {
  const { geom, geomType } = loadAndRun(fx("plate.js"), {});
  expect(() => exportGeom(geom, geomType, "stl")).toThrow(/requires/);
});
