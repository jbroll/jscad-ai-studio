import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { discoverPatterns, enumerateModels, isExcluded } from "../scripts/lib/enumerate.js";

let root;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "enum-"));
  const mcad = join(root, "examples/openscad/mcad");
  mkdirSync(join(mcad, "tests"), { recursive: true });
  mkdirSync(join(mcad, "structural"), { recursive: true });
  writeFileSync(join(mcad, "gears.scad"), "cube(1);");
  writeFileSync(join(mcad, "skipme.scad"), "cube(1);");
  writeFileSync(join(mcad, "tests/gear_test.scad"), "cube(1);");
  writeFileSync(join(mcad, "structural/helper.scad"), "// lib");
  // skip.txt at the lib root (basename match) + exclude.txt (trailing-slash dir prefix)
  writeFileSync(join(mcad, "skip.txt"), "# comment\nskipme.scad\n");
  writeFileSync(join(mcad, "exclude.txt"), "structural/\n");
  // nested skip.txt under tests/ (anchored basename)
  writeFileSync(join(mcad, "tests/skip.txt"), "gear_test.scad\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("discoverPatterns finds skip.txt + exclude.txt recursively", () => {
  const pats = discoverPatterns(join(root, "examples/openscad/mcad"));
  // 3 files contribute patterns: root skip.txt, nested tests/skip.txt, root exclude.txt
  expect(pats.length).toBe(3);
});

test("isExcluded honors basename, trailing-slash dir prefix, and nested scope", () => {
  const mcad = join(root, "examples/openscad/mcad");
  const pats = discoverPatterns(mcad);
  expect(isExcluded(join(mcad, "skipme.scad"), pats)).toBe(true); // basename skip
  expect(isExcluded(join(mcad, "structural/helper.scad"), pats)).toBe(true); // dir-prefix exclude
  expect(isExcluded(join(mcad, "tests/gear_test.scad"), pats)).toBe(true); // nested skip.txt
  expect(isExcluded(join(mcad, "gears.scad"), pats)).toBe(false); // kept
});

test("enumerateModels drops skip/exclude-listed files, returns root-relative paths", () => {
  const out = enumerateModels(
    join(root, "examples"),
    { mcad: { dir: "openscad/mcad", ext: ".scad" } },
    root,
  );
  expect(out.map((m) => m.id)).toEqual(["mcad/gears"]);
  expect(out[0]).toMatchObject({
    lang: "scad",
    source: "mcad",
    path: "examples/openscad/mcad/gears.scad",
  });
});
