import { readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";

const exportsOf = (src) => {
  const names = new Set();
  // module.exports = { a, b, c };  (capture the brace body)
  const m = src.match(/module\.exports\s*=\s*\{([^}]*)\}/);
  if (m) {
    for (const part of m[1].split(",")) {
      const name = part.split(":")[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  // exports.foo = ... / module.exports.foo = ...
  for (const mm of src.matchAll(/(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/g)) names.add(mm[1]);
  return [...names];
};

export const listParts = (modelPath) => {
  const dir = dirname(modelPath);
  const out = [];
  for (const f of readdirSync(dir).sort()) {
    const ext = extname(f);
    if (ext !== ".js" && ext !== ".scad") continue;
    const src = readFileSync(join(dir, f), "utf8");
    const exps = ext === ".js" ? exportsOf(src) : [];
    out.push({
      file: f,
      exports: exps,
      hasMain: exps.includes("main") || /\bmain\s*\(/.test(src) || ext === ".scad",
    });
  }
  return out;
};
