import { createRequire } from "node:module";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);

test("FluentGeom3 wrapper is reachable and constructable; API still at root", () => {
  const jf = require("@jbroll/jscad-fluent");
  expect(typeof jf.cube).toBe("function"); // API still at module root
  expect(typeof jf.FluentGeom3).toBe("function"); // wrapper attached
  const cube = jf.cube({ size: 6 });
  const raw = {
    polygons: cube.toPolygons().map((p) => ({ vertices: p.vertices })),
    transforms: cube.transforms,
  };
  const wrapped = new jf.FluentGeom3(raw);
  expect(typeof wrapped.union).toBe("function");
  expect(wrapped.measureDimensions()).toEqual([6, 6, 6]);
});

test("manifold-3d resolves", () => {
  expect(() => require.resolve("manifold-3d/manifold.js")).not.toThrow();
});
