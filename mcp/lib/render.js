import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { chromium } from "playwright";
import { startViewerServer } from "./viewer-server.js";

let browser;
const servers = new Map(); // directory -> handle

const getBrowser = async () => {
  if (!browser) {
    browser = await chromium.launch({ executablePath: process.env.JSCAD_CHROMIUM || undefined });
  }
  return browser;
};

const getServer = async (dir) => {
  if (!servers.has(dir)) servers.set(dir, await startViewerServer(dir));
  return servers.get(dir);
};

// Map render `view` names to jscadui gizmo camera codes.
// The gizmo fires onRotationRequested(code) → ctrl.animateToCommonCamera(code).
// Single-letter codes: S=front, N=back, T=top, B=bottom, W=left, E=right.
// Compound codes ("TS") resolve to isometric-ish angles via getCommonRotCombined.
// "iso" → "TS" gives a top+front diagonal, a useful overview angle.
const VIEW_TO_GIZMO_CODE = {
  front: "S",
  back: "N",
  top: "T",
  bottom: "B",
  left: "W",
  right: "E",
  iso: "TS", // top+south diagonal ≈ isometric overview
};

// NOTE: `params` injection is NOT supported.
// The viewer's parameter system is managed entirely inside the page's web worker
// via a proxy-state mechanism; there is no URL query or accessible window API to
// set parameter values from outside the page. Implement params injection in a
// future sub-project by adding a postMessage channel to the viewer worker setup.

export const renderModel = async (modelPath, opts = {}) => {
  const { size = [800, 600], outPath, view } = opts;
  const dir = dirname(modelPath);
  const model = basename(modelPath);
  const { port } = await getServer(dir);
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: size[0], height: size[1] } });
  try {
    await page.goto(`http://127.0.0.1:${port}/#${model}`, { waitUntil: "load" });
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2500); // settle: model eval + first render

    // Apply view preset if requested and supported.
    // The jscadui viewer exposes the gizmo as a `jscadui-gizmo` custom element
    // whose `onRotationRequested` callback is wired to ctrl.animateToCommonCamera().
    // Calling it from page.evaluate() triggers the same camera animation as
    // clicking a gizmo face in the interactive browser.
    const gizmoCode = view ? VIEW_TO_GIZMO_CODE[view] : undefined;
    if (gizmoCode) {
      await page.evaluate((code) => {
        const gizmo = document.querySelector("jscadui-gizmo");
        if (gizmo?.onRotationRequested) gizmo.onRotationRequested(code);
      }, gizmoCode);
      // Wait for the 200ms animation + a short settle margin
      await page.waitForTimeout(400);
    }

    const path = outPath || join(tmpdir(), `jscad-${model}-${size[0]}x${size[1]}.png`);
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({ path });
    return { path, width: size[0], height: size[1], view: view ?? "default" };
  } finally {
    await page.close();
  }
};

export const closeRender = async () => {
  await Promise.all(
    [...servers.values()].map(({ server }) => new Promise((res) => server.close(res))),
  );
  servers.clear();
  if (browser) {
    await browser.close();
    browser = undefined;
  }
};
