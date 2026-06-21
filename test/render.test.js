import { existsSync, statSync } from "node:fs";
import { afterAll, expect, test } from "vitest";
import { closeRender, renderModel } from "../mcp/lib/render.js";

const RUN = process.env.JSCAD_RENDER_TEST === "1";
const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

afterAll(async () => {
  if (RUN) await closeRender();
});

test.skipIf(!RUN)(
  "renders a non-empty PNG of the model",
  async () => {
    const r = await renderModel(fx("cube.js"), { size: [640, 480] });
    expect(existsSync(r.path)).toBe(true);
    expect(statSync(r.path).size).toBeGreaterThan(1000);
    expect(r.width).toBe(640);
  },
  60000,
);

test.skipIf(!RUN)(
  "renders a non-empty PNG of a .scad model",
  async () => {
    const r = await renderModel(fx("cube.scad"), { size: [640, 480] });
    expect(existsSync(r.path)).toBe(true);
    expect(statSync(r.path).size).toBeGreaterThan(1000);
  },
  60000,
);
