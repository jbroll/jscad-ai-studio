import { expect, test } from "vitest";
import { describeModel } from "../scripts/lib/describe.js";

const mockClient = (text) => ({
  messages: { create: async () => ({ content: [{ type: "text", text }] }) },
});

test("parses a well-formed JSON description", async () => {
  const client = mockClient(
    JSON.stringify({
      name: "Gear",
      description: "A gear.",
      tags: ["gear"],
      techniques: ["involute"],
    }),
  );
  const d = await describeModel(client, { source: "cube(1);", id: "mcad/gear" });
  expect(d).toEqual({
    name: "Gear",
    description: "A gear.",
    tags: ["gear"],
    techniques: ["involute"],
  });
});

test("falls back safely on persistently malformed output", async () => {
  const client = mockClient("not json at all");
  const d = await describeModel(client, { source: "cube(1);", id: "mcad/widget" });
  expect(d.name).toBe("mcad/widget");
  expect(d.tags).toEqual([]);
});
