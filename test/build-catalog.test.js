import { expect, test } from "vitest";
import { buildCatalog } from "../scripts/build-catalog.js";

const models = [
  { id: "mcad/a", path: "examples/openscad/mcad/a.scad", lang: "scad", source: "mcad" },
  { id: "mcad/b", path: "examples/openscad/mcad/b.scad", lang: "scad", source: "mcad" },
];

test("builds entries, classifies failures, and reuses unchanged by srcHash", async () => {
  let describeCalls = 0;
  const verify = async (m) =>
    m.id === "mcad/b"
      ? {
          runs: false,
          geomType: "unknown",
          dimensions: null,
          polygonCount: null,
          failureClass: "transpiler-gap",
          error: "x",
        }
      : {
          runs: true,
          geomType: "geom3",
          dimensions: [1, 1, 1],
          polygonCount: 12,
          failureClass: null,
          error: null,
        };
  const describe = async (m) => {
    describeCalls++;
    return { name: m.id, description: "d", tags: ["t"], techniques: [] };
  };
  const hashOf = (m) => `h-${m.id}`;

  const first = await buildCatalog({ models, existing: [], verify, describe, hashOf });
  expect(first.entries).toHaveLength(2);
  expect(first.report["transpiler-gap"]).toBe(1);
  expect(describeCalls).toBe(2);

  // Second run with one unchanged (same srcHash) -> describe NOT called for it
  describeCalls = 0;
  const second = await buildCatalog({ models, existing: first.entries, verify, describe, hashOf });
  expect(describeCalls).toBe(0); // both hashes unchanged -> fully reused
  expect(second.entries).toHaveLength(2);
});
