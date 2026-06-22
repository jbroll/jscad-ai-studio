# Session Friction Analyzer — Design

**Date:** 2026-06-22
**Status:** Approved (design).
**Context:** Agents (OpenCode, Claude Code) drive jscad-work sessions guided by our prompts (`AGENTS.md`, `JSCAD.md`, the jscad-fluent `llm.txt`, the `jscad-library` skill). We want to read those sessions' local transcripts, find where the agent struggled, and key each finding to the prompt that could fix it — to drive prompt improvements.

## Summary

A read-only `scripts/` CLI reconstructs OpenCode + Claude Code session transcripts into one normalized shape, filters to jscad-work workspaces, runs deterministic friction heuristics plus an optional Ollama qualitative pass, and emits a markdown report grouped by which prompt to improve.

## Background (verified)

- **OpenCode** stores sessions under `~/.local/share/opencode/storage/`: `session/<projectHash>/ses_*.json`, `message/<sessionID>/msg_*.json` (`{ id, sessionID, role, time, agent, model }`), `part/<messageID>/prt_*.json`. Part types observed: `step-start`, `step-finish`, `text`, `reasoning`, `compaction`, `tool`. A `tool` part is `{ id, sessionID, messageID, callID, tool, state }` with `state = { status, input, error, time }` — **`state.status === "error"` directly flags a failed tool call**. `project/<hash>.json` (+ `global.json`) maps a project hash to its directory path.
- **Claude Code** stores `~/.claude/projects/<encoded-cwd>/<uuid>.jsonl` — one JSON record per line. The directory name encodes the cwd (e.g. `-home-john-src-simple-ci`). Message records (`type: "user" | "assistant"`) carry content blocks; assistant `tool_use` blocks and user `tool_result` blocks (with `is_error: true` on failures) encode tool calls/results. Non-message records (`mode`, `permission-mode`, `last-prompt`, summaries) are skipped.
- The catalog already ships an Ollama client (`scripts/lib/ollama-client.js`, `messages.create`-shaped) and a backend-selection pattern — reuse it (no API key needed).

## Decisions (from brainstorming)

- **Both agents**, one normalized transcript, two readers.
- **Include the `--llm` Ollama qualitative pass** (catches "confused about the API / misread JSCAD.md" that heuristics miss). Heuristics run with no model; `--llm` adds the Ollama summary.
- **Filter to jscad-work workspaces by default** (`--all` to include every session).
- Read-only over transcripts; never mutate them.

## Architecture

```
scripts/lib/transcript.js            normalized shape + shared helpers (isJscadWorkSession)
scripts/lib/transcript-opencode.js   readOpencodeSessions(opts) -> Transcript[]
scripts/lib/transcript-claude.js     readClaudeSessions(opts)   -> Transcript[]
scripts/lib/friction.js              analyzeFriction(t) -> FrictionResult  (deterministic)
scripts/lib/friction-llm.js          llmFriction(client, t) -> { summary, promptFixes[] }
scripts/lib/session-report.js        renderReport(results) -> markdown
scripts/analyze-sessions.js          CLI orchestrator (gather -> filter -> analyze -> write)
```

### Normalized transcript (the contract between readers and analysis)
```
Transcript = {
  agent: "opencode" | "claude",
  sessionId: string,
  cwd: string | null,            // resolved workspace path (for filtering / labeling)
  model: string | null,
  startedAt: number | null,      // epoch ms
  turns: Array<{
    role: "user" | "assistant",
    text: string,                // concatenated text/reasoning for this turn
    toolCalls: Array<{ tool: string, status: "ok" | "error", error?: string, input?: any }>,
  }>,
  events: { compactions: number },
}
```

### `transcript-opencode.js`
`readOpencodeSessions({ storageDir = ~/.local/share/opencode/storage } = {})`:
- For each `session/*/ses_*.json`, derive `sessionId` (filename) and `cwd` (resolve the `projectHash` dir → `project/<hash>.json` → its path; `null` if unmapped).
- Load `message/<sessionId>/*.json` (sorted by `time`); for each, gather `part/<messageId>/*.json`: `text`/`reasoning` → turn text; `tool` → `{ tool, status: state.status === "error" ? "error" : "ok", error: state.error, input: state.input }`; `compaction` → increment `events.compactions`.
- `model` from the first message that has one. Return `Transcript[]`.

### `transcript-claude.js`
`readClaudeSessions({ projectsDir = ~/.claude/projects } = {})`:
- For each `*.jsonl`, `cwd` = decode the parent dir name (leading `-` → `/`, `-` → `/`; best-effort, used for labeling/filtering). `sessionId` = file stem.
- Parse each line; keep `type: "user" | "assistant"`. Assistant content blocks: `text` → turn text; `tool_use` → a pending call keyed by `id`. User content blocks: `tool_result` → resolve the matching call's status (`is_error ? "error" : "ok"`) + error text. Summaries/`isCompactSummary` → `events.compactions++`.

### `friction.js` — deterministic signals
`analyzeFriction(t) => { sessionId, agent, cwd, signals: {...}, score }` where signals include:
- `toolErrors`: count + samples `[{ tool, error }]`; **`evalErrors`** broken out (tool name `eval`/`jscad-studio_eval` etc.) — the highest-signal jscad failure.
- `retries`: count of consecutive same-`tool`+same-target calls (target = input file path / first input field).
- `compactions`: from `events`.
- `bootstrapMiss` (jscad-work sessions): true if no tool call/text references starting the server (`jscad-work`) AND text shows start-confusion (regex like `how (do|to).*(start|run)`, `read .*JSCAD\.md` absent) — best-effort heuristic.
- `constraintHits`: matches in assistant text/tool input for likely violations — degrees-not-radians (`rotate.*\b(90|180|45|270)\b` without `Math.PI`), 0–255 colors (`colorize.*\b(1[0-9]{2}|2[0-5][0-9])\b`). Reported as low-confidence hints.
- `score`: a simple weighted sum (eval errors heaviest) to rank sessions.

### `friction-llm.js` — optional Ollama pass
`llmFriction(client, t)`: build a compact prompt (turns trimmed + the tool-error list) asking for JSON `{ summary, promptFixes: [{ prompt: "AGENTS.md"|"JSCAD.md"|"llm.txt"|"skill", issue, suggestion }] }`. Reuse `ollama-client.js`; same two-try parse as the catalog's `describeModel`. Only invoked when `--llm`.

### `analyze-sessions.js` — CLI
- Gather: `readOpencodeSessions()` + `readClaudeSessions()`.
- Filter: keep sessions where `isJscadWorkSession(t)` (cwd contains a `JSCAD.md` or `AGENTS.md`, or the transcript used a `jscad-studio`/`jscad-work` tool); `--all` disables the filter.
- Analyze: `analyzeFriction` for each; if `--llm`, also `llmFriction` (backend chosen like the catalog: `OLLAMA_HOST` → Ollama).
- Report: `renderReport` → write `docs/session-analysis/<YYYY-MM-DD>-friction.md` (path printed). `--stdout` to print instead.

### `session-report.js`
`renderReport(results)` → markdown: a summary header (sessions analyzed, tool-error rate, top failures), a **"By prompt"** section (findings grouped under `AGENTS.md` / `JSCAD.md` / `llm.txt` / `skill`, deterministic signals + any `--llm` suggestions), and a per-session detail table sorted by `score`.

## Error handling
- Missing storage dir (agent not installed) → that reader returns `[]` (no crash); report notes "0 OpenCode/Claude sessions".
- Malformed JSON line/file → skip it, continue (count skipped).
- Unmapped OpenCode project hash → `cwd: null` (still analyzed under `--all`; excluded by the default jscad-work filter).
- `--llm` with no Ollama reachable → log a warning, fall back to heuristics-only (don't fail the run).
- Best-effort `cwd` decode for Claude → only used for filtering/labeling, never for file writes.

## Testing (Vitest)
- **`transcript-opencode`**: a synthetic `storage/` fixture tree (one session, two messages, parts incl. a `tool` with `state.status:"error"` and a `compaction`) → assert reconstructed turns, the error tool call, `compactions: 1`, resolved `cwd`.
- **`transcript-claude`**: a synthetic `.jsonl` fixture (user+assistant, a `tool_use` + matching `tool_result` with `is_error`) → assert turns + the error call + decoded `cwd`.
- **`friction`**: a seeded transcript with an `eval` error + a same-target retry + a bootstrap-miss + a degrees-not-radians input → assert each signal is flagged and `score > 0`.
- **`session-report`**: given two `FrictionResult`s → assert the markdown has a summary, a "By prompt" section, and per-session rows.
- **`friction-llm`**: unit with a stub client returning canned JSON → assert parse into `{ summary, promptFixes }`; the real Ollama path is a gated integration check.

## Scope & deferred
- **IN:** two readers, `friction.js` heuristics, optional `--llm` Ollama pass, report, CLI, jscad-work filter, tests.
- **DEFERRED:** automatically editing the prompt files from suggestions (report only); a live/streaming logger (we read existing local storage); cross-session trend charts; redaction (transcripts stay local, not published).

## Success criteria
- `node scripts/analyze-sessions.js` writes a friction report over local OpenCode + Claude jscad-work sessions; tool errors (esp. `eval` failures), retries, compactions, and bootstrap misses are surfaced and grouped by prompt.
- `--llm` adds Ollama qualitative findings + prompt-fix suggestions; without it, heuristics-only still produces a useful report.
- `--all` includes non-jscad-work sessions.
- Readers tolerate a missing agent / malformed records without crashing.
- Unit tests pass; full suite green; `lefthook run pre-commit` + `npm run knip` clean.
