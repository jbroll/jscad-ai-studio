import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { expect, test } from "vitest";
import { getEntry, searchCatalog } from "../mcp/lib/catalog.js";

const fixture = JSON.parse(
  await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("./fixtures/catalog.fixture.json", import.meta.url), "utf8"),
  ),
);

test("ranks the best keyword match first", () => {
  const r = searchCatalog("bearing", {}, fixture);
  expect(r[0].id).toBe("mcad/bearing");
});

test("matches on techniques and tags", () => {
  const r = searchCatalog("gear", {}, fixture);
  expect(r[0].id).toBe("bosl2/gear");
});

test("source + lang filters", () => {
  expect(searchCatalog("", { source: "bosl2" }, fixture).map((e) => e.id)).toEqual(["bosl2/gear"]);
  expect(searchCatalog("", { lang: "js" }, fixture).map((e) => e.id)).toEqual(["mcad/bearing"]);
});

test("runnableOnly excludes failures", () => {
  const ids = searchCatalog("", { runnableOnly: true }, fixture).map((e) => e.id);
  expect(ids).toContain("mcad/bearing");
  expect(ids).not.toContain("snippet/broken");
});

test("library skill states the committed catalog's entry count", () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
  const catalog = JSON.parse(read("../catalog/catalog.json"));
  const skill = read("../skills/jscad-library/SKILL.md");
  expect(skill.match(/catalog of (\d+) models/)?.[1]).toBe(String(catalog.length));
});

test("getEntry returns entry, source, and the absolute path read; null for missing id", () => {
  const got = getEntry("mcad/bearing", fixture);
  expect(got.entry.name).toBe("608 Bearing");
  expect(got.source).toMatch(/module\.exports/);
  expect(isAbsolute(got.path)).toBe(true);
  expect(readFileSync(got.path, "utf8")).toBe(got.source);
  expect(getEntry("nope", fixture)).toBeNull();
});

test("getEntry gives path null when no candidate file exists", () => {
  const got = getEntry("snippet/broken", fixture);
  expect(got).toMatchObject({ path: null, source: null });
});
