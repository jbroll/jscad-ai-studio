import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import { handlers } from "../mcp/lib/tools.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const parse = (res) => JSON.parse(res.content[0].text);

test("export produces a binary STL for a .scad", async () => {
  const res = await handlers.export({ modelPath: fx("cube.scad"), format: "stl" });
  const r = parse(res);
  expect(r.export.mime).toMatch(/stl/);
  expect(r.export.triangleCount).toBeGreaterThanOrEqual(12);
}, 30000);

test("check reports watertight for a .scad solid", async () => {
  const res = await handlers.check({ modelPath: fx("cube.scad") });
  expect(parse(res).check.watertight).toBe(true);
}, 30000);

// Real corpus part: trochoids.scad has top-level epitrochoid() / hypotrochoid()
// calls (lines 68–105) that produce linear-extruded trochoidal solids (~2028
// triangles). It is a self-contained standalone file, not a library-only file,
// and appears on no skip list.
test("a real mcad corpus part evaluates and exports", async () => {
  const part = "/home/john/src/jscadui/apps/jscad-web/examples/openscad/mcad/trochoids.scad";
  if (!existsSync(part)) return; // corpus optional in some checkouts
  const res = await handlers.export({ modelPath: part, format: "stl" });
  const r = parse(res);
  expect(r.ok ?? true).not.toBe(false);
  expect(r.export.bytes).toBeGreaterThan(84);
}, 60000);
