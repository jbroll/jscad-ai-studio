import { expect, test } from "vitest";
import { loadAndRun } from "../lib/model-loader.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("runs a valid geom3 model and lists params", () => {
  const r = loadAndRun(fx("cube.js"), {});
  expect(r.ok).toBe(true);
  expect(r.geomType).toBe("geom3");
  const size = r.params.find((p) => p.name === "size");
  expect(size).toMatchObject({ default: 10, min: 5, max: 20 });
});

test("applies parameter overrides", () => {
  const r = loadAndRun(fx("cube.js"), { size: 20 });
  expect(r.geom.measureDimensions()).toEqual([20, 20, 20]);
});

test("captures a runtime error with a line number", () => {
  const r = loadAndRun(fx("broken.js"), {});
  expect(r.ok).toBe(false);
  expect(typeof r.error).toBe("string");
  expect(r.line).toBeGreaterThan(0);
});

test("a .scad model with parameter overrides fails and names them", () => {
  const r = loadAndRun(fx("cube.scad"), { size: 5, "motor.stack": 30 });
  expect(r.ok).toBe(false);
  expect(r.error).toBe(".scad models take no parameter overrides; not applied: size, motor.stack");
});

test("classifies a 2D model as geom2", () => {
  const r = loadAndRun(fx("plate.js"), {});
  expect(r.geomType).toBe("geom2");
});
