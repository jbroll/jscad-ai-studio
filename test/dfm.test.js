import { expect, test } from "vitest";
import { analyzeDfm } from "../lib/dfm.js";
import { jf } from "../lib/jf.js";
import { loadAndRun } from "../lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const dfmOf = (name, params = {}, opts = {}) => {
  const { geom, geomType } = loadAndRun(fx(name), params);
  return analyzeDfm(geom, geomType, opts);
};

test("a thin-walled box reports its 0.5 mm walls as thin regions", () => {
  const r = dfmOf("thin-box.js");
  expect(r).toMatchObject({ up: "+z", wallThreshold: 0.8, overhangLimit: 45, empty: false });
  expect(r.minWall).toBeCloseTo(0.5, 6);
  expect(r.thinArea).toBeGreaterThan(1000);
  expect(r.thinRegions.length).toBeGreaterThan(0);
  expect(r.thinRegions[0].minWall).toBeCloseTo(0.5, 6);
  expect(r.overhangArea).toBe(0);
  expect(dfmOf("thin-box.js", {}, { wall: 0.4 })).toMatchObject({ thinArea: 0, thinRegions: [] });
});

test("a solid block has no thin walls or overhangs", () => {
  expect(dfmOf("cube.js")).toMatchObject({
    minWall: 10,
    thinArea: 0,
    thinRegions: [],
    overhangArea: 0,
    maxOverhangAngle: 0,
    overhangRegions: [],
  });
});

test("a T's flat underside overhangs and a 45 degree chamfer does not", () => {
  const flat = dfmOf("t-shape.js");
  expect(flat).toMatchObject({ minWall: 5, thinArea: 0, overhangArea: 200, maxOverhangAngle: 90 });
  expect(flat.overhangRegions.map((r) => [r.area, r.maxAngle])).toEqual([
    [100, 90],
    [100, 90],
  ]);
  const chamfered = dfmOf("t-shape.js", { chamfer: true });
  expect(chamfered).toMatchObject({ overhangArea: 0, maxOverhangAngle: 45, overhangRegions: [] });
  expect(dfmOf("t-shape.js", { chamfer: true }, { overhang: 40 }).overhangArea).toBeGreaterThan(0);
});

test("up sets the build direction and which faces rest on the plate", () => {
  expect(dfmOf("t-shape.js", {}, { up: "-z" }).overhangArea).toBe(0);
  expect(dfmOf("t-shape.js", {}, { up: "+x" })).toMatchObject({
    overhangArea: 200,
    overhangRegions: [{ area: 200, maxAngle: 90 }],
  });
});

test("an array reports each solid item and combines their results", () => {
  const r = analyzeDfm(
    [
      jf.cuboid({ size: [10, 10, 10], center: [0, 0, 5] }),
      jf.rectangle({ size: [4, 4] }),
      jf.cuboid({ size: [10, 10, 0.4], center: [20, 0, 5] }),
    ],
    "array",
  );
  expect(r.items.map((it) => it.index)).toEqual([0, 2]);
  expect(r.minWall).toBeCloseTo(0.4, 6);
  expect(r.items[1].overhangArea).toBe(0);
  expect(r.thinArea).toBe(r.items[0].thinArea + r.items[1].thinArea);
  expect(analyzeDfm([], "array")).toMatchObject({ empty: true, minWall: null, items: [] });
});
