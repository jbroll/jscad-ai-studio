import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInit } from "../../lib/init.js";

const [, , workspace, markerPath] = process.argv;
const childScript = fileURLToPath(new URL("./init-signal-child.js", import.meta.url));

await runInit([], {
  cwd: workspace,
  spawnServer: () => {
    writeFileSync(
      `${workspace}/.jscad-studio`,
      JSON.stringify({ pid: process.pid, serverPort: 1, viewerUrl: "http://127.0.0.1:1/#m.js" }),
    );
    return { pid: process.pid };
  },
  waitForServer: async () => {},
  openBrowser: () => {},
  runClaude: () => spawnSync(process.execPath, [childScript], { stdio: "inherit" }),
  stop: () => writeFileSync(markerPath, String(Date.now())),
  log: () => {},
});
process.stdout.write("driver: init done\n");
