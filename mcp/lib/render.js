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

// The canvas and a grid-only scene appear before the model runs, so wait for
// handleEntities to fill #stats-content, or for the viewer's error bar.
const viewerSettled = () => {
  const bar = document.getElementById("error-bar");
  if (bar?.classList.contains("visible")) {
    const name = document.getElementById("error-name")?.innerText ?? "";
    const message = document.getElementById("error-message")?.innerText ?? "";
    return { error: `${name}${message}`.trim() };
  }
  return document.getElementById("stats-content")?.childElementCount ? { ok: true } : false;
};

const waitForModel = async (page, timeoutMs, model) => {
  let settled;
  try {
    const handle = await page.waitForFunction(viewerSettled, null, {
      timeout: timeoutMs,
      polling: 100,
    });
    settled = await handle.jsonValue();
  } catch (err) {
    if (err.name !== "TimeoutError") throw err;
    throw new Error(`render timeout: ${model} did not finish in the viewer within ${timeoutMs} ms`);
  }
  if (settled.error) throw new Error(`model error in viewer: ${settled.error.split("\n")[0]}`);
};

export const renderModel = async (modelPath, opts = {}) => {
  const { size = [800, 600], outPath, view, params, timeoutMs = 60000 } = opts;
  const dir = dirname(modelPath);
  const model = basename(modelPath);
  const { port } = await getServer(dir);
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: size[0], height: size[1] } });
  try {
    await page.goto(`http://127.0.0.1:${port}/#${model}`, { waitUntil: "load" });
    await waitForModel(page, timeoutMs, model);

    // Apply view preset if requested and supported.
    // The jscadui viewer exposes the gizmo as a `jscadui-gizmo` custom element
    // whose `onRotationRequested` callback is wired to ctrl.animateToCommonCamera().
    // Calling it from page.evaluate() triggers the same camera animation as
    // clicking a gizmo face in the interactive browser.
    const gizmoCode = view ? VIEW_TO_GIZMO_CODE[view] : undefined;
    if (gizmoCode) {
      const applied = await page.evaluate((code) => {
        const gizmo = document.querySelector("jscadui-gizmo");
        if (gizmo?.onRotationRequested) {
          gizmo.onRotationRequested(code);
          return true;
        }
        return false;
      }, gizmoCode);
      if (!applied) {
        throw new Error(
          `view preset "${view}" requested but the viewer gizmo camera API was unavailable`,
        );
      }
      // Wait for the 200ms animation + a short settle margin
      await page.waitForTimeout(400);
    }

    if (params) {
      const hasBridge = await page.evaluate(
        () => !!(window.jscadStudio && window.jscadStudio.ready),
      );
      if (!hasBridge) {
        throw new Error(
          "viewer does not expose window.jscadStudio (deploy the jscadui hook — sub-project E Task 5)",
        );
      }
      // setParams resolves after the viewer re-runs and redraws the model.
      await page.evaluate((p) => window.jscadStudio.setParams(p), params);
      await waitForModel(page, timeoutMs, model);
    }

    // The stats box, params panel, menu, and editor drawer sit on top of the canvas.
    await page.addStyleTag({
      content: "#overlay, #menu, #editor, jscadui-gizmo { visibility: hidden !important; }",
    });
    const path = outPath || join(tmpdir(), `jscad-${model}-${size[0]}x${size[1]}.png`);
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({ path });
    return {
      path,
      width: size[0],
      height: size[1],
      ...(view != null ? { view } : {}),
      ...(params ? { params } : {}),
    };
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
