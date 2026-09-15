import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { resolveWorkspace, runInit, waitForServerStart } from "../lib/init.js";

const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "init-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("resolveWorkspace: no argument uses the cwd with no fixed model", () => {
  const cwd = tmp();
  expect(resolveWorkspace(cwd, undefined)).toEqual({ workspace: cwd, model: null });
});

test("resolveWorkspace: an existing directory becomes the workspace", () => {
  const cwd = tmp();
  const sub = join(cwd, "sub");
  mkdirSync(sub);
  expect(resolveWorkspace(cwd, "sub")).toEqual({ workspace: sub, model: null });
});

test("resolveWorkspace: an existing model file names the workspace and model", () => {
  const cwd = tmp();
  writeFileSync(join(cwd, "widget.js"), "// existing");
  expect(resolveWorkspace(cwd, "widget.js")).toEqual({ workspace: cwd, model: "widget.js" });
});

test("resolveWorkspace: a new model path without .js gets it added", () => {
  const cwd = tmp();
  expect(resolveWorkspace(cwd, "widget")).toEqual({ workspace: cwd, model: "widget.js" });
});

test("resolveWorkspace: a nonexistent parent directory is an error", () => {
  const cwd = tmp();
  expect(() => resolveWorkspace(cwd, "missing/widget.js")).toThrow(
    `no such directory: ${join(cwd, "missing")}`,
  );
});

test("resolveWorkspace: a nonexistent directory named with a trailing slash is an error", () => {
  const cwd = tmp();
  expect(() => resolveWorkspace(cwd, "newdir/")).toThrow(
    `no such directory: ${join(cwd, "newdir")}`,
  );
});

test("resolveWorkspace: a bare nonexistent name without a slash still becomes a new model", () => {
  const cwd = tmp();
  expect(resolveWorkspace(cwd, "newname")).toEqual({ workspace: cwd, model: "newname.js" });
});

test("resolveWorkspace: an existing .scad model keeps its extension", () => {
  const cwd = tmp();
  writeFileSync(join(cwd, "part.scad"), "cube(1);");
  expect(resolveWorkspace(cwd, "part.scad")).toEqual({ workspace: cwd, model: "part.scad" });
});

test("resolveWorkspace: an unsupported extension is rejected", () => {
  const cwd = tmp();
  expect(() => resolveWorkspace(cwd, "part.stl")).toThrow(/unsupported model extension \.stl/);
});

const fakeConfig = (workspace, port = 4321) => ({
  workspace,
  currentModel: "widget.js",
  serverPort: port,
  pid: process.pid,
  viewerUrl: `http://127.0.0.1:${port}/#widget.js`,
});

const writeConfig = (workspace, cfg) =>
  writeFileSync(join(workspace, ".jscad-studio"), JSON.stringify(cfg));

test("runInit: starts the server, opens the browser, runs claude, then stops the server it started", async () => {
  const cwd = tmp();
  const calls = [];
  const deps = {
    cwd,
    spawnServer: (workspace, model) => {
      calls.push(["spawnServer", workspace, model]);
      writeConfig(workspace, fakeConfig(workspace));
      return { pid: process.pid };
    },
    waitForServer: async (workspace) => calls.push(["waitForServer", workspace]),
    openBrowser: (url) => calls.push(["openBrowser", url]),
    runClaude: (workspace, model) => {
      calls.push(["runClaude", workspace, model]);
      return { status: 0 };
    },
    stop: (workspace) => calls.push(["stop", workspace]),
    log: () => {},
  };
  const status = await runInit(["widget.js"], deps);
  expect(status).toBe(0);
  expect(calls.map((c) => c[0])).toEqual([
    "spawnServer",
    "waitForServer",
    "openBrowser",
    "runClaude",
    "stop",
  ]);
  expect(calls[2][1]).toBe("http://127.0.0.1:4321/#widget.js");
  expect(calls[3][1]).toBe(cwd);
  expect(calls[3][2]).toBe("widget.js");
});

test("runInit: reuses a running server and leaves it running", async () => {
  const cwd = tmp();
  writeConfig(cwd, fakeConfig(cwd, 5555));
  const calls = [];
  const deps = {
    cwd,
    spawnServer: () => calls.push(["spawnServer"]),
    waitForServer: async () => calls.push(["waitForServer"]),
    openBrowser: (url) => calls.push(["openBrowser", url]),
    runClaude: () => {
      calls.push(["runClaude"]);
      return { status: 0 };
    },
    stop: () => calls.push(["stop"]),
    log: () => {},
  };
  await runInit(["widget.js"], deps);
  expect(calls.map((c) => c[0])).toEqual(["openBrowser", "runClaude"]);
  expect(calls[0][1]).toBe("http://127.0.0.1:5555/#widget.js");
});

test("runInit: claude not found prints the URL, leaves the server running, and exits 0", async () => {
  const cwd = tmp();
  const calls = [];
  const logs = [];
  const deps = {
    cwd,
    spawnServer: (workspace) => {
      calls.push(["spawnServer"]);
      writeConfig(workspace, fakeConfig(workspace));
      return { pid: process.pid };
    },
    waitForServer: async () => calls.push(["waitForServer"]),
    openBrowser: () => calls.push(["openBrowser"]),
    runClaude: () => {
      calls.push(["runClaude"]);
      return { error: Object.assign(new Error("not found"), { code: "ENOENT" }) };
    },
    stop: () => calls.push(["stop"]),
    log: (line) => logs.push(line),
  };
  const status = await runInit(["widget.js"], deps);
  expect(status).toBe(0);
  expect(calls.map((c) => c[0])).toEqual([
    "spawnServer",
    "waitForServer",
    "openBrowser",
    "runClaude",
  ]);
  expect(logs.some((l) => l.includes("claude not found"))).toBe(true);
  expect(logs.some((l) => l.includes("http://127.0.0.1"))).toBe(true);
});

test("runInit: returns claude's exit status", async () => {
  const cwd = tmp();
  const deps = {
    cwd,
    spawnServer: (workspace) => {
      writeConfig(workspace, fakeConfig(workspace));
      return { pid: process.pid };
    },
    waitForServer: async () => {},
    openBrowser: () => {},
    runClaude: () => ({ status: 3 }),
    stop: () => {},
    log: () => {},
  };
  expect(await runInit(["widget.js"], deps)).toBe(3);
});

test("runInit: exits 1 when claude dies from a signal", async () => {
  const cwd = tmp();
  const deps = {
    cwd,
    spawnServer: (workspace) => {
      writeConfig(workspace, fakeConfig(workspace));
      return { pid: process.pid };
    },
    waitForServer: async () => {},
    openBrowser: () => {},
    runClaude: () => ({ status: null, signal: "SIGKILL" }),
    stop: () => {},
    log: () => {},
  };
  expect(await runInit(["widget.js"], deps)).toBe(1);
});

test("runInit: stops the server only when its pid still matches the one it started", async () => {
  const cwd = tmp();
  const calls = [];
  const deps = {
    cwd,
    spawnServer: (workspace) => {
      writeConfig(workspace, fakeConfig(workspace));
      return { pid: 999999 };
    },
    waitForServer: async () => {},
    openBrowser: () => {},
    runClaude: () => ({ status: 0 }),
    stop: (workspace) => calls.push(["stop", workspace]),
    log: () => {},
  };
  await runInit(["widget.js"], deps);
  expect(calls).toEqual([]);
});

test("waitForServerStart: rejects as soon as the child exits, without waiting out the timeout", async () => {
  const workspace = tmp();
  const child = new EventEmitter();
  const start = Date.now();
  const pending = waitForServerStart(workspace, child, { timeoutMs: 5000, intervalMs: 50 });
  setTimeout(() => child.emit("exit", 1, null), 20);
  await expect(pending).rejects.toThrow(/server process exited before starting/);
  expect(Date.now() - start).toBeLessThan(1000);
});

test("waitForServerStart: kills the child and reports the log tail on timeout", async () => {
  const workspace = tmp();
  writeFileSync(join(workspace, ".jscad-work.log"), "line one\nline two\n");
  const child = new EventEmitter();
  const calls = [];
  child.kill = () => calls.push("killed");
  await expect(
    waitForServerStart(workspace, child, { timeoutMs: 50, intervalMs: 10 }),
  ).rejects.toThrow(/did not start within 50ms\nline one\nline two/);
  expect(calls).toEqual(["killed"]);
});
