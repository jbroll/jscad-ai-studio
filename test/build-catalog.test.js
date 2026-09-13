import { expect, test } from "vitest";
import { buildCatalog } from "../scripts/build-catalog.js";
import { declaresParameters } from "../scripts/lib/parametric.js";

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

test("sets parametric on new and reused entries without describing again", async () => {
  const verify = async () => ({ runs: true });
  let describeCalls = 0;
  const describe = async () => {
    describeCalls++;
    return {};
  };
  const hashOf = (m) => `h-${m.id}`;
  const parametricOf = (m) => m.id === "mcad/a";
  const existing = [{ id: "mcad/b", srcHash: "h-mcad/b", runs: true }];

  const { entries } = await buildCatalog({
    models,
    existing,
    verify,
    describe,
    hashOf,
    parametricOf,
  });
  expect(describeCalls).toBe(1);
  expect(entries.map((e) => [e.id, e.parametric])).toEqual([
    ["mcad/a", true],
    ["mcad/b", false],
  ]);
});

test("declaresParameters recognizes definitions, annotations, and params-proxy fields", () => {
  expect(declaresParameters("module.exports = { main, getParameterDefinitions }")).toBe(true);
  expect(declaresParameters("const main = ({ //@jscad-params\n size = 10 }) => {}")).toBe(true);
  expect(declaresParameters("params.rows = { type: 'slider', default: 4 }")).toBe(true);
  expect(declaresParameters("params.spoke = {\n  type: 'choice',\n}")).toBe(true);
  expect(declaresParameters("params._type = 'Two Cars'")).toBe(true);
  expect(declaresParameters("function main() { return cube({ size: 10 }) }")).toBe(false);
});
