import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { runCli } from "../mcp/lib/cli.js";
import { measureDelta } from "../mcp/lib/compare.js";
import { decodePng, encodePng } from "../mcp/lib/png.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "compare-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const run = async (argv, cwd = tmp()) => {
  const out = [];
  const err = [];
  const code = await runCli(argv, { cwd, stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  const stdout = out.join("\n");
  return { code, stdout, stderr: err.join("\n"), json: stdout ? JSON.parse(stdout) : undefined };
};

const box = (dims, center, volume) => ({ dimensions: dims, center, volume });

test("measureDelta reports b minus a and lists only changed, added, and removed parts", () => {
  const a = {
    ...box([10, 10, 10], [0, 0, 5], 1000),
    parts: [
      { part: "0", ...box([10, 10, 10], [0, 0, 5], 1000) },
      { part: "1", ...box([2, 2, 2], [9, 0, 0], 8) },
      { part: "2", ...box([1, 1, 1], [0, 0, 0], 1) },
    ],
  };
  const b = {
    ...box([10, 10, 12.5], [0, 0, 6.25], 1250.1),
    parts: [
      { part: "0", ...box([10, 10, 12.5], [0, 0, 6.25], 1250) },
      { part: "1", ...box([2, 2, 2], [9, 0, 0], 8) },
      { part: "3", ...box([1, 1, 1], [5, 5, 5], 1) },
    ],
  };
  expect(measureDelta(a, b)).toEqual({
    delta: { dimensions: [0, 0, 2.5], center: [0, 0, 1.25], volume: 250.1 },
    parts: [
      { part: "0", dimensions: [0, 0, 2.5], center: [0, 0, 1.25], volume: 250 },
      { part: "3", added: true, dimensions: [1, 1, 1], center: [5, 5, 5] },
      { part: "2", removed: true },
    ],
    unchangedParts: 1,
  });
});

test("compare MODEL -p JSON measures defaults against the override", async () => {
  const r = await run(["compare", fx("cube.js"), "-p", '{"size":18}']);
  expect(r.code).toBe(0);
  expect(r.json.a).toMatchObject({ source: fx("cube.js"), dimensions: [10, 10, 10] });
  expect(r.json.b).toMatchObject({ params: { size: 18 }, dimensions: [18, 18, 18] });
  expect(r.json.delta.dimensions).toEqual([8, 8, 8]);
  expect(r.json.delta.volume).toBeCloseTo(4832, 3);
  expect(r.json.parts).toBeUndefined();
});

test("compare a saved measure result with a model run and diff its parts", async () => {
  const dir = tmp();
  const saved = await run(["measure", fx("array.js"), "--parts"], dir);
  writeFileSync(join(dir, "before.json"), saved.stdout);
  const same = await run(["compare", "before.json", fx("array.js")], dir);
  expect(same.code).toBe(0);
  expect(same.json).toMatchObject({ parts: [], unchangedParts: 2 });
  expect(same.json.delta.dimensions).toEqual([0, 0, 0]);
});

test("compare MODEL -p A -p B runs both parameter sets", async () => {
  const r = await run(["compare", fx("cube.js"), "-p", '{"size":6}', "-p", '{"size":7}']);
  expect(r.json.a.params).toEqual({ size: 6 });
  expect(r.json.delta.dimensions).toEqual([1, 1, 1]);
});

test("compare names the side whose model failed", async () => {
  const r = await run(["compare", fx("cube.js"), fx("broken.js")]);
  expect(r.code).toBe(1);
  expect(r.stderr).toMatch(/^error: b \(broken\.js\): .*nonExistentMethod/);
});

const image = (dir, name, paint) => {
  const data = Buffer.alloc(10 * 10 * 4, 255);
  paint?.(data);
  writeFileSync(join(dir, name), encodePng({ width: 10, height: 10, data }));
  return name;
};

test("compare two PNGs counts differing pixels and writes a diff image", async () => {
  const dir = tmp();
  const a = image(dir, "a.png");
  const b = image(dir, "b.png", (data) => data.fill(0, 0, 4 * 5));
  const r = await run(["compare", a, b], dir);
  expect(r.code).toBe(0);
  expect(r.json).toMatchObject({ differingPixels: 5, totalPixels: 100, percent: 5, threshold: 0 });
  expect(r.json.diff).toBe(join(dir, ".jscad-work", "a-vs-b-diff.png"));
  expect(decodePng(readFileSync(r.json.diff)).width).toBe(10);
  const out = await run(["compare", a, b, "-o", "d/diff.png", "--threshold", "255"], dir);
  expect(out.json.differingPixels).toBe(0);
  expect(existsSync(join(dir, "d/diff.png"))).toBe(true);
});

test.each([
  [["compare", fx("cube.js")], /give B as a second model or result file, or as -p JSON/],
  [["compare", fx("cube.js"), "-p", "{}", "-p", "{}", "-p", "{}"], /-p is given at most twice/],
  [["compare", fx("cube.js"), "--threshold", "3", "-p", "{}"], /apply to comparing PNGs/],
  [["compare", "nope.js", fx("cube.js")], /no such file: nope\.js/],
])("compare usage error: %j", async (argv, message) => {
  const r = await run(argv);
  expect(r.code).toBe(2);
  expect(r.stderr).toMatch(message);
});

test("compare rejects -p on a saved result and a PNG against a model", async () => {
  const dir = tmp();
  writeFileSync(
    join(dir, "r.json"),
    JSON.stringify({ ok: true, measure: { dimensions: [1, 1, 1] } }),
  );
  const saved = await run(["compare", "r.json", fx("cube.js"), "-p", "{}", "-p", "{}"], dir);
  expect(saved.stderr).toMatch(/-p cannot apply to r\.json/);
  const mixed = await run(["compare", image(dir, "a.png"), fx("cube.js")], dir);
  expect(mixed.code).toBe(2);
  expect(mixed.stderr).toMatch(/compare a PNG with another PNG/);
});
