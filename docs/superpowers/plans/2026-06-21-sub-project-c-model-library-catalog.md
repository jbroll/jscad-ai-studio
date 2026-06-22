# Sub-project C — Model Library Catalog + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ~820 reference models in `../jscadui` searchable and usable from the `jscad-studio` MCP via a committed, LLM-curated + eval-verified catalog, two MCP tools, and a portable `jscad-library` skill.

**Architecture:** A committed `catalog/catalog.json`. A Node generator (`scripts/build-catalog.js`) enumerates the curated subset, eval-verifies each model with A's `runModel`, and writes an LLM description per model via the Anthropic API — incrementally by source hash. `mcp/lib/catalog.js` does in-memory keyword/tag search; two MCP tools expose it; the `jscad-library` skill ties search to B's transparent `require('<path>')`.

**Tech Stack:** Node 22 ESM; `@anthropic-ai/sdk` (`claude-haiku-4-5-20251001`); A's `runModel`; vitest.

## Global Constraints

- **ESM** project. Every commit runs org-hooks Lefthook (biome/tsc/knip/size-cap/gitleaks, 500-line cap); `npm test` = `vitest run`.
- **No embeddings** — keyword/tag scoring only. Tests run **offline with no API key** (use a committed fixture catalog + a mocked Anthropic client).
- **Catalog entry shape** (exact):
  `{ id, path, lang:"scad"|"js", source, name, description, tags:[], techniques:[], runs:bool, geomType, dimensions:[w,d,h]|null, polygonCount:N|null, failureClass:null|"transpiler-gap"|"openscad-lib-bug"|"font/rands"|"empty"|"timeout", error:null|string, srcHash }`. (`polygonCount` comes from A's `measure`, which exposes `polygonCount` — not triangleCount.)
- **Paths:** `entry.path` is stored **relative to the jscadui repo root**; resolve via `JSCADUI_ROOT = resolve(<pluginRoot>, "../jscadui")`. The plugin root is the repo containing `mcp/`.
- **Curated subset:** jscad (28) + mcad (51) + nopscadlib (376) + bosl2 (234) + snippet (122) + text (11) ≈ 822, under `/home/john/src/jscadui/apps/jscad-web/examples/{jscad,openscad/<lib>}`. Honor jscadui skip-lists (`#` comments + one filename per line; a trailing-slash entry like `lib/` skips that dir).
- **Repair policy:** catalog records failures + a gap report; no inline transpiler fixes.
- **Generation is a user-run data step** (`ANTHROPIC_API_KEY=… node scripts/build-catalog.js`); the committed `catalog/catalog.json` starts as `[]` and tools degrade gracefully (empty → no results).

## File Structure

| File | Responsibility |
|---|---|
| `catalog/catalog.json` | Committed catalog data (starts `[]`). |
| `mcp/lib/catalog.js` | `loadCatalog`, `searchCatalog`, `getEntry` (in-memory keyword/tag search). |
| `mcp/lib/tools.js` (modify) | add `handlers.library_search`, `handlers.library_get`. |
| `mcp/server.js` (modify) | register `library_search`, `library_get`. |
| `scripts/lib/enumerate.js` | curated-subset file list (skip-list aware). |
| `scripts/lib/verify.js` | `verifyModel(absPath)` → eval fields + `failureClass`. |
| `scripts/lib/describe.js` | `describeModel(client, source, id)` → `{name,description,tags,techniques}`. |
| `scripts/build-catalog.js` | orchestrator: enumerate → (verify + describe) → write, incremental, gap report. |
| `skills/jscad-library/SKILL.md` | portable skill (Claude Code + OpenCode). |
| `docs/opencode-setup.md`, `README.md` (modify) | dual MCP-config docs. |
| `test/fixtures/catalog.fixture.json`, `test/catalog*.test.js` | tests. |

---

### Task 1: Catalog read + search (`mcp/lib/catalog.js`)

**Files:**
- Create: `mcp/lib/catalog.js`, `catalog/catalog.json` (`[]`), `test/fixtures/catalog.fixture.json`, `test/catalog.test.js`

**Interfaces:**
- Produces:
  - `loadCatalog(path?) => entry[]` (memoized; default path `catalog/catalog.json` next to the plugin root).
  - `searchCatalog(query, filters?, entries?) => entry[]` — `filters`: `{ tags?, source?, lang?, runnableOnly?, limit? (default 20) }`; ranked by keyword/tag score; `entries` defaults to `loadCatalog()`.
  - `getEntry(id, entries?) => { entry, source } | null` — `source` is the model file text (or `null` if unreadable).
  - `JSCADUI_ROOT` resolution helper for `entry.path`.

- [ ] **Step 1: Create the fixture catalog `test/fixtures/catalog.fixture.json`**

```json
[
  { "id": "mcad/bearing", "path": "test/fixtures/cube.js", "lang": "js", "source": "mcad",
    "name": "608 Bearing", "description": "A skateboard 608 ball bearing model.",
    "tags": ["bearing","hardware"], "techniques": ["difference","rotate_extrude"],
    "runs": true, "geomType": "geom3", "dimensions": [22,22,7], "polygonCount": 240,
    "failureClass": null, "error": null, "srcHash": "aaa" },
  { "id": "bosl2/gear", "path": "test/fixtures/cube.js", "lang": "scad", "source": "bosl2",
    "name": "Spur Gear", "description": "An involute spur gear generator.",
    "tags": ["gear","mechanical"], "techniques": ["gear"],
    "runs": true, "geomType": "geom3", "dimensions": [40,40,8], "polygonCount": 900,
    "failureClass": null, "error": null, "srcHash": "bbb" },
  { "id": "snippet/broken", "path": "does/not/exist.scad", "lang": "scad", "source": "snippet",
    "name": "Broken Demo", "description": "A demo that does not transpile.",
    "tags": ["demo"], "techniques": [],
    "runs": false, "geomType": "unknown", "dimensions": null, "polygonCount": null,
    "failureClass": "transpiler-gap", "error": "parse error", "srcHash": "ccc" }
]
```
Note: `path` points at the existing `test/fixtures/cube.js` so `getEntry` can read real source offline.

- [ ] **Step 2: Write the failing test `test/catalog.test.js`**

```js
import { test, expect } from "vitest";
import { searchCatalog, getEntry } from "../mcp/lib/catalog.js";

const fixture = JSON.parse(
  await import("node:fs").then((fs) => fs.readFileSync(new URL("./fixtures/catalog.fixture.json", import.meta.url), "utf8")),
);

test("ranks the best keyword match first", () => {
  const r = searchCatalog("bearing", {}, fixture);
  expect(r[0].id).toBe("mcad/bearing");
});

test("matches on techniques and tags", () => {
  const r = searchCatalog("gear", {}, fixture);
  expect(r[0].id).toBe("bosl2/gear");
});

test("source + lang filters", () => {
  expect(searchCatalog("", { source: "bosl2" }, fixture).map((e) => e.id)).toEqual(["bosl2/gear"]);
  expect(searchCatalog("", { lang: "js" }, fixture).map((e) => e.id)).toEqual(["mcad/bearing"]);
});

test("runnableOnly excludes failures", () => {
  const ids = searchCatalog("", { runnableOnly: true }, fixture).map((e) => e.id);
  expect(ids).toContain("mcad/bearing");
  expect(ids).not.toContain("snippet/broken");
});

test("getEntry returns entry + source; null for missing id", () => {
  const got = getEntry("mcad/bearing", fixture);
  expect(got.entry.name).toBe("608 Bearing");
  expect(got.source).toMatch(/module\.exports/);
  expect(getEntry("nope", fixture)).toBeNull();
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run test/catalog.test.js`
Expected: FAIL ("Cannot find module '../mcp/lib/catalog.js'").

- [ ] **Step 4: Create `catalog/catalog.json`**

```json
[]
```

- [ ] **Step 5: Create `mcp/lib/catalog.js`**

```js
import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";

const CATALOG_PATH = new URL("../../catalog/catalog.json", import.meta.url).pathname;
export const JSCADUI_ROOT = resolve(new URL("../../", import.meta.url).pathname, "../jscadui");

let cache = null;

export const loadCatalog = (path = CATALOG_PATH) => {
  if (cache && cache.path === path) return cache.entries;
  const entries = JSON.parse(readFileSync(path, "utf8"));
  cache = { path, entries };
  return entries;
};

const tokenize = (s) => String(s || "").toLowerCase().match(/[a-z0-9]+/g) || [];

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
  try {
    source = readFileSync(resolveEntryPath(entry), "utf8");
  } catch {
    source = null;
  }
  return { entry, source };
};
```
Note: the fixture's `path` (`test/fixtures/cube.js`) is relative, so `resolveEntryPath` joins it under `JSCADUI_ROOT`; for the test to read it, the fixture entries use paths that exist relative to `JSCADUI_ROOT`? They don't. To keep the test offline+robust, the test passes `entries=fixture` and `getEntry` reads via `resolveEntryPath`. Adjust the fixture `path` to an ABSOLUTE path to the plugin's own `test/fixtures/cube.js` at fixture-creation time is brittle. Instead: in Step 1 set `mcad/bearing` and `bosl2/gear` `path` to `"test/fixtures/cube.js"` AND make the test assert `getEntry(...).source` is either the file text or `null` is NOT acceptable — so set those two fixture paths to an absolute path is not portable. RESOLUTION: change `resolveEntryPath` to also try resolving relative to the **plugin root** when the JSCADUI_ROOT join is unreadable; simplest is the test sets fixture path to an absolute path computed at runtime. See Step 6.

- [ ] **Step 6: Make the fixture path resolvable in the test**

Replace the two runnable fixture entries' `"path": "test/fixtures/cube.js"` with a path that resolves. Simplest robust approach: in `getEntry`, if `resolveEntryPath(entry)` is unreadable, also try `resolve(pluginRoot, entry.path)`. Add to `mcp/lib/catalog.js`:
```js
const PLUGIN_ROOT = new URL("../../", import.meta.url).pathname;
// ...in getEntry, replace the try/catch with:
  for (const base of [resolveEntryPath(entry), resolve(PLUGIN_ROOT, entry.path)]) {
    try { source = readFileSync(base, "utf8"); break; } catch { /* try next */ }
  }
```
Now `test/fixtures/cube.js` resolves under the plugin root for the fixture, and real entries resolve under `JSCADUI_ROOT`.

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run test/catalog.test.js`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add mcp/lib/catalog.js catalog/catalog.json test/fixtures/catalog.fixture.json test/catalog.test.js
git commit -m "feat(c): catalog read + keyword/tag search"
```

---

### Task 2: MCP tools `library_search` + `library_get`

**Files:**
- Modify: `mcp/lib/tools.js`, `mcp/server.js`
- Test: `test/library-tools.test.js`

**Interfaces:**
- Consumes: `searchCatalog`, `getEntry`, the fixture catalog.
- Produces:
  - `handlers.library_search({ query, tags?, source?, lang?, runnableOnly? })` → `{ content:[{type:"text", text: JSON.stringify({ results }) }] }` where `results` is the search hits mapped to `{ id, name, source, lang, tags, runs, dimensions, description }`.
  - `handlers.library_get({ id })` → `{ content:[{type:"text", text: JSON.stringify({ entry, source }) }] }`.
  - Both default to the real `catalog/catalog.json`; accept an optional injected `entries` for tests via a small wrapper (see Step 3).

- [ ] **Step 1: Write the failing test `test/library-tools.test.js`**

```js
import { test, expect } from "vitest";
import { makeLibraryHandlers } from "../mcp/lib/tools.js";

const fixture = JSON.parse(
  await import("node:fs").then((fs) => fs.readFileSync(new URL("./fixtures/catalog.fixture.json", import.meta.url), "utf8")),
);
const handlers = makeLibraryHandlers(fixture);
const parse = (res) => JSON.parse(res.content[0].text);

test("library_search returns mapped results", async () => {
  const res = await handlers.library_search({ query: "bearing" });
  const { results } = parse(res);
  expect(results[0]).toMatchObject({ id: "mcad/bearing", source: "mcad", runs: true });
  expect(results[0].dimensions).toEqual([22, 22, 7]);
});

test("library_get returns entry + source", async () => {
  const res = await handlers.library_get({ id: "bosl2/gear" });
  const { entry, source } = parse(res);
  expect(entry.name).toBe("Spur Gear");
  expect(typeof source === "string" || source === null).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/library-tools.test.js`
Expected: FAIL ("makeLibraryHandlers is not a function").

- [ ] **Step 3: Add the library handlers to `mcp/lib/tools.js`**

At the top, import the catalog helpers:
```js
import { searchCatalog, getEntry, loadCatalog } from "./catalog.js";
```
Add a factory (so tests can inject a fixture) and wire the default handlers into the exported `handlers` object:
```js
export const makeLibraryHandlers = (entries) => ({
  library_search: async ({ query = "", tags, source, lang, runnableOnly }) => {
    const hits = searchCatalog(query, { tags, source, lang, runnableOnly }, entries ?? loadCatalog());
    const results = hits.map((e) => ({
      id: e.id, name: e.name, source: e.source, lang: e.lang,
      tags: e.tags, runs: e.runs, dimensions: e.dimensions, description: e.description,
    }));
    return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
  },
  library_get: async ({ id }) => {
    const got = getEntry(id, entries ?? loadCatalog());
    return { content: [{ type: "text", text: JSON.stringify(got ?? { entry: null, source: null }) }] };
  },
});

// Default handlers use the committed catalog. Merge into the existing `handlers` object:
Object.assign(handlers, makeLibraryHandlers());
```
(If `handlers` is declared `const handlers = {...}`, keep that declaration and append the `Object.assign` after it.)

- [ ] **Step 4: Register the tools in `mcp/server.js`**

```js
server.registerTool("library_search", {
  description: "Search the curated jscadui model library (keyword/tag).",
  inputSchema: { query: z.string(), tags: z.array(z.string()).optional(), source: z.string().optional(), lang: z.enum(["scad","js"]).optional(), runnableOnly: z.boolean().optional() },
}, handlers.library_search);
server.registerTool("library_get", {
  description: "Get a library model's catalog entry + source by id.",
  inputSchema: { id: z.string() },
}, handlers.library_get);
```

- [ ] **Step 5: Run to verify it passes + server boots**

Run: `npx vitest run test/library-tools.test.js` → PASS (2).
Run: `node -e "import('./mcp/server.js').then(()=>setTimeout(()=>process.exit(0),300))"` → exits 0, no registration error.

- [ ] **Step 6: Commit**

```bash
git add mcp/lib/tools.js mcp/server.js test/library-tools.test.js
git commit -m "feat(c): library_search + library_get MCP tools"
```

---

### Task 3: Generator — enumerate (`scripts/lib/enumerate.js`)

**Files:**
- Create: `scripts/lib/enumerate.js`, `test/enumerate.test.js`

**Interfaces:**
- Produces: `enumerateModels(examplesRoot, sources) => [{ id, path, lang, source }]` where `sources` is a map `{ source: { dir, ext, skipFile? } }`. `path` is returned **relative to `jscaduiRoot`** (a second arg). `loadSkipList(file) => Set<string>` (filenames; trailing-slash dir prefixes). Skips files whose basename (or dir-prefix) is in the skip set.

- [ ] **Step 1: Write the failing test `test/enumerate.test.js`**

```js
import { test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { enumerateModels, loadSkipList } from "../scripts/lib/enumerate.js";

let root;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "enum-"));
  mkdirSync(join(root, "examples/openscad/mcad"), { recursive: true });
  writeFileSync(join(root, "examples/openscad/mcad/gears.scad"), "cube(1);");
  writeFileSync(join(root, "examples/openscad/mcad/skipme.scad"), "cube(1);");
  writeFileSync(join(root, "examples/openscad/mcad/skip.txt"), "# c\nskipme.scad\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("loadSkipList parses filenames and ignores comments/blanks", () => {
  const set = loadSkipList(join(root, "examples/openscad/mcad/skip.txt"));
  expect(set.has("skipme.scad")).toBe(true);
  expect(set.size).toBe(1);
});

test("enumerateModels lists models, skips skip-listed, returns root-relative paths", () => {
  const out = enumerateModels(join(root, "examples"), {
    mcad: { dir: "openscad/mcad", ext: ".scad", skipFile: "openscad/mcad/skip.txt" },
  }, root);
  expect(out.map((m) => m.id)).toEqual(["mcad/gears"]);
  expect(out[0]).toMatchObject({ lang: "scad", source: "mcad", path: "examples/openscad/mcad/gears.scad" });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run test/enumerate.test.js` → FAIL (module not found).

- [ ] **Step 3: Create `scripts/lib/enumerate.js`**

```js
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, basename, extname } from "node:path";

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
      const name = base.endsWith(".example.js") ? base.slice(0, -".example.js".length) : basename(file, extname(file));
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
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run test/enumerate.test.js` → PASS (2).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/enumerate.js test/enumerate.test.js
git commit -m "feat(c): catalog generator — enumerate curated subset"
```

---

### Task 4: Generator — verify (`scripts/lib/verify.js`)

**Files:**
- Create: `scripts/lib/verify.js`, `test/verify.test.js`

**Interfaces:**
- Consumes: A's `runModel` from `mcp/lib/runner.js` (`runModel(modelPath, { outputs:['eval','measure'] }) => { ok, geomType, measure?, error?, line? }`).
- Produces: `verifyModel(absPath) => Promise<{ runs, geomType, dimensions, polygonCount, failureClass, error }>`; `classifyFailure(result) => failureClass`.

- [ ] **Step 1: Write the failing test `test/verify.test.js`**

```js
import { test, expect } from "vitest";
import { verifyModel } from "../scripts/lib/verify.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;

test("verifies a runnable model", async () => {
  const v = await verifyModel(fx("cube.js"));
  expect(v.runs).toBe(true);
  expect(v.geomType).toBe("geom3");
  expect(v.dimensions).toEqual([10, 10, 10]);
  expect(v.failureClass).toBeNull();
});

test("classifies a broken model as a failure", async () => {
  const v = await verifyModel(fx("broken.js"));
  expect(v.runs).toBe(false);
  expect(v.failureClass).not.toBeNull();
  expect(typeof v.error).toBe("string");
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found).

- [ ] **Step 3: Create `scripts/lib/verify.js`**

```js
import { runModel } from "../../mcp/lib/runner.js";

export const classifyFailure = (r) => {
  const msg = String(r.error || "").toLowerCase();
  if (r.error === "timeout") return "timeout";
  if (/no geometry|empty/.test(msg)) return "empty";
  if (/parse|transpile|unexpected|not defined|undefined is not/.test(msg)) return "transpiler-gap";
  if (/font|rands|text/.test(msg)) return "font/rands";
  return "openscad-lib-bug";
};

export const verifyModel = async (absPath) => {
  const r = await runModel(absPath, { outputs: ["eval", "measure"], timeoutMs: 20000 });
  if (!r.ok) {
    return { runs: false, geomType: r.geomType ?? "unknown", dimensions: null, polygonCount: null, failureClass: classifyFailure(r), error: String(r.error ?? "unknown") };
  }
  const m = r.measure ?? {};
  return {
    runs: true, geomType: r.geomType, dimensions: m.dimensions ?? null,
    polygonCount: m.polygonCount ?? null, failureClass: null, error: null,
  };
};
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run test/verify.test.js` → PASS (2). (`broken.js` fixture already exists from sub-project A.)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/verify.js test/verify.test.js
git commit -m "feat(c): catalog generator — eval-verify + failure classification"
```

---

### Task 5: Generator — describe (`scripts/lib/describe.js`)

**Files:**
- Modify: `package.json` (add `@anthropic-ai/sdk`)
- Create: `scripts/lib/describe.js`, `test/describe.test.js`

**Interfaces:**
- Produces: `describeModel(client, { source, id }) => Promise<{ name, description, tags, techniques }>`. `client` is an object with `messages.create(opts) => { content:[{type:"text", text}] }` (the Anthropic SDK shape; tests pass a mock). Validates the JSON; retries once on malformed; on second failure returns a safe fallback `{ name: id, description:"", tags:[], techniques:[] }`.
- `MODEL = "claude-haiku-4-5-20251001"`, `buildPrompt({source, id}) => string`.

- [ ] **Step 1: Add the dependency**

Run: `npm install @anthropic-ai/sdk@^0.40.0` (or current). Add `@anthropic-ai/sdk` to `knip.json` `ignoreDependencies` (imported only by the generator script, which knip's entries cover via `scripts/**` — if knip flags it, keep it ignored).

- [ ] **Step 2: Write the failing test `test/describe.test.js`**

```js
import { test, expect } from "vitest";
import { describeModel } from "../scripts/lib/describe.js";

const mockClient = (text) => ({ messages: { create: async () => ({ content: [{ type: "text", text }] }) } });

test("parses a well-formed JSON description", async () => {
  const client = mockClient(JSON.stringify({ name: "Gear", description: "A gear.", tags: ["gear"], techniques: ["involute"] }));
  const d = await describeModel(client, { source: "cube(1);", id: "mcad/gear" });
  expect(d).toEqual({ name: "Gear", description: "A gear.", tags: ["gear"], techniques: ["involute"] });
});

test("falls back safely on persistently malformed output", async () => {
  const client = mockClient("not json at all");
  const d = await describeModel(client, { source: "cube(1);", id: "mcad/widget" });
  expect(d.name).toBe("mcad/widget");
  expect(d.tags).toEqual([]);
});
```

- [ ] **Step 3: Run to verify it fails** — FAIL (module not found).

- [ ] **Step 4: Create `scripts/lib/describe.js`**

```js
export const MODEL = "claude-haiku-4-5-20251001";
const MAX_SOURCE = 6000;

export const buildPrompt = ({ source, id }) =>
  `You are cataloging a CAD model file (id: ${id}). Read its source and reply with ONLY a JSON object: ` +
  `{"name": short title, "description": one paragraph of what it models, "tags": [lowercase nouns], "techniques": [cad techniques used]}. ` +
  `No prose, no code fences.\n\nSOURCE:\n${source.slice(0, MAX_SOURCE)}`;

const tryParse = (text) => {
  try {
    const m = String(text).match(/\{[\s\S]*\}/);
    const o = JSON.parse(m ? m[0] : text);
    if (typeof o.name !== "string") return null;
    return { name: o.name, description: String(o.description ?? ""), tags: Array.isArray(o.tags) ? o.tags : [], techniques: Array.isArray(o.techniques) ? o.techniques : [] };
  } catch {
    return null;
  }
};

export const describeModel = async (client, { source, id }) => {
  const ask = async () => {
    const res = await client.messages.create({ model: MODEL, max_tokens: 400, messages: [{ role: "user", content: buildPrompt({ source, id }) }] });
    const text = res.content?.map((b) => b.text ?? "").join("") ?? "";
    return tryParse(text);
  };
  return (await ask()) ?? (await ask()) ?? { name: id, description: "", tags: [], techniques: [] };
};
```

- [ ] **Step 5: Run to verify it passes** — `npx vitest run test/describe.test.js` → PASS (2).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json knip.json scripts/lib/describe.js test/describe.test.js
git commit -m "feat(c): catalog generator — Anthropic description with validation/fallback"
```

---

### Task 6: Generator orchestrator (`scripts/build-catalog.js`)

**Files:**
- Create: `scripts/build-catalog.js`, `test/build-catalog.test.js`

**Interfaces:**
- Consumes: `enumerateModels`, `verifyModel`, `describeModel`, `loadCatalog`.
- Produces: `buildCatalog({ jscaduiRoot, existing, verify, describe, hashOf }) => Promise<{ entries, report }>` — pure orchestration injected with `verify`/`describe`/`hashOf` so it's testable without the API or filesystem; incremental (reuse `existing` entry when `srcHash` unchanged); `report` groups failures by `failureClass`. The CLI `main()` wires real implementations + writes `catalog/catalog.json` and prints the report. `SOURCES` config (the curated subset map) lives here.

- [ ] **Step 1: Write the failing test `test/build-catalog.test.js`**

```js
import { test, expect } from "vitest";
import { buildCatalog } from "../scripts/build-catalog.js";

const models = [
  { id: "mcad/a", path: "examples/openscad/mcad/a.scad", lang: "scad", source: "mcad" },
  { id: "mcad/b", path: "examples/openscad/mcad/b.scad", lang: "scad", source: "mcad" },
];

test("builds entries, classifies failures, and reuses unchanged by srcHash", async () => {
  let describeCalls = 0;
  const verify = async (m) => m.id === "mcad/b"
    ? { runs: false, geomType: "unknown", dimensions: null, polygonCount: null, failureClass: "transpiler-gap", error: "x" }
    : { runs: true, geomType: "geom3", dimensions: [1, 1, 1], polygonCount: 12, failureClass: null, error: null };
  const describe = async (m) => { describeCalls++; return { name: m.id, description: "d", tags: ["t"], techniques: [] }; };
  const hashOf = (m) => `h-${m.id}`;

  const first = await buildCatalog({ models, existing: [], verify, describe, hashOf });
  expect(first.entries).toHaveLength(2);
  expect(first.report["transpiler-gap"]).toBe(1);
  expect(describeCalls).toBe(2);

  // Second run with one unchanged (same srcHash) -> describe NOT called for it
  describeCalls = 0;
  const second = await buildCatalog({ models, existing: first.entries, verify, describe, hashOf });
  expect(describeCalls).toBe(0); // both hashes unchanged -> fully reused
  expect(second.entries).toHaveLength(2);
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (module not found).

- [ ] **Step 3: Create `scripts/build-catalog.js`**

```js
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { enumerateModels } from "./lib/enumerate.js";
import { verifyModel } from "./lib/verify.js";
import { describeModel } from "./lib/describe.js";

const PLUGIN_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const JSCADUI_ROOT = resolve(PLUGIN_ROOT, "../jscadui");
const EXAMPLES = resolve(JSCADUI_ROOT, "apps/jscad-web/examples");
const CATALOG = resolve(PLUGIN_ROOT, "catalog/catalog.json");

export const SOURCES = {
  jscad: { dir: "jscad", ext: ".example.js" },
  mcad: { dir: "openscad/mcad", ext: ".scad" },
  nopscadlib: { dir: "openscad/nopscadlib", ext: ".scad" },
  bosl2: { dir: "openscad/bosl2", ext: ".scad", skipFile: "openscad/bosl2/skip.txt" },
  snippet: { dir: "openscad/snippet", ext: ".scad" },
  text: { dir: "openscad/text", ext: ".scad" },
};

export const buildCatalog = async ({ models, existing = [], verify, describe, hashOf, concurrency = 6 }) => {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const report = {};
  const entries = [];
  let i = 0;
  const worker = async () => {
    while (i < models.length) {
      const m = models[i++];
      const srcHash = hashOf(m);
      const prev = byId.get(m.id);
      let entry;
      if (prev && prev.srcHash === srcHash) {
        entry = prev;
      } else {
        const v = await verify(m);
        const d = v.runs || !prev ? await describe(m) : await describe(m);
        entry = { id: m.id, path: m.path, lang: m.lang, source: m.source, ...d, ...v, srcHash };
      }
      if (entry.failureClass) report[entry.failureClass] = (report[entry.failureClass] || 0) + 1;
      entries.push(entry);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, models.length || 1) }, worker));
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return { entries, report };
};

const main = async () => {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const force = process.argv.includes("--force");
  const models = enumerateModels(EXAMPLES, SOURCES, JSCADUI_ROOT);
  const existing = !force && existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8")) : [];
  const hashOf = (m) => createHash("sha256").update(readFileSync(resolve(JSCADUI_ROOT, m.path), "utf8")).digest("hex");
  let done = 0;
  const { entries, report } = await buildCatalog({
    models, existing,
    verify: (m) => verifyModel(resolve(JSCADUI_ROOT, m.path)),
    describe: (m) => describeModel(client, { source: readFileSync(resolve(JSCADUI_ROOT, m.path), "utf8"), id: m.id }),
    hashOf,
  });
  for (const e of entries) if (++done) process.stdout.write(`\r${done}/${entries.length}`);
  writeFileSync(CATALOG, JSON.stringify(entries, null, 2) + "\n");
  process.stdout.write(`\nwrote ${entries.length} entries\n`);
  console.log("gap report (failures by class):", report);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```
Note: the `const d = v.runs || !prev ? await describe(m) : await describe(m)` always calls describe for changed entries (we want a description even for failures). Keep it simple: `const d = await describe(m)`.

- [ ] **Step 4: Simplify the describe call in `buildCatalog`**

Replace `const d = v.runs || !prev ? await describe(m) : await describe(m);` with:
```js
const d = await describe(m);
```

- [ ] **Step 5: Run to verify it passes** — `npx vitest run test/build-catalog.test.js` → PASS (1). Confirms incremental reuse (describe not called when srcHash unchanged) and the gap report.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-catalog.js test/build-catalog.test.js
git commit -m "feat(c): catalog generator orchestrator (incremental + gap report)"
```

---

### Task 7: `jscad-library` skill + dual-terminal docs + integration

**Files:**
- Create: `skills/jscad-library/SKILL.md`, `docs/opencode-setup.md`
- Modify: `README.md`

**Interfaces:** docs/skill only.

- [ ] **Step 1: Create `skills/jscad-library/SKILL.md`**

```markdown
---
name: jscad-library
description: Search and reuse the curated jscadui model library (bearings, gears, motors, hardware, technique demos) from the jscad-studio MCP. Use when the user wants to find an existing part, reuse a model, or look up how to model something. Triggers on library, find a part, reuse, bearing, gear, screw, motor, example, "how do I model".
compatibility: claude-code, opencode
---

# Using the jscad model library

The `jscad-studio` MCP exposes a curated, eval-verified catalog of ~820 models from the jscadui libraries (mcad, nopscadlib, bosl2, snippets, native jscad).

## Find a part or technique
- `library_search({ query, tags?, source?, lang?, runnableOnly? })` — search by capability/part/technique (e.g. `"608 bearing"`, `"involute gear"`, `"rounded box"`). Pass `runnableOnly: true` to get only models that currently evaluate. `source` filters by library (`mcad`, `nopscadlib`, `bosl2`, `snippet`, `text`, `jscad`); `lang` is `scad` or `js`.
- `library_get({ id })` — fetch the full catalog entry (dimensions, tags, techniques) plus the model's source code.

## Reuse a model (transparent OpenSCAD/JSCAD parts)
Any model — `.scad` or `.js` — can be `require`d straight into your model and composed with jscad-fluent:
```js
const jf = require("@jbroll/jscad-fluent");
const bearing = require("<path from library_get>"); // returns a composable geometry
return jf.cuboid({ size: [40, 40, 10] }).subtract(bearing);
```
Use a model's source (from `library_get`) as a **technique reference** when you don't want to import it wholesale.

## Preview
Run the `render` tool on the entry's `path` to get a PNG of any catalog model.
```

- [ ] **Step 2: Create `docs/opencode-setup.md`**

```markdown
# Using jscad-ai-studio from OpenCode

The `jscad-studio` MCP server and skills are portable. OpenCode reads `.claude/skills/**/SKILL.md` unmodified, so the `jscad-library` (and other) skills work as-is. Register the MCP server in `opencode.json`:

\`\`\`json
{
  "mcp": {
    "jscad-studio": {
      "type": "local",
      "command": ["node", "<path to>/jscad-ai-studio/mcp/server.js"],
      "enabled": true
    }
  }
}
\`\`\`

(Claude Code uses `.mcp.json` with the same `node mcp/server.js` command — see the repo root.)
```

- [ ] **Step 3: Update `README.md`**

Add a "Model library (MCP)" section: the catalog is generated with `ANTHROPIC_API_KEY=… node scripts/build-catalog.js` (incremental; `--force` rebuilds), committed to `catalog/catalog.json`; search via the `library_search`/`library_get` MCP tools; works in Claude Code (`.mcp.json`) and OpenCode (`opencode.json`, see `docs/opencode-setup.md`).

- [ ] **Step 4: Verify + commit**

Run: `npm test` → all suites green (no API key needed).
Run: `lefthook run pre-commit` → clean.
```bash
git add skills/jscad-library/SKILL.md docs/opencode-setup.md README.md
git commit -m "docs(c): jscad-library skill + dual-terminal (Claude Code/OpenCode) setup"
```

---

## Self-Review

**Spec coverage:**
- Catalog schema + storage — Task 1 (`catalog.js`, `catalog/catalog.json`, fixture). ✓
- Generation pipeline (enumerate/verify/describe/orchestrate, incremental, gap report) — Tasks 3–6. ✓
- `library_search`/`library_get` tools — Task 2. ✓
- `jscad-library` skill (portable + compatibility frontmatter) — Task 7. ✓
- Dual-terminal MCP config — Task 7 (`opencode-setup.md` + README). ✓
- Keyword/tag search, no embeddings — Task 1. ✓
- Repair policy (record + gap report, no inline fix) — Tasks 4 (classify) + 6 (report). ✓
- Tests offline / no API key (fixture catalog + mocked Anthropic) — Tasks 1,5,6. ✓
- `polygonCount` (not triangleCount) per A's measure — Global Constraints + Task 4. ✓

**Placeholder scan:** none — every step has concrete code/commands. Task 1 Steps 5–6 spell out the path-resolution fallback explicitly; Task 6 Steps 3–4 correct the describe call inline.

**Type consistency:** `enumerateModels → {id,path,lang,source}` consumed by `buildCatalog.models`; `verifyModel/verify → {runs,geomType,dimensions,polygonCount,failureClass,error}` and `describeModel/describe → {name,description,tags,techniques}` are spread into the entry alongside `{id,path,lang,source,srcHash}` — matching the catalog schema consumed by `searchCatalog`/`getEntry`/`library_*`. Consistent across tasks.

**Note for execution:** populating the real `catalog/catalog.json` (~820 entries) is a user-run step needing `ANTHROPIC_API_KEY` and is NOT part of any task's automated verification; the committed catalog stays `[]` until run.
