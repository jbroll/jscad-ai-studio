import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  ALLOW_RULE,
  agentsMd,
  CLAUDE_MD,
  EXAMPLE_DIR,
  ensureAllowRule,
  ensureNotes,
  isServerRunning,
  jscadMd,
  LLM_TXT,
  modelTemplate,
  NOTES_MD,
  readConfig,
  scaffoldWorkspace,
  stopServer,
  TOOLS_DOC,
  WORKFLOW_DOC,
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

test("scaffoldWorkspace: writes prompts, NOTES.md, and a starter model in an empty dir", () => {
  const dir = tmp();
  const res = scaffoldWorkspace(dir, "widget.js");
  expect(res.model).toBe("widget.js");
  expect(res.created.sort()).toEqual([
    "AGENTS.md",
    "CLAUDE.md",
    "JSCAD.md",
    "NOTES.md",
    "widget.js",
  ]);
  expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe(CLAUDE_MD);
  const agents = readFileSync(join(dir, "AGENTS.md"), "utf8");
  expect(agents).toMatch(/nohup jscad-work widget\.js/);
  expect(agents).toMatch(/Read `JSCAD\.md`/);
  expect(readFileSync(join(dir, "NOTES.md"), "utf8")).toBe(NOTES_MD);
  expect(readFileSync(join(dir, "JSCAD.md"), "utf8")).toMatch(/\*\*Viewer\*\*: not running/);
  expect(readFileSync(join(dir, "widget.js"), "utf8")).toMatch(/module\.exports = \{ main \}/);
});

test("scaffoldWorkspace never overwrites NOTES.md, even with --force", () => {
  const dir = tmp();
  writeFileSync(join(dir, "NOTES.md"), "MY NOTES");
  const res = scaffoldWorkspace(dir, "m.js", { force: true });
  expect(res.kept).toContain("NOTES.md");
  expect(readFileSync(join(dir, "NOTES.md"), "utf8")).toBe("MY NOTES");
});

test("scaffoldWorkspace leaves a running server's JSCAD.md alone", () => {
  const dir = tmp();
  writeCfg(dir, process.pid);
  writeFileSync(join(dir, "JSCAD.md"), "LIVE");
  const res = scaffoldWorkspace(dir, "m.js");
  expect(res.created).not.toContain("JSCAD.md");
  expect(readFileSync(join(dir, "JSCAD.md"), "utf8")).toBe("LIVE");
});

test("ensureNotes creates NOTES.md only when absent", () => {
  const dir = tmp();
  expect(ensureNotes(dir)).toBe(true);
  writeFileSync(join(dir, "NOTES.md"), "edited");
  expect(ensureNotes(dir)).toBe(false);
  expect(readFileSync(join(dir, "NOTES.md"), "utf8")).toBe("edited");
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
  const agents = agentsMd("m.js");
  expect(agents).toMatch(/jscad-work stop/);
  expect(agents).toMatch(/wait until `\.jscad-studio` exists/);
  expect(agents).toMatch(/denied or fails, do not retry/);
  expect(agents).toMatch(/run\s+`jscad-work m\.js` in another terminal/);
  expect(agents).toMatch(/`run_in_background`/);
  expect(agents).toMatch(/nohup jscad-work m\.js > \.jscad-work\.log/);
  expect(agents).not.toMatch(/MCP|\/tmp/);
  expect(agents).toMatch(/`NOTES\.md`/);
});

test("jscadMd: session header, startup actions, and doc pointers", () => {
  const md = jscadMd("gear.js", 4321);
  expect(md).toMatch(/\*\*Current model\*\*: gear\.js/);
  expect(md).toMatch(/\*\*Viewer\*\*: http:\/\/127\.0\.0\.1:4321\/#gear\.js/);
  expect(md).toMatch(/Navigate the browser\*\* to `http:\/\/127\.0\.0\.1:4321\/#gear\.js`/);
  expect(md).toMatch(
    /@url https:\/\/raw\.githubusercontent\.com\/jbroll\/jscad-fluent\/main\/llm\.txt/,
  );
  expect(md).toContain(`If the fetch fails, read \`${LLM_TXT}\``);
  expect(md).toMatch(/Read `NOTES\.md`/);
  expect(md).toMatch(/jscad-work library search/);
  expect(md).not.toMatch(/MCP|library_search|live_params/);
  expect(TOOLS_DOC.endsWith("docs/user-manual.md")).toBe(true);
  expect(md).toContain(WORKFLOW_DOC);
  expect(md).toContain(TOOLS_DOC);
  expect(md).toContain(EXAMPLE_DIR);
  for (const path of [LLM_TXT, WORKFLOW_DOC, TOOLS_DOC, EXAMPLE_DIR]) {
    expect(existsSync(path), path).toBe(true);
  }
});

test("jscadMd without a port says the viewer is not running and skips navigation", () => {
  const md = jscadMd("gear.js", null);
  expect(md).toMatch(/\*\*Viewer\*\*: not running \(start it with `jscad-work gear\.js`\)/);
  expect(md).not.toMatch(/Navigate the browser/);
  expect(md).not.toMatch(/127\.0\.0\.1/);
});

test("jscadMd: definition of done, conventions, params DSL, print rules, hazards", () => {
  const md = jscadMd("m.js", 1);
  // verification protocol
  expect(md).toMatch(/`jscad-work eval <model>` exits 0, then `jscad-work measure <model>`/);
  expect(md).toMatch(/`jscad-work check <model> --bed X,Y,Z`/);
  expect(md).toMatch(/`jscad-work render <model> --view all` and Read every PNG/);
  for (const view of ["front", "back", "left", "right", "top", "bottom", "iso"]) {
    expect(md).toContain(`\`${view}\``);
  }
  // conventions
  expect(md).toMatch(/Units are millimeters/);
  expect(md).toMatch(/Z=0/);
  expect(md).toMatch(/named constant/);
  expect(md).toMatch(/constants\.js.*layout\.js/);
  // params DSL
  for (const type of [
    "slider",
    "int",
    "number",
    "checkbox",
    "choice",
    "radio",
    "color",
    "text",
    "date",
    "email",
    "url",
    "password",
  ]) {
    expect(md).toContain(`\`${type}\``);
  }
  expect(md).toMatch(/`values: \[\.\.\.\]`/);
  expect(md).toMatch(/`p\._type = /);
  expect(md).toMatch(/`live: false`/);
  // printing
  expect(md).toMatch(/0\.2 mm sliding/);
  expect(md).toMatch(/45°/);
  expect(md).toMatch(/Minimum wall 1\.2 mm/);
  expect(md).toMatch(/Heat-set insert holes: .*M3 4\.0/);
  expect(md).toMatch(/M3 3\.4/);
  expect(md).toMatch(/largest flat face on the bed/);
  // hazards
  expect(md).toMatch(/radians/);
  expect(md).toMatch(/Extend cutters 0\.5 mm past/);
  expect(md).toMatch(/`segments` is expensive/);
  expect(md).toMatch(/Degenerate booleans/);
});

const settingsOf = (dir) => JSON.parse(readFileSync(join(dir, ".claude/settings.json"), "utf8"));

test("ensureAllowRule creates .claude/settings.json with the jscad-work rule", () => {
  const dir = tmp();
  expect(ALLOW_RULE).toBe("Bash(jscad-work *)");
  expect(ensureAllowRule(dir)).toEqual({
    status: "created",
    path: join(dir, ".claude/settings.json"),
  });
  expect(settingsOf(dir)).toEqual({ permissions: { allow: [ALLOW_RULE] } });
});

test("ensureAllowRule merges into existing settings without touching other keys", () => {
  const dir = tmp();
  mkdirSync(join(dir, ".claude"));
  const existing = {
    model: "opus",
    env: { FOO: "1" },
    permissions: { allow: ["Bash(npm test)"], deny: ["Bash(rm *)"], defaultMode: "acceptEdits" },
    hooks: { PreToolUse: [] },
  };
  writeFileSync(join(dir, ".claude/settings.json"), JSON.stringify(existing));
  expect(ensureAllowRule(dir).status).toBe("added");
  expect(settingsOf(dir)).toEqual({
    ...existing,
    permissions: { ...existing.permissions, allow: ["Bash(npm test)", ALLOW_RULE] },
  });
});

test("ensureAllowRule adds allow to a permissions block that has none", () => {
  const dir = tmp();
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".claude/settings.json"), '{"permissions":{"deny":["Bash(rm *)"]}}');
  ensureAllowRule(dir);
  expect(settingsOf(dir).permissions).toEqual({ deny: ["Bash(rm *)"], allow: [ALLOW_RULE] });
});

test("ensureAllowRule never duplicates the rule and leaves the file untouched when present", () => {
  const dir = tmp();
  ensureAllowRule(dir);
  const before = readFileSync(join(dir, ".claude/settings.json"), "utf8");
  expect(ensureAllowRule(dir).status).toBe("present");
  expect(ensureAllowRule(dir).status).toBe("present");
  expect(readFileSync(join(dir, ".claude/settings.json"), "utf8")).toBe(before);
  expect(settingsOf(dir).permissions.allow).toEqual([ALLOW_RULE]);
});

test.each([
  ["invalid JSON", "{ not json", /not valid JSON/],
  ["a non-object", "[1, 2]", /unexpected shape/],
  ["a non-array allow", '{"permissions":{"allow":"Bash(*)"}}', /unexpected shape/],
])("ensureAllowRule refuses to overwrite %s", (_label, content, message) => {
  const dir = tmp();
  mkdirSync(join(dir, ".claude"));
  writeFileSync(join(dir, ".claude/settings.json"), content);
  expect(() => ensureAllowRule(dir)).toThrow(message);
  expect(readFileSync(join(dir, ".claude/settings.json"), "utf8")).toBe(content);
});

test("scaffoldWorkspace writes the allow rule and reports it", () => {
  const dir = tmp();
  expect(scaffoldWorkspace(dir, "m.js").allowRule).toBe("created");
  expect(scaffoldWorkspace(dir, "m.js").allowRule).toBe("present");
  expect(settingsOf(dir).permissions.allow).toEqual([ALLOW_RULE]);
});

test("readConfig: null for missing file, null for malformed JSON, parsed object for valid", () => {
  const dir = tmp();
  expect(readConfig(dir)).toBeNull(); // missing file
  writeFileSync(join(dir, ".jscad-studio"), "not json");
  expect(readConfig(dir)).toBeNull(); // malformed
  writeFileSync(join(dir, ".jscad-studio"), JSON.stringify({ serverPort: 4000, pid: 99 }));
  expect(readConfig(dir)).toEqual({ serverPort: 4000, pid: 99 }); // valid
});
