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

test("library_get returns entry + source", async () => {
  const res = await handlers.library_get({ id: "bosl2/gear" });
  const { entry, source } = parse(res);
  expect(entry.name).toBe("Spur Gear");
  expect(typeof source === "string" || source === null).toBe(true);
});
