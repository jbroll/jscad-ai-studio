import { expect, test } from "vitest";
import { handlers } from "../mcp/lib/tools.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

const parse = (res) => JSON.parse(res.content[0].text);

test("eval handler returns ok for a valid model", async () => {
  const res = await handlers.eval({ modelPath: fx("cube.js") });
  expect(parse(res).ok).toBe(true);
});

test("measure handler returns dimensions", async () => {
  const res = await handlers.measure({ modelPath: fx("cube.js") });
  expect(parse(res).measure.dimensions).toEqual([10, 10, 10]);
});

test("params handler lists sliders", async () => {
  const res = await handlers.params({ modelPath: fx("cube.js") });
  expect(parse(res).params.some((p) => p.name === "size")).toBe(true);
});
