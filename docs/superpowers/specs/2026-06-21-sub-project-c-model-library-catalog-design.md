# Sub-project C — Model Library Catalog + Search — Design

**Date:** 2026-06-21
**Status:** Approved (design). Follows sub-projects A (core MCP engine) and B (OpenSCAD transparent parts), both shipped.
**Parent:** `2026-06-21-jscad-ai-cad-system-design.md`.

## Summary

Make the ~820 reference models in `../jscadui` (jscad-native + OpenSCAD libraries) **searchable and usable** from the `jscad-studio` MCP. A committed, **LLM-curated catalog** records, per model, an LLM-written name/description/tags/techniques **plus a real headless eval** (runs?/geomType/dimensions/failure-class). Two MCP tools (`library_search`, `library_get`) expose it, and a portable `jscad-library` skill ties it to sub-project B: search → pick a part → `require('<path>')` it (OpenSCAD or JSCAD, transparently) or read its source as a technique reference.

## Decisions (from brainstorming)

- **Catalog richness:** LLM description + **eval-verify** (run each model headlessly via A's runner; record `runs`/`geomType`/`dimensions`/`triangleCount`/`failureClass`). No bulk thumbnails (render on demand via the existing `render` tool).
- **Scope:** curated subset (~820): jscad-native (28) + mcad (51) + nopscadlib (376) + bosl2 (234) + snippet (122) + text (11). Skip dotscad (algorithmic art) and bosl v1 (superseded by bosl2); backfill later.
- **Search:** keyword/tag scoring over the LLM-curated fields — **no embeddings** (offline, simple; the curated tags/techniques make keyword search effective).
- **Generation:** a committed, repeatable **Node build script** using the Anthropic API for descriptions (not a live agent), incremental by source hash.
- **Repair policy:** the catalog **records** failures (with a `failureClass`) and emits a **prioritized gap report**; it does NOT fix transpiler bugs inline. Transpiler fixes are separate focused efforts (as the bosl2 fix was — see [[jscadui-bosl2-no-geometry-bug]]).
- **Terminals:** Claude Code AND OpenCode. Skills are portable `SKILL.md` (OpenCode reads `.claude/skills/**/SKILL.md` unmodified); the only per-terminal difference is MCP registration config (`.mcp.json` vs `opencode.json`) and slash-commands (Claude-only — not relied on for anything essential).

## Background (verified)

- A's `runModel(modelPath, { outputs })` evaluates `.js` and (after B) `.scad` headlessly, returning `{ ok, geomType, measure:{dimensions,...}, error, line }`. The catalog generator reuses it directly.
- OpenSCAD corpus pass rates after the bosl2 fix (CI, 2026-06-21): bosl2 100%, bosl 100%, snippet 100%, text 100%, 01-basics 100%, nopscadlib 98.8%, mcad 92.9%, dotscad 91.3%. So most curated-subset models eval cleanly; the catalog records the rest.
- Examples live under `/home/john/src/jscadui/apps/jscad-web/examples/{jscad,openscad/<lib>}`; jscadui skip-lists at `packages/openscad/test/corpus/bosl2/skip.txt`, `snippet-skip.txt`.
- Anthropic SDK: `@anthropic-ai/sdk`; description model `claude-haiku-4-5-20251001` (cheap, fast); needs `ANTHROPIC_API_KEY`.

## Architecture

```
catalog/catalog.json                         committed, ~820 entries (LLM desc + eval-verify)
scripts/build-catalog.js                     one-time/incremental generator (Node + Anthropic API + runModel)
  ├─ lib/enumerate.js   curated-subset file list (honors skip-lists)
  ├─ lib/describe.js    Anthropic call: source -> {name, description, tags[], techniques[]}
  └─ lib/verify.js      runModel eval -> {runs, geomType, dimensions, triangleCount, failureClass, error}
mcp/lib/catalog.js                           load + keyword/tag search over catalog.json (in-memory)
mcp/lib/tools.js (extend)                    handlers.library_search, handlers.library_get
mcp/server.js (extend)                       register library_search, library_get (zod schemas)
skills/jscad-library/SKILL.md                portable skill: search -> require/reference
docs/opencode-setup.md  (+ README)           opencode.json MCP snippet alongside .mcp.json
```

### Catalog entry schema
```json
{ "id": "mcad/involute_gears", "path": "<repo-relative path under jscadui examples>",
  "lang": "scad" | "js", "source": "mcad" | "nopscadlib" | "bosl2" | "snippet" | "text" | "jscad",
  "name": "Involute Gears", "description": "one-paragraph summary",
  "tags": ["gear","mechanical"], "techniques": ["gear","rotate_extrude"],
  "runs": true, "geomType": "geom3" | "geom2" | "array" | "unknown",
  "dimensions": [w,d,h] | null, "triangleCount": N | null,
  "failureClass": null | "transpiler-gap" | "openscad-lib-bug" | "font/rands" | "empty" | "timeout",
  "error": null | "message", "srcHash": "<sha256 of source>" }
```

## Generation pipeline (`scripts/build-catalog.js`)

1. **Enumerate** the curated subset via `lib/enumerate.js`: walk the example dirs, filter to `.scad`/`.example.js`, drop files matching the jscadui skip-lists; emit `{ id, path, lang, source }`.
2. **Incremental:** load the existing `catalog/catalog.json`; for each file compute `srcHash`; skip unchanged entries.
3. For each new/changed file, concurrency-limited (e.g. 6):
   - **verify** (`lib/verify.js`): `runModel(absPath, { outputs:['eval','measure'] })` → `runs`/`geomType`/`dimensions`/`triangleCount`; on failure, classify into `failureClass` from the error (parse/transpile → `transpiler-gap`; empty geometry → `empty`; timeout → `timeout`; font/rands marker → `font/rands`; otherwise `openscad-lib-bug`) and keep `error`.
   - **describe** (`lib/describe.js`): one Anthropic `claude-haiku-4-5-20251001` call with the source (truncated to a sane cap) → strict JSON `{name, description, tags, techniques}` (validated; retry once on malformed).
4. **Write** `catalog/catalog.json` (stable key order for clean diffs). **Log** progress and a **gap report**: failures grouped by `failureClass`, transpiler-gaps first, with counts — no silent drops.
5. Idempotent re-runs only process changed files; a `--force` flag rebuilds all.

## MCP tools (`mcp/lib/catalog.js` + `tools.js` + `server.js`)

- `mcp/lib/catalog.js`: `loadCatalog()` (memoized read of `catalog/catalog.json`), `searchCatalog(query, filters)` → ranked entries (score = weighted keyword/substring matches across name, tags, techniques, description; filters: `tags`, `source`, `lang`, `runnableOnly`), `getEntry(id)` → entry + source code read from `path`.
- `library_search({ query, tags?, source?, lang?, runnableOnly? })` → `{ results: [{id,name,source,lang,tags,runs,dimensions,description}] }` (top N, default 20).
- `library_get({ id })` → `{ entry, source }` (full entry + the model's source text).
- On-demand thumbnail: the existing `render` tool on `entry.path` (no new tool).

## `jscad-library` skill (portable)

`skills/jscad-library/SKILL.md` with frontmatter `name`, `description`, `compatibility: claude-code, opencode`. Triggers on library/find-a-part/reuse intents. Content: how to `library_search` (by capability/part/technique), inspect with `library_get`, then either **`require('<path>')` the part into a model** (transparent OpenSCAD/JSCAD parts from B) or read its source as a technique reference; note `runnableOnly` for importable parts and that `render` can preview any entry.

## Packaging (both terminals)

- MCP server unchanged; document **both** registration snippets: `.mcp.json` (Claude Code, already present) and an `opencode.json` MCP block (OpenCode) in `docs/opencode-setup.md` + README.
- The skill is portable `SKILL.md`; no `AGENTS.md` wrapper needed.

## Testing (Vitest)

- `mcp/lib/catalog.js`: `searchCatalog`/`getEntry` against a small **committed fixture catalog** (`test/fixtures/catalog.fixture.json`, ~5 entries) — fast, offline, no API key. Assert ranking (a query matches the right entry first), filters (`source`, `lang`, `runnableOnly`), and `getEntry` returns source.
- `library_search`/`library_get` handlers (via `handlers.*`) return the documented envelopes.
- Generator unit logic: `lib/enumerate.js` (skip-list filtering on a 3-file temp tree) and the incremental `srcHash` skip (unchanged file is skipped) — **LLM call mocked**; `runModel` exercised on one real example.
- Interop: a fixture-catalog entry's `path` `require()`s and composes (B guarantee) for at least one `.scad` and one `.js`.

## Scope & deferred

- **IN:** ~820 curated subset; eval-verified + LLM-described entries; gap report; two tools + skill; incremental rebuild; dual MCP config docs.
- **DEFERRED:** dotscad + bosl v1 backfill; bulk thumbnails; embedding/semantic search; auto-refresh on corpus change; fixing the remaining non-100% libraries (separate efforts).

## Success criteria

- `node scripts/build-catalog.js` (with `ANTHROPIC_API_KEY`) produces `catalog/catalog.json` for the curated subset, incremental on re-run, and prints a gap report.
- `library_search("bearing")` returns relevant runnable entries; `library_get(id)` returns the entry + source.
- The `jscad-library` skill loads in Claude Code and is discoverable by OpenCode (`.claude/skills/`).
- A catalog entry can be `require`d into a model and composes.
- Vitest green (no API key needed for tests); `lefthook run pre-commit` clean.
