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

export const renderModel = async (modelPath, opts = {}) => {
  const { size = [800, 600], outPath } = opts;
  const dir = dirname(modelPath);
  const model = basename(modelPath);
  const { port } = await getServer(dir);
  const b = await getBrowser();
  const page = await b.newPage({ viewport: { width: size[0], height: size[1] } });
  try {
    await page.goto(`http://127.0.0.1:${port}/#${model}`, { waitUntil: "load" });
    await page.waitForSelector("canvas", { timeout: 30000 });
    await page.waitForTimeout(2500); // settle: model eval + first render
    const path = outPath || join(tmpdir(), `jscad-${model}-${size[0]}x${size[1]}.png`);
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({ path });
    return { path, width: size[0], height: size[1] };
  } finally {
    await page.close();
  }
};

export const closeRender = async () => {
  for (const { server } of servers.values()) server.close();
  servers.clear();
  if (browser) {
    await browser.close();
    browser = undefined;
  }
};
