import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const CATALOG_PATH = new URL("../../catalog/catalog.json", import.meta.url).pathname;
export const JSCADUI_ROOT = resolve(new URL("../../", import.meta.url).pathname, "../jscadui");
const PLUGIN_ROOT = new URL("../../", import.meta.url).pathname;

let cache = null;

export const loadCatalog = (path = CATALOG_PATH) => {
  if (cache && cache.path === path) return cache.entries;
  const entries = JSON.parse(readFileSync(path, "utf8"));
  cache = { path, entries };
  return entries;
};

const tokenize = (s) =>
  String(s || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];

const scoreEntry = (e, qTokens) => {
  const name = tokenize(e.name);
  const tags = (e.tags || []).flatMap(tokenize);
  const techs = (e.techniques || []).flatMap(tokenize);
  const desc = tokenize(e.description);
  const id = String(e.id || "").toLowerCase();
  let s = 0;
  for (const q of qTokens) {
    if (name.includes(q)) s += 5;
    if (tags.includes(q)) s += 4;
    if (techs.includes(q)) s += 3;
    if (id.includes(q)) s += 2;
    if (desc.includes(q)) s += 1;
  }
  return s;
};

export const searchCatalog = (query, filters = {}, entries = loadCatalog()) => {
  const { tags, source, lang, runnableOnly, limit = 20 } = filters;
  const qTokens = tokenize(query);
  return entries
    .filter((e) => (source ? e.source === source : true))
    .filter((e) => (lang ? e.lang === lang : true))
    .filter((e) => (runnableOnly ? e.runs === true : true))
    .filter((e) => (tags && tags.length ? tags.every((t) => (e.tags || []).includes(t)) : true))
    .map((e) => ({ e, score: qTokens.length ? scoreEntry(e, qTokens) : 0 }))
    .filter((x) => (qTokens.length ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
};

export const resolveEntryPath = (entry) =>
  isAbsolute(entry.path) ? entry.path : resolve(JSCADUI_ROOT, entry.path);

export const getEntry = (id, entries = loadCatalog()) => {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  let source = null;
  for (const base of [resolveEntryPath(entry), resolve(PLUGIN_ROOT, entry.path)]) {
    try {
      source = readFileSync(base, "utf8");
      break;
    } catch {
      /* try next */
    }
  }
  return { entry, source };
};
