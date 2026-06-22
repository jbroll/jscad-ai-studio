import { expect, test } from "vitest";
import { loadCjsModule, loadModel } from "../mcp/lib/cjs-loader.js";

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

test("loadModel throws if no main()", () => {
  expect(() => loadModel(fx("assembly/partB.js"))).toThrow(/main/);
});
