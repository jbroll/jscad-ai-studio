import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { chromium } from "playwright";
import { writeSectionWrapper } from "./section.js";
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
const VIEW_TO_GIZMO_CODE = {
  front: "S",
  back: "N",
  top: "T",
  bottom: "B",
  left: "W",
  right: "E",
  iso: "TS",
};

// The editor drawer takes half the layout, and the stats box, params panel, and
// menu sit on the canvas. Hiding them before the viewer lays out gives a canvas
// the size of the viewport.
const HIDE_UI = "#editor, #overlay, #menu, jscadui-gizmo { display: none !important; }";

const hideUi = (css) => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = css;
    document.head.append(style);
  });
};

// The canvas and a grid-only scene appear before the model runs, so wait for
// handleEntities to fill #stats-content, or for the viewer's error bar.
const viewerSettled = () => {
  const bar = document.getElementById("error-bar");
  if (bar?.classList.contains("visible")) {
    const name = document.getElementById("error-name")?.textContent ?? "";
    const message = document.getElementById("error-message")?.textContent ?? "";
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

const applyView = async (page, view) => {
  const code = VIEW_TO_GIZMO_CODE[view];
  if (!code) throw new Error(`unknown view "${view}"`);
  const applied = await page.evaluate((c) => {
    const gizmo = document.querySelector("jscadui-gizmo");
    if (!gizmo?.onRotationRequested) return false;
    gizmo.onRotationRequested(c);
    return true;
  }, code);
  if (!applied) {
    throw new Error(
      `view preset "${view}" requested but the viewer gizmo camera API was unavailable`,
    );
  }
  // The viewer exposes no end-of-animation signal; its camera animation runs 200 ms.
  await page.waitForTimeout(400);
};

const applyParams = async (page, params, timeoutMs, model) => {
  const hasBridge = await page.evaluate(() => !!window.jscadStudio?.ready);
  if (!hasBridge) {
    throw new Error(
      "viewer does not expose window.jscadStudio (deploy the jscadui hook — sub-project E Task 5)",
    );
  }
  // setParams resolves after the viewer re-runs and redraws the model.
  await page.evaluate((p) => window.jscadStudio.setParams(p), params);
  await waitForModel(page, timeoutMs, model);
};

// Loads the model once and writes one PNG per view. `views` entries may be
// undefined for the viewer's default camera; `paths[i]` defaults to the temp dir.
// `section` ({ axis, offset, keep }) renders a generated wrapper that cuts the
// model with a boolean, so cut faces are closed solids in the item's color.
export const renderViews = async (modelPath, opts = {}) => {
  const {
    size = [800, 600],
    views = [undefined],
    paths = [],
    params,
    section,
    timeoutMs = 60000,
  } = opts;
  const dir = dirname(modelPath);
  const model = basename(modelPath);
  const { port } = await getServer(dir);
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: size[0], height: size[1] } });
  let wrapper;
  try {
    await page.addInitScript(hideUi, HIDE_UI);
    // Without the viewer's zoom-to-fit setting, small parts fill a few dozen pixels.
    await page.addInitScript(() => localStorage.setItem("engine.zoomToFit", "true"));
    if (section) wrapper = writeSectionWrapper(modelPath, section);
    const target = wrapper ? basename(wrapper) : model;
    await page.goto(`http://127.0.0.1:${port}/#${target}`, { waitUntil: "load" });
    await waitForModel(page, timeoutMs, model);
    if (params) await applyParams(page, params, timeoutMs, model);

    const renders = [];
    for (const [i, view] of views.entries()) {
      if (view) await applyView(page, view);
      const path =
        paths[i] ?? join(tmpdir(), `jscad-${model}-${view ?? "default"}-${size[0]}x${size[1]}.png`);
      await page.locator("canvas").first().screenshot({ path });
      renders.push({ view: view ?? null, path });
    }
    return renders;
  } finally {
    await page.close();
    if (wrapper) rmSync(wrapper, { force: true });
  }
};

export const renderModel = async (modelPath, opts = {}) => {
  const { size = [800, 600], outPath, view, params, timeoutMs } = opts;
  const [{ path }] = await renderViews(modelPath, {
    size,
    views: [view],
    paths: [outPath],
    params,
    timeoutMs,
  });
  return {
    path,
    width: size[0],
    height: size[1],
    ...(view != null ? { view } : {}),
    ...(params ? { params } : {}),
  };
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
