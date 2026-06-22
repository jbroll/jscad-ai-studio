import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Push parameter overrides into the running jscad-work viewer (the user's open
// tab) via the viewer-server's /__studio/params broadcast. Requires a jscad-work
// session (it writes .jscad-studio with the server port).
export const liveParams = async (params, { cwd = process.cwd(), fetchImpl = fetch } = {}) => {
  const cfgPath = resolve(cwd, ".jscad-studio");
  if (!existsSync(cfgPath)) {
    throw new Error(
      "no running jscad-work server (.jscad-studio not found) — run jscad-work first",
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  } catch {
    throw new Error(".jscad-studio is corrupt (invalid JSON)");
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
