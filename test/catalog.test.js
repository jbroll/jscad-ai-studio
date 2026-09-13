import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { expect, test } from "vitest";
import { getEntry, searchCatalog, stem } from "../mcp/lib/catalog.js";

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

test("runnableOnly defaults to true; false includes failing entries", () => {
  expect(searchCatalog("", {}, fixture).map((e) => e.id)).not.toContain("snippet/broken");
  expect(searchCatalog("", { runnableOnly: false }, fixture).map((e) => e.id)).toContain(
    "snippet/broken",
  );
});

test("plural queries match singular words", () => {
  expect(searchCatalog("bearings", {}, fixture)[0].id).toBe("mcad/bearing");
  expect(searchCatalog("gears", {}, fixture)[0].id).toBe("bosl2/gear");
});

test("stem reduces plurals and common suffixes to one form", () => {
  expect(stem("bearings")).toBe(stem("bearing"));
  expect(stem("boxes")).toBe("box");
  expect(stem("threaded")).toBe("thread");
  expect(stem("glass")).toBe("glass");
  expect(stem("m3")).toBe("m3");
});

test("synonyms match at lower weight than the word itself", () => {
  const screws = searchCatalog("screws", {}, fixture).map((e) => e.id);
  expect(screws[0]).toBe("nopscadlib/m3-bolt");
  expect(screws).toContain("nopscadlib/enclosure");
  expect(searchCatalog("case", {}, fixture)[0].id).toBe("nopscadlib/enclosure");
  expect(searchCatalog("bolt", {}, fixture)[0].id).toBe("nopscadlib/m3-bolt");
});

test("maxSize and minSize filter on dimensions, as a number or per axis", () => {
  const ids = (f) => searchCatalog("", f, fixture).map((e) => e.id);
  expect(ids({ maxSize: 25 }).sort()).toEqual(["mcad/bearing", "nopscadlib/m3-bolt"]);
  expect(ids({ minSize: 30 })).toEqual(["nopscadlib/enclosure"]);
  expect(ids({ minSize: [30, 30, null] }).sort()).toEqual(["bosl2/gear", "nopscadlib/enclosure"]);
  expect(ids({ minSize: [null, null, 10], maxSize: [10, 10, null] })).toEqual([
    "nopscadlib/m3-bolt",
  ]);
  expect(ids({ maxSize: 1000, runnableOnly: false })).not.toContain("snippet/broken");
});

test("parametric filter keeps or drops parametric entries", () => {
  expect(searchCatalog("", { parametric: true }, fixture).map((e) => e.id)).toEqual([
    "mcad/bearing",
  ]);
  expect(searchCatalog("", { parametric: false }, fixture).map((e) => e.id)).not.toContain(
    "mcad/bearing",
  );
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
