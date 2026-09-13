import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const findConfig = (start) => {
  for (let dir = start; ; dir = dirname(dir)) {
    const path = resolve(dir, ".jscad-studio");
    if (existsSync(path)) return path;
    if (dirname(dir) === dir) return null;
  }
};

// Push parameter overrides into the running jscad-work viewer (the user's open
// tab) via the viewer-server's /__studio/params broadcast. The server's
// .jscad-studio is found from the model's directory upward, else from cwd upward.
export const liveParams = async (
  params,
  { modelPath, cwd = process.cwd(), fetchImpl = fetch } = {},
) => {
  const start = modelPath ? dirname(resolve(cwd, modelPath)) : resolve(cwd);
  const cfgPath = findConfig(start);
  if (!cfgPath) {
    throw new Error(
      `no running jscad-work server (no .jscad-studio in ${start} or above); run jscad-work <model.js> first`,
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch {
    throw new Error(`${cfgPath} is corrupt (invalid JSON)`);
  }
  const { serverPort } = cfg;
  let res;
  try {
    res = await fetchImpl(`http://127.0.0.1:${serverPort}/__studio/params`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ params }),
    });
  } catch (e) {
    throw new Error(`jscad-work server unreachable on port ${serverPort}: ${e.message}`);
  }
  if (!res.ok) throw new Error(`live params POST failed: ${res.status}`);
  return res.json();
};
