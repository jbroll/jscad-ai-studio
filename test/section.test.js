import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { jf } from "../lib/jf.js";
import { loadAndRun } from "../lib/model-loader.js";
import { cutGeometry, sectionOutline, writeSectionWrapper } from "../lib/section.js";

const tube = jf.cylinder({ outer: 10, inner: 5, height: 10, segments: 128 });

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("section outline of a tube along its axis nets out the hole", () => {
  const s = sectionOutline(tube, "geom3", { axis: "z", offset: 2 });
  expect(s.dimensions.map((d) => Math.round(d * 1000) / 1000)).toEqual([20, 20, 0]);
  expect(s.area).toBeCloseTo(Math.PI * 75, 0);
});

test("section outline across a tube gives the two wall rectangles", () => {
  const s = sectionOutline(tube, "geom3", { axis: "x", offset: 0 });
  expect(s.boundingBox[0][0]).toBe(0);
  expect(s.dimensions[2]).toBeCloseTo(10, 6);
  expect(s.area).toBeCloseTo(100, 6);
});

test("section outline defaults to the bounding-box center and sums array items", () => {
  const cube = jf.cube({ size: 10 });
  const s = sectionOutline([cube, cube.translate([20, 0, 0])], "array", {
    axis: "y",
    offset: null,
  });
  expect(s.offset).toBe(0);
  expect(s.dimensions).toEqual([30, 0, 10]);
  expect(s.area).toBeCloseTo(200, 6);
});

test("section outline rejects an offset outside the model", () => {
  expect(() => sectionOutline(tube, "geom3", { axis: "z", offset: 50 })).toThrow(
    /section offset 50 is outside the model's z range -5 to 5/,
  );
});

test("cutGeometry keeps the chosen side, keeps colors, and drops items on the other side", () => {
  const cut = cutGeometry(
    [tube.colorize([1, 0, 0]), [jf.cube({ size: 4 }).translate([0, -8, 20])]],
    { axis: "y", offset: null, keep: "+" },
    jf,
  );
  expect(cut).toHaveLength(1);
  expect(cut[0].color).toEqual([1, 0, 0, 1]);
  const [lo, hi] = cut[0].measureBoundingBox();
  expect(lo[1]).toBeCloseTo(0, 6);
  expect(hi[1]).toBeCloseTo(10, 6);
});

test("the section wrapper runs as a model beside the original", () => {
  const dir = mkdtempSync(join(tmpdir(), "section-"));
  dirs.push(dir);
  const model = join(dir, "tube.js");
  writeFileSync(
    model,
    `const jf = require("@jbroll/jscad-fluent");
module.exports = { main: (p) => { p.h = { type: "slider", default: 10, min: 1, max: 20 };
  return jf.cylinder({ outer: 10, inner: 5, height: p.h }); } };`,
  );
  const wrapper = writeSectionWrapper(model, { axis: "z", offset: 1, keep: "-" });
  expect(wrapper.startsWith(join(dir, "."))).toBe(true);
  const run = loadAndRun(wrapper, { h: 20 });
  expect(run.ok).toBe(true);
  const [[, , zlo], [, , zhi]] = run.geom[0].measureBoundingBox();
  expect([zlo, zhi]).toEqual([-10, 1]);
  expect(run.params.map((p) => p.name)).toContain("h");
});
