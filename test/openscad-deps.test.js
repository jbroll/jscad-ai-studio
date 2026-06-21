import { createRequire } from "node:module";
import { expect, test } from "vitest";

test("FluentGeom3 wrapper is exported and constructable", async () => {
  const jf =
    (await import("@jbroll/jscad-fluent")).default ?? (await import("@jbroll/jscad-fluent"));
  const mod = await import("@jbroll/jscad-fluent");
  expect(typeof mod.FluentGeom3).toBe("function");
  const cube = jf.cube({ size: 6 });
  const raw = {
    polygons: cube.toPolygons().map((p) => ({ vertices: p.vertices })),
    transforms: cube.transforms,
  };
  const wrapped = new mod.FluentGeom3(raw);
  expect(typeof wrapped.union).toBe("function");
  expect(wrapped.measureDimensions()).toEqual([6, 6, 6]);
});

test("openscad + manifold packages resolve", () => {
  const require = createRequire(import.meta.url);
  // manifold-3d is ESM-only with no root export; resolve the .js file directly
  expect(() => require.resolve("manifold-3d/manifold.js")).not.toThrow();
});
