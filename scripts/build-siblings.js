import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const SIBLING_ROOT = resolve(REPO_ROOT, "..");

const STEPS = [
  { name: "jscad-anchors", cwd: resolve(SIBLING_ROOT, "jscad-anchors"), args: ["run", "build"] },
  { name: "jscad-fluent", cwd: resolve(SIBLING_ROOT, "jscad-fluent"), args: ["run", "build"] },
  {
    name: "jscadui viewer",
    cwd: resolve(SIBLING_ROOT, "jscadui/apps/jscad-web"),
    command: "node",
    args: ["build.js", "--skipDocs"],
  },
];

for (const step of STEPS) {
  const command = step.command ?? "npm";
  console.log(`\n> ${step.name}: ${command} ${step.args.join(" ")}`);
  const result = spawnSync(command, step.args, { cwd: step.cwd, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\nbuild:siblings failed at ${step.name} (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

console.log("\nbuild:siblings done");
