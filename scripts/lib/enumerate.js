import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";

export const loadSkipList = (file) => {
  const set = new Set();
  if (!file || !existsSync(file)) return set;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    set.add(line);
  }
  return set;
};

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith(".") || name.name === "lib") continue;
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
};

export const enumerateModels = (examplesRoot, sources, jscaduiRoot) => {
  const models = [];
  for (const [source, cfg] of Object.entries(sources)) {
    const dir = join(examplesRoot, cfg.dir);
    if (!existsSync(dir)) continue;
    const skip = loadSkipList(cfg.skipFile ? join(examplesRoot, cfg.skipFile) : null);
    for (const file of walk(dir)) {
      if (!file.endsWith(cfg.ext)) continue;
      const base = basename(file);
      if (skip.has(base)) continue;
      const name = base.endsWith(".example.js")
        ? base.slice(0, -".example.js".length)
        : basename(file, extname(file));
      models.push({
        id: `${source}/${name}`,
        path: relative(jscaduiRoot, file),
        lang: cfg.ext === ".scad" ? "scad" : "js",
        source,
      });
    }
  }
  return models;
};
