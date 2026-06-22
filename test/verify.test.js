import { expect, test } from "vitest";
import { verifyModel } from "../scripts/lib/verify.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("verifies a runnable model", async () => {
  const v = await verifyModel(fx("cube.js"));
  expect(v.runs).toBe(true);
  expect(v.geomType).toBe("geom3");
  expect(v.dimensions).toEqual([10, 10, 10]);
  expect(v.failureClass).toBeNull();
});

test("classifies a broken model as a failure", async () => {
  const v = await verifyModel(fx("broken.js"));
  expect(v.runs).toBe(false);
  expect(v.failureClass).not.toBeNull();
  expect(typeof v.error).toBe("string");
});
