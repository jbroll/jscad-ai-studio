import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  agentsMd,
  CLAUDE_MD,
  isServerRunning,
  modelTemplate,
  readConfig,
  scaffoldWorkspace,
  stopServer,
} from "../mcp/lib/workspace.js";

const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ws-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const writeCfg = (dir, pid) =>
  writeFileSync(join(dir, ".jscad-studio"), JSON.stringify({ serverPort: 1234, pid }));

test("isServerRunning: true for a live pid, false for missing/dead/malformed", () => {
  const a = tmp();
  expect(isServerRunning(a)).toBe(false); // no file
  writeCfg(a, process.pid);
  expect(isServerRunning(a)).toBe(true); // this process is alive
  const b = tmp();
  writeFileSync(join(b, ".jscad-studio"), "not json");
  expect(isServerRunning(b)).toBe(false); // malformed
});

test("isServerRunning: false for a dead pid", async () => {
  const dir = tmp();
  const child = spawn("node", ["-e", "setTimeout(()=>{},100000)"]);
  await new Promise((r) => setTimeout(r, 50));
  const pid = child.pid;
  child.kill("SIGKILL");
  await new Promise((r) => child.on("exit", r));
  writeCfg(dir, pid);
  expect(isServerRunning(dir)).toBe(false);
});

test("stopServer: kills a live pid and removes the file", async () => {
  const dir = tmp();
  const child = spawn("node", ["-e", "setTimeout(()=>{},100000)"]);
  await new Promise((r) => setTimeout(r, 50));
  writeCfg(dir, child.pid);
  const res = stopServer(dir);
  expect(res.status).toBe("stopped");
  expect(existsSync(join(dir, ".jscad-studio"))).toBe(false);
  await new Promise((r) => setTimeout(r, 50));
  expect(child.killed || child.exitCode !== null || child.signalCode !== null).toBe(true);
});

test("stopServer: none when no config, stale when pid dead", () => {
  const dir = tmp();
  expect(stopServer(dir).status).toBe("none");
  writeCfg(dir, 2 ** 30); // implausible pid
  expect(stopServer(dir).status).toBe("stale");
  expect(existsSync(join(dir, ".jscad-studio"))).toBe(false);
});

test("scaffoldWorkspace: writes AGENTS.md, CLAUDE.md, and a starter model in an empty dir", () => {
  const dir = tmp();
  const res = scaffoldWorkspace(dir, "widget.js");
  expect(res.model).toBe("widget.js");
  expect(res.created.sort()).toEqual(["AGENTS.md", "CLAUDE.md", "widget.js"]);
  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(CLAUDE_MD);
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  expect(agents).toMatch(/nohup jscad-work widget\.js/);
  expect(agents).toMatch(/Read `JSCAD\.md`/);
  expect(readFileSync(join(dir, "widget.js"), "utf8")).toMatch(/module\.exports = \{ main \}/);
});

test("scaffoldWorkspace: keeps existing pointer files and reuses an existing model", () => {
  const dir = tmp();
  writeFileSync(join(dir, "AGENTS.md"), "MINE");
  writeFileSync(join(dir, "gear.js"), "// existing");
  const res = scaffoldWorkspace(dir); // no model arg → use existing gear.js
  expect(res.model).toBe("gear.js");
  expect(res.kept).toContain("AGENTS.md");
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).toBe("MINE"); // not clobbered
  expect(res.created).toContain("CLAUDE.md"); // CLAUDE.md was absent → created
  expect(res.created).not.toContain("gear.js"); // existing model not recreated
});

test("scaffoldWorkspace --force overwrites pointer files", () => {
  const dir = tmp();
  writeFileSync(join(dir, "AGENTS.md"), "MINE");
  const res = scaffoldWorkspace(dir, "m.js", { force: true });
  expect(res.created).toContain("AGENTS.md");
  expect(readFileSync(join(dir, "AGENTS.md"), "utf8")).not.toBe("MINE");
});

test("modelTemplate + agentsMd contain the essentials", () => {
  expect(modelTemplate("my-part.js")).toMatch(/require\('@jbroll\/jscad-fluent'\)/);
  expect(agentsMd("m.js")).toMatch(/jscad-work stop/);
});
