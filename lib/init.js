import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
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

// A directory argument (existing) becomes the workspace with no fixed model.
// Anything else is a model path: its basename is the model, its dirname the
// workspace, and that dirname must already exist.
export const resolveWorkspace = (cwd, arg) => {
  if (!arg) return { workspace: cwd, model: null };
  const path = resolve(cwd, arg);
  if (isDirectory(path)) return { workspace: path, model: null };
  const model = basename(path).endsWith(".js") ? basename(path) : `${basename(path)}.js`;
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

export const waitForServerStart = async (
  workspace,
  { timeoutMs = 15000, intervalMs = 200 } = {},
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isServerRunning(workspace)) return;
    await sleep(intervalMs);
  }
  const logPath = resolve(workspace, ".jscad-work.log");
  const tail = existsSync(logPath)
    ? readFileSync(logPath, "utf8").split("\n").slice(-20).join("\n")
    : "(no log)";
  throw new Error(`server did not start within ${timeoutMs}ms\n${tail}`);
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

  const scaffold = scaffoldWorkspace(workspace, model, { force });
  for (const f of scaffold.created) log(`✓ created ${f}`);
  for (const f of scaffold.kept) log(`• kept existing ${f}`);
  if (scaffold.allowRule === "present") log(`• .claude/settings.json already allows ${ALLOW_RULE}`);
  else log(`✓ .claude/settings.json allows ${ALLOW_RULE}`);

  let startedServer = false;
  if (isServerRunning(workspace)) {
    const cfg = readConfig(workspace);
    log(`✓ server already running on port ${cfg.serverPort} (${cfg.viewerUrl})`);
  } else {
    spawnServer(workspace, scaffold.model);
    await waitForServer(workspace);
    startedServer = true;
  }

  const cfg = readConfig(workspace);
  log(`✓ Viewer: ${cfg.viewerUrl}`);
  openBrowser(cfg.viewerUrl);

  const result = runClaude(workspace, scaffold.model);
  if (result.error?.code === "ENOENT") {
    log(cfg.viewerUrl);
    log("claude not found; the server keeps running; stop it with jscad-work stop");
    return 0;
  }

  if (startedServer) {
    stop(workspace);
    log("✓ stopped the work server");
  }
  return result.status ?? 0;
};
