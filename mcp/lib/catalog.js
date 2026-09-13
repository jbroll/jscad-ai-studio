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

// Stems need not be words, only consistent: both query and entry tokens pass through here.
export const stem = (t) => {
  if (t.length <= 3 || /\d/.test(t)) return t;
  if (t.endsWith("ies") && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith("sses")) return t.slice(0, -2);
  if (/(x|z|ch|sh)es$/.test(t)) return t.slice(0, -2);
  if (t.endsWith("s") && !/(ss|us|is)$/.test(t)) return stem(t.slice(0, -1));
  if (t.endsWith("ing") && t.length - 3 >= 4) return t.slice(0, -3);
  if (t.endsWith("ed") && t.length - 2 >= 4) return t.slice(0, -2);
  return t;
};

const SYNONYM_GROUPS = [
  ["screw", "bolt", "fastener"],
  ["nut", "locknut"],
  ["washer", "spacer", "shim"],
  ["standoff", "spacer"],
  ["pulley", "sprocket", "sheave"],
  ["enclosure", "box", "case", "housing"],
  ["gear", "cog"],
  ["bearing", "bushing"],
  ["bracket", "mount"],
  ["hole", "bore"],
];

const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS) {
  const stems = group.map(stem);
  for (const s of stems) {
    const set = SYNONYMS.get(s) ?? new Set();
    for (const other of stems) if (other !== s) set.add(other);
    SYNONYMS.set(s, set);
  }
}

const SYNONYM_WEIGHT = 0.5;

const WEIGHTS = { name: 5, tags: 4, techniques: 3, description: 1 };

const scoreEntry = (e, qTokens) => {
  const fields = {
    name: new Set(tokenize(e.name).map(stem)),
    tags: new Set((e.tags || []).flatMap(tokenize).map(stem)),
    techniques: new Set((e.techniques || []).flatMap(tokenize).map(stem)),
    description: new Set(tokenize(e.description).map(stem)),
  };
  const id = String(e.id || "").toLowerCase();
  let s = 0;
  for (const q of qTokens) {
    const qs = stem(q);
    const synonyms = [...(SYNONYMS.get(qs) ?? [])];
    for (const [field, weight] of Object.entries(WEIGHTS)) {
      const tokens = fields[field];
      if (tokens.has(qs)) s += weight;
      else if (synonyms.some((syn) => tokens.has(syn))) s += weight * SYNONYM_WEIGHT;
    }
    if (id.includes(q) || id.includes(qs)) s += 2;
  }
  return s;
};

const bound = (limit, axis) => (Array.isArray(limit) ? limit[axis] : limit);

const withinSize = (dimensions, minSize, maxSize) => {
  if (minSize == null && maxSize == null) return true;
  if (!Array.isArray(dimensions)) return false;
  return dimensions.every((d, axis) => {
    const lo = bound(minSize, axis);
    const hi = bound(maxSize, axis);
    return (lo == null || d >= lo) && (hi == null || d <= hi);
  });
};

// Query and entry words are stemmed ("bearings" matches "bearing"); synonym matches score half.
// Filters: runnableOnly defaults to true, pass false to include failing entries. parametric:
// true or false keeps only that kind. minSize/maxSize (mm): a number bounds every axis, an
// [x, y, z] array bounds each axis with null for none; entries without dimensions are dropped.
export const searchCatalog = (query, filters = {}, entries = loadCatalog()) => {
  const {
    tags,
    source,
    lang,
    runnableOnly = true,
    parametric,
    minSize,
    maxSize,
    limit = 20,
  } = filters;
  const qTokens = tokenize(query);
  return entries
    .filter((e) => (source ? e.source === source : true))
    .filter((e) => (lang ? e.lang === lang : true))
    .filter((e) => (runnableOnly ? e.runs === true : true))
    .filter((e) => (parametric == null ? true : Boolean(e.parametric) === parametric))
    .filter((e) => withinSize(e.dimensions, minSize, maxSize))
    .filter((e) => (tags?.length ? tags.every((t) => (e.tags || []).includes(t)) : true))
    .map((e) => ({ e, score: qTokens.length ? scoreEntry(e, qTokens) : 0 }))
    .filter((x) => (qTokens.length ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
};

export const searchResults = (query, filters, entries) =>
  searchCatalog(query, filters, entries).map((e) => ({
    id: e.id,
    name: e.name,
    source: e.source,
    lang: e.lang,
    tags: e.tags,
    runs: e.runs,
    dimensions: e.dimensions,
    description: e.description,
  }));

export const resolveEntryPath = (entry) =>
  isAbsolute(entry.path) ? entry.path : resolve(JSCADUI_ROOT, entry.path);

// `path` is the absolute file that `source` came from, or null when no candidate exists.
export const getEntry = (id, entries = loadCatalog()) => {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  for (const path of [resolveEntryPath(entry), resolve(PLUGIN_ROOT, entry.path)]) {
    try {
      return { entry, path, source: readFileSync(path, "utf8") };
    } catch {
      /* try next */
    }
  }
  return { entry, path: null, source: null };
};
