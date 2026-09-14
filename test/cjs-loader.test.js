import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { anchors } from "../lib/anchors.js";
import { loadCjsModule, loadModel } from "../lib/cjs-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("loads a multi-file assembly across nested CJS requires under type:module", () => {
  const main = loadModel(fx("assembly/top.js"));
  const geom = main({});
  // cube size 6 spans -3..3; knob (r2,h4) at x=5 spans 3..7 → union x = -3..7 = 10
  expect(geom.measureDimensions()[0]).toBeCloseTo(10, 1);
});

test("caches a shared dependency (loaded once)", () => {
  const cache = new Map();
  const a1 = loadCjsModule(fx("assembly/partB.js"), cache);
  const a2 = loadCjsModule(fx("assembly/partB.js"), cache);
  expect(a1).toBe(a2);
});

test("resolves an absolute require the same way as a relative one", () => {
  const dir = mkdtempSync(join(tmpdir(), "cjs-abs-"));
  try {
    const model = join(dir, "top.js");
    writeFileSync(
      model,
      `const b = require(${JSON.stringify(fx("assembly/partB.js"))});\nmodule.exports = { main: () => b.knob() };\n`,
    );
    const geom = loadModel(model)({});
    expect(geom.measureDimensions()[2]).toBeCloseTo(4, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadModel throws if no main()", () => {
  expect(() => loadModel(fx("assembly/partB.js"))).toThrow(/main/);
});

test("a model outside the repo requires jscad-anchors and modeling, and raw-style calls keep frames", () => {
  const dir = mkdtempSync(join(tmpdir(), "cjs-anchors-"));
  try {
    const model = join(dir, "block.js");
    writeFileSync(
      model,
      `const { anchors } = require("@jbroll/jscad-anchors");
const { primitives, transforms, measurements } = require("@jscad/modeling");
const main = () => {
  const block = anchors.withAnchors(primitives.cuboid({ size: [10, 10, 4] }), {
    axis: anchors.frame([0, 0, 0], [0, 0, 1]),
  });
  const turned = transforms.translate([5, 0, 0], transforms.rotateX(Math.PI / 2, block));
  measurements.measureBoundingBox(turned);
  return turned;
};
module.exports = { main };
`,
    );
    const frame = anchors(loadModel(model)({})).axis;
    expect(frame.origin).toEqual([5, 0, 0]);
    [0, -1, 0].forEach((c, i) => {
      expect(frame.z[i]).toBeCloseTo(c, 9);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
