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

test("getEntry returns entry + source; null for missing id", () => {
  const got = getEntry("mcad/bearing", fixture);
  expect(got.entry.name).toBe("608 Bearing");
  expect(got.source).toMatch(/module\.exports/);
  expect(getEntry("nope", fixture)).toBeNull();
});
