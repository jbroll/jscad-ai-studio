import { existsSync, readFileSync, statSync } from "node:fs";
import { afterAll, expect, test } from "vitest";
import { closeRender, renderModel, renderViews } from "../mcp/lib/render.js";

const RUN = process.env.JSCAD_RENDER_TEST === "1";
const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const pngSize = (path) => {
  const png = readFileSync(path);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

afterAll(async () => {
  if (RUN) await closeRender();
});

test.skipIf(!RUN)(
  "renders a PNG of the model at the requested size",
  async () => {
    const r = await renderModel(fx("cube.js"), { size: [640, 480] });
    expect(existsSync(r.path)).toBe(true);
    expect(statSync(r.path).size).toBeGreaterThan(1000);
    expect(r.width).toBe(640);
    expect(pngSize(r.path)).toEqual([640, 480]);
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

test.skipIf(!RUN)(
  "renders a view preset to a non-empty PNG",
  async () => {
    const r = await renderModel(fx("cube.js"), { size: [400, 300], view: "front" });
    expect(existsSync(r.path)).toBe(true);
    expect(statSync(r.path).size).toBeGreaterThan(1000);
  },
  60000,
);

test.skipIf(!RUN)(
  "renders several views from one page load",
  async () => {
    const renders = await renderViews(fx("cube.js"), { size: [400, 300], views: ["top", "iso"] });
    expect(renders.map((r) => r.view)).toEqual(["top", "iso"]);
    const [top, iso] = renders.map((r) => readFileSync(r.path));
    expect(pngSize(renders[1].path)).toEqual([400, 300]);
    expect(top.equals(iso)).toBe(false);
  },
  60000,
);

test.skipIf(!RUN)(
  "reports a model that throws in the viewer instead of capturing an empty scene",
  async () => {
    await expect(renderModel(fx("broken.js"), { size: [400, 300] })).rejects.toThrow(
      /model error in viewer: .*nonExistentMethod/,
    );
  },
  60000,
);

test.skipIf(!RUN)(
  "names the timeout when the viewer does not finish",
  async () => {
    await expect(renderModel(fx("cube.js"), { size: [400, 300], timeoutMs: 1 })).rejects.toThrow(
      /render timeout: cube\.js .* 1 ms/,
    );
  },
  60000,
);

test.skipIf(!RUN)(
  "renders with injected params to a non-empty PNG",
  async () => {
    const r = await renderModel(fx("cube.js"), { size: [400, 300], params: { size: 18 } });
    expect(existsSync(r.path)).toBe(true);
    expect(statSync(r.path).size).toBeGreaterThan(1000);
    expect(r.params).toEqual({ size: 18 });
  },
  60000,
);
