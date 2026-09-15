import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, resolve, sep } from "node:path";
import {
  ALLOW_RULE,
  isServerRunning,
  readConfig,
  STUDIO_ROOT,
  scaffoldWorkspace,
  stopServer,
} from "./workspace.js";

const isDirectory = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

const MODEL_EXTENSIONS = [".js", ".scad"];

export const resolveWorkspace = (cwd, arg) => {
  if (!arg) return { workspace: cwd, model: null };
  const path = resolve(cwd, arg);
  if (isDirectory(path)) return { workspace: path, model: null };
  if (arg.endsWith("/") || arg.endsWith(sep)) throw new Error(`no such directory: ${path}`);
  const ext = extname(path);
  if (ext && !MODEL_EXTENSIONS.includes(ext))
    throw new Error(`unsupported model extension ${ext}: use .js or .scad`);
  const model = ext ? basename(path) : `${basename(path)}.js`;
  const workspace = dirname(path);
  if (!isDirectory(workspace)) throw new Error(`no such directory: ${workspace}`);
  return { workspace, model };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const spawnServerProcess = (workspace, model) => {
  const logPath = resolve(workspace, ".jscad-work.log");
  const fd = openSync(logPath, "a");
  const child = spawn(process.execPath, [resolve(STUDIO_ROOT, "bin/jscad-work.js"), model], {
    cwd: workspace,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  child.unref();
  return child;
};

const logTail = (workspace) => {
  const logPath = resolve(workspace, ".jscad-work.log");
  return existsSync(logPath)
    ? readFileSync(logPath, "utf8").split("\n").slice(-20).join("\n")
    : "(no log)";
};

export const waitForServerStart = async (
  workspace,
  child,
  { timeoutMs = 15000, intervalMs = 200 } = {},
) => {
  const start = Date.now();
  const exited = new Promise((res) => child?.once("exit", (code, signal) => res({ code, signal })));
  let exitResult = null;
  while (Date.now() - start < timeoutMs) {
    if (isServerRunning(workspace)) return;
    const remaining = timeoutMs - (Date.now() - start);
    const tick = sleep(Math.min(intervalMs, remaining)).then(() => null);
    exitResult = await Promise.race([tick, exited]);
    if (exitResult) break;
  }
  if (!exitResult) child?.kill();
  const reason = exitResult
    ? `server process exited before starting (code ${exitResult.code}, signal ${exitResult.signal})`
    : `server did not start within ${timeoutMs}ms`;
  throw new Error(`${reason}\n${logTail(workspace)}`);
};

export const openBrowserWindow = (url, log = console.log) => {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  try {
    const child = spawn(cmd, [url], { detached: true, stdio: "ignore" });
    child.on("error", () => log(url));
    child.unref();
  } catch {
    log(url);
  }
};

export const runClaudeSession = (workspace, model) =>
  spawnSync("claude", [`Read AGENTS.md and start on ${model}`], {
    cwd: workspace,
    stdio: "inherit",
  });

// A terminal Ctrl+C or closed terminal reaches the whole process group, including
// init; without ignoring it, init dies here while claude, which handles it, keeps running.
const GUARDED_SIGNALS = ["SIGINT", "SIGQUIT", "SIGHUP", "SIGTERM"];
const noop = () => {};

const runIgnoringSignals = (fn) => {
  for (const sig of GUARDED_SIGNALS) process.on(sig, noop);
  try {
    return fn();
  } finally {
    for (const sig of GUARDED_SIGNALS) process.off(sig, noop);
  }
};

export const runInit = async (
  args,
  {
    cwd = process.cwd(),
    spawnServer = spawnServerProcess,
    waitForServer = waitForServerStart,
    openBrowser = openBrowserWindow,
    runClaude = runClaudeSession,
    stop = stopServer,
    log = console.log,
  } = {},
) => {
  const force = args.includes("--force");
  const modelArg = args.find((a) => a !== "--force");
  const { workspace, model } = resolveWorkspace(cwd, modelArg);

  if (model?.endsWith(".scad") && !existsSync(resolve(workspace, model)))
    throw new Error(
      `no such file: ${resolve(workspace, model)} (no OpenSCAD starter template; create it first)`,
    );

  const scaffold = scaffoldWorkspace(workspace, model, { force });
  for (const f of scaffold.created) log(`✓ created ${f}`);
  for (const f of scaffold.kept) log(`• kept existing ${f}`);
  if (scaffold.allowRule === "present") log(`• .claude/settings.json already allows ${ALLOW_RULE}`);
  else log(`✓ .claude/settings.json allows ${ALLOW_RULE}`);

  let startedServer = false;
  let startedPid;
  if (isServerRunning(workspace)) {
    const cfg = readConfig(workspace);
    log(`✓ server already running on port ${cfg.serverPort} (${cfg.viewerUrl})`);
  } else {
    const child = spawnServer(workspace, scaffold.model);
    await waitForServer(workspace, child);
    startedServer = true;
    startedPid = child?.pid;
  }

  const cfg = readConfig(workspace);
  log(`✓ Viewer: ${cfg.viewerUrl}`);
  openBrowser(cfg.viewerUrl);

  const result = runIgnoringSignals(() => runClaude(workspace, scaffold.model));
  if (result.error?.code === "ENOENT") {
    log(cfg.viewerUrl);
    log("claude not found; the server keeps running; stop it with jscad-work stop");
    return 0;
  }

  if (startedServer && readConfig(workspace)?.pid === startedPid) {
    stop(workspace);
    log("✓ stopped the work server");
  }
  if (result.status == null && result.signal) return 1;
  return result.status ?? 0;
};
