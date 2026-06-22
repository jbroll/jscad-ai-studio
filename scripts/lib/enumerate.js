import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

// Recursively discover skip.txt / exclude.txt files under a root. Each file
// contributes directory-scoped patterns. Mirrors jscadui's test-harness
// discoverDirPatterns so the catalog's model set matches the comparison test's.
const discoverDirPatterns = (root, filename) => {
  const out = [];
  const walk = (dir) => {
    const pf = join(dir, filename);
    if (existsSync(pf)) {
      const patterns = readFileSync(pf, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"));
      if (patterns.length) out.push({ dir: resolve(dir), patterns });
    }
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith(".")) walk(join(dir, e.name));
    }
  };
  if (existsSync(root)) walk(root);
  return out;
};

// Is filePath matched by any directory-scoped pattern? Honors leading `/`
// (anchored to dir; `*`=[^/]*, `**`=.*), trailing `/` (directory shorthand),
// and unanchored patterns (match basename or relative path). Mirrors the
// harness's isSkippedByDirPatterns.
export const isExcluded = (filePath, dirPatterns) => {
  const f = resolve(filePath);
  for (const { dir, patterns } of dirPatterns) {
    if (!f.startsWith(`${dir}/`) && f !== dir) continue;
    const rel = relative(dir, f);
    for (const p of patterns) {
      const anchored = p.startsWith("/");
      const raw = anchored ? p.slice(1) : p;
      const pat = raw.endsWith("/") ? `${raw}*` : raw;
      const esc = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      const rx = anchored
        ? esc.replace(/\*\*/g, ".*").replace(/(?<!\*)\*(?!\*)/g, "[^/]*")
        : esc.replace(/\*/g, ".*");
      const re = new RegExp(`^${rx}$`);
      if (anchored ? re.test(rel) : re.test(basename(f)) || re.test(rel)) return true;
    }
  }
  return false;
};

// Discover the combined skip.txt + exclude.txt directory-scoped patterns under a root.
export const discoverPatterns = (root) => [
  ...discoverDirPatterns(root, "skip.txt"),
  ...discoverDirPatterns(root, "exclude.txt"),
];

const walkScad = (dir) => {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith(".") || name.name === "lib") continue;
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...walkScad(full));
    else out.push(full);
  }
  return out;
};

// Enumerate the curated subset: for each source `{ dir, ext }`, walk its tree,
// drop files matched by any recursively-discovered skip.txt or exclude.txt, and
// return `{ id, path (relative to jscaduiRoot), lang, source }`.
export const enumerateModels = (examplesRoot, sources, jscaduiRoot) => {
  const models = [];
  for (const [source, cfg] of Object.entries(sources)) {
    const dir = join(examplesRoot, cfg.dir);
    if (!existsSync(dir)) continue;
    const patterns = discoverPatterns(dir);
    for (const file of walkScad(dir)) {
      if (!file.endsWith(cfg.ext)) continue;
      if (isExcluded(file, patterns)) continue;
      const base = basename(file);
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
