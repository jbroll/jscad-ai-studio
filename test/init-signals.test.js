import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "init-sig-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("init survives Ctrl+C sent to claude's process group and still stops the server after claude exits", async () => {
  const workspace = tmp();
  const markerPath = join(workspace, "stopped.marker");
  const driverScript = fileURLToPath(new URL("./fixtures/init-signal-driver.js", import.meta.url));

  const driver = spawn(process.execPath, [driverScript, workspace, markerPath], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  driver.stdout.on("data", (d) => {
    output += d;
  });
  driver.stderr.on("data", (d) => {
    output += d;
  });

  await new Promise((r) => setTimeout(r, 300));
  process.kill(-driver.pid, "SIGINT");

  const [code, signal] = await new Promise((resolve) => {
    driver.on("exit", (c, s) => resolve([c, s]));
  });

  expect(signal, output).toBeNull();
  expect(code, output).toBe(0);
  expect(output).toContain("driver: init done");
  expect(existsSync(markerPath)).toBe(true);
}, 8000);
