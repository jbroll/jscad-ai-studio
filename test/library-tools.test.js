import { isAbsolute } from "node:path";
import { expect, test } from "vitest";
import { makeLibraryHandlers } from "../mcp/lib/tools.js";

const fixture = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./fixtures/catalog.fixture.json", import.meta.url), "utf8"),
  ),
);
const handlers = makeLibraryHandlers(fixture);
const parse = (res) => JSON.parse(res.content[0].text);

test("library_search returns mapped results", async () => {
  const res = await handlers.library_search({ query: "bearing" });
  const { results } = parse(res);
  expect(results[0]).toMatchObject({ id: "mcad/bearing", source: "mcad", runs: true });
  expect(results[0].dimensions).toEqual([22, 22, 7]);
});

test("library_get returns entry, absolute path, and source", async () => {
  const res = await handlers.library_get({ id: "bosl2/gear" });
  const { entry, path, source } = parse(res);
  expect(entry.name).toBe("Spur Gear");
  expect(isAbsolute(path)).toBe(true);
  expect(path.endsWith("test/fixtures/cube.js")).toBe(true);
  expect(typeof source).toBe("string");
});

test("library_get for an unknown id returns nulls", async () => {
  const res = await handlers.library_get({ id: "nope" });
  expect(parse(res)).toEqual({ entry: null, path: null, source: null });
});

test("library_search filter-only (no query) returns bosl2 entry", async () => {
  const res = await handlers.library_search({ source: "bosl2" });
  const { results } = parse(res);
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]).toMatchObject({ id: "bosl2/gear", source: "bosl2" });
});

test("library_search respects limit", async () => {
  const res = await handlers.library_search({ query: "", limit: 1 });
  const { results } = parse(res);
  expect(results.length).toBeLessThanOrEqual(1);
});
