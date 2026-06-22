import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { enumerateModels, loadSkipList } from "../scripts/lib/enumerate.js";

let root;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "enum-"));
  mkdirSync(join(root, "examples/openscad/mcad"), { recursive: true });
  writeFileSync(join(root, "examples/openscad/mcad/gears.scad"), "cube(1);");
  writeFileSync(join(root, "examples/openscad/mcad/skipme.scad"), "cube(1);");
  writeFileSync(join(root, "examples/openscad/mcad/skip.txt"), "# c\nskipme.scad\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("loadSkipList parses filenames and ignores comments/blanks", () => {
  const set = loadSkipList(join(root, "examples/openscad/mcad/skip.txt"));
  expect(set.has("skipme.scad")).toBe(true);
  expect(set.size).toBe(1);
});

test("enumerateModels lists models, skips skip-listed, returns root-relative paths", () => {
  const out = enumerateModels(
    join(root, "examples"),
    {
      mcad: { dir: "openscad/mcad", ext: ".scad", skipFile: "openscad/mcad/skip.txt" },
    },
    root,
  );
  expect(out.map((m) => m.id)).toEqual(["mcad/gears"]);
  expect(out[0]).toMatchObject({
    lang: "scad",
    source: "mcad",
    path: "examples/openscad/mcad/gears.scad",
  });
});
