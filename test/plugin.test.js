import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const json = (p) => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), "utf8"));

test("marketplace entry names the plugin and links it in place", () => {
  const plugin = json(".claude-plugin/plugin.json");
  const market = json(".claude-plugin/marketplace.json");
  expect(market.plugins.map((p) => p.name)).toEqual([plugin.name]);
  expect(market.plugins[0].source).toMatchObject({ source: "command", mode: "link" });
});

test("plugin MCP server path resolves inside the plugin root", () => {
  const { args } = json(".claude-plugin/plugin.json").mcpServers["jscad-studio"];
  const server = args[0].replace("${CLAUDE_PLUGIN_ROOT}", root);
  expect(existsSync(server)).toBe(true);
});

test("jscad-work plugin-root prints the repo root", () => {
  const out = execFileSync(process.execPath, [`${root}bin/jscad-work.js`, "plugin-root"], {
    encoding: "utf8",
  });
  expect(`${out.trim()}/`).toBe(root);
});

test("every skill names itself and keeps its description short", () => {
  const skills = readdirSync(new URL("../skills", import.meta.url));
  expect(skills.sort()).toEqual(["jscad-assembly", "jscad-library", "jscad-modeling"]);
  for (const name of skills) {
    const text = readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), "utf8");
    const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    expect(front).toMatch(new RegExp(`^name: ${name}$`, "m"));
    const description = front.match(/^description: (.+)$/m)?.[1] ?? "";
    expect(description).toMatch(/jscad/i);
    expect(description.length).toBeLessThanOrEqual(300);
  }
});

test("files a skill points at exist", () => {
  for (const name of readdirSync(new URL("../skills", import.meta.url))) {
    const text = readFileSync(new URL(`../skills/${name}/SKILL.md`, import.meta.url), "utf8");
    for (const [, ref] of text.matchAll(/\]\((?!https?:)([^)#]+)\)/g)) {
      expect(existsSync(new URL(`../skills/${name}/${ref}`, import.meta.url)), ref).toBe(true);
    }
  }
});
