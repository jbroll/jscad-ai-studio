# Single-Command Startup — Design

**Date:** 2026-06-22
**Status:** Approved (design).
**Context:** Reduce the current two-terminal flow (`jscad-work` in one terminal, `claude` + a typed "Read ./JSCAD.md" prompt in another) to a single command, by having the agent start the work server itself and bootstrap from an auto-loaded instruction file.

## Summary

After a one-time `jscad-work init` per workspace, the user runs only their agent CLI (`claude` or `opencode`). The agent auto-loads `AGENTS.md`/`CLAUDE.md`, which instructs it to start the `jscad-work` server **detached in the background** if one isn't already running, then read `JSCAD.md` and begin. The server persists across sessions (reused via an idempotent guard) until `jscad-work stop`.

## Background (verified)

- A model directory currently contains only the generated, git-ignored `JSCAD.md` + `.jscad-studio` (written by `jscad-work`). There is no `CLAUDE.md`/`AGENTS.md`, so a bare `claude` has no startup pointer and the user must type "Read ./JSCAD.md and complete the startup actions."
- The plugin root already uses `CLAUDE.md` = `@file JSCAD.md` — the import pattern works.
- `.jscad-studio` already records `{ serverPort, pid, currentModel, viewerUrl }` — enough to detect a live server.
- `jscad-work <model>` today starts a **foreground, blocking** HTTP server (SIGINT handler keeps it alive) — which is why it needs its own terminal.
- Both Claude Code (`CLAUDE.md`) and OpenCode (`AGENTS.md`) auto-load their instruction file at startup, and both run shell commands — so an **OS-level detached launch** (`nohup … &`) gives identical behavior across tools (no reliance on a tool-specific background feature). The trade-off accepted: the detached server persists beyond the agent session until explicitly stopped.

## Decisions (from brainstorming)

- **Entry model:** the agent bootstraps — user runs only `claude`/`opencode`; the agent starts the server in the background.
- **Pointer files:** `AGENTS.md` carries the bootstrap instructions; `CLAUDE.md` is one line (`@file AGENTS.md`) — single source of truth, both tools covered.
- **One-time `jscad-work init`** seeds the pointer files (something must; a zero-setup bare `claude` is impossible). Accepted.
- **Detached server persists across sessions** (reused via the guard), torn down by `jscad-work stop`. Accepted.
- **Launch is OS-level detached** (`nohup … &`) for Claude Code / OpenCode parity.

## Architecture

```
bin/jscad-work.js (modify)
  ├─ subcommand `init [model.js]` — scaffold AGENTS.md + CLAUDE.md + starter model.js
  ├─ subcommand `stop`            — kill the running server (pid from .jscad-studio), remove the file
  ├─ run mode `<model.js>` (existing) — gains an idempotent live-server guard (exit early if already running)
  └─ lib helpers (new, testable):  isServerRunning(cwd), scaffoldWorkspace(cwd, model), stopServer(cwd)
```

`bin/jscad-work.js` has grown to hold templates + command dispatch; extract the pure, testable pieces into a small module (e.g. `mcp/lib/workspace.js`) so `init`/`stop`/guard logic is unit-testable without spawning servers. The CLI file keeps arg-dispatch + the server lifecycle.

### `jscad-work init [model.js]`
Scaffolds in the current directory (idempotent — never clobbers an existing file unless `--force`):
- **`AGENTS.md`** — the bootstrap pointer (content below). Created only if absent.
- **`CLAUDE.md`** — exactly `@file AGENTS.md\n`. Created only if absent.
- **starter `model.js`** — from the existing template, only if the directory has no `*.js` model. If a model name is given, use it.
Prints next-step guidance ("Now run: claude").

### `AGENTS.md` bootstrap content (the pointer)
A short, tool-agnostic instruction block:
```
# JSCAD AI Studio workspace

On startup, do this before anything else:

1. Ensure the work server is running. Check `.jscad-studio`: if it is missing,
   or its `pid` is not alive, start the server DETACHED in the background:
       nohup jscad-work <model>.js > /tmp/jscad-work.log 2>&1 &
   (replace <model> with the .js model in this directory). Then wait until
   `JSCAD.md` exists (the server writes it on startup).
2. Read `JSCAD.md` and complete its startup actions.

Reference: jscad-fluent API — https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt
Key constraints: angles in radians (Math.PI); colors 0–1; booleans same-type; immutable ops.
To stop the server when done: `jscad-work stop`.
```
Rationale: the agent has enough to act immediately; `JSCAD.md` (server-generated, with the live port/URL) carries the session-specific detail. `nohup … &` detaches at the OS level so it works identically in Claude Code and OpenCode and survives the command returning.

### Idempotent guard in `jscad-work <model.js>`
Before starting a server, call `isServerRunning(cwd)`:
- Read `.jscad-studio`; if present and `process.kill(pid, 0)` succeeds (pid alive), print `✓ server already running on port <serverPort> (<viewerUrl>)` and exit 0.
- Otherwise (no file, or stale/dead pid) proceed to start normally (and overwrite `.jscad-studio`).
This lets the AGENTS.md instruction call `jscad-work` unconditionally without ever spawning a second server. (`process.kill(pid,0)` throws `ESRCH` for a dead pid → treat as not running; `EPERM` → treat as running.)

### `jscad-work stop`
Read `.jscad-studio`; if a live pid, `process.kill(pid, 'SIGTERM')`; remove `.jscad-studio`. Print confirmation. If no file/dead pid, print "no running server" and exit 0 (idempotent).

## Resulting flow
- **First time per workspace:** `jscad-work init` → `claude` (or `opencode`).
- **Every session after:** `claude` / `opencode` only — agent reads AGENTS.md → starts the server detached if needed → reads JSCAD.md → begins. One terminal, one command.
- **Teardown:** `jscad-work stop` (or leave it running for the next session).

## Error handling
- `init` on a dir that already has `AGENTS.md`/`CLAUDE.md`: skip those files (report "kept existing"), still create a starter model if none. `--force` overwrites the pointer files.
- `isServerRunning`: malformed/partial `.jscad-studio` → treat as not running (start fresh). `process.kill` `EPERM` → running; `ESRCH` → not.
- `stop` with stale `.jscad-studio` (dead pid): remove the file, report "cleaned up stale server record".
- The detached server's stdout/stderr go to `/tmp/jscad-work.log` (per the bootstrap command) — not the agent's transcript.

## Testing (Vitest)
- **`isServerRunning(cwd)`** — temp dir with `.jscad-studio` pointing at `process.pid` (alive) → true; at an unused pid (e.g. a reaped child) → false; missing file → false; malformed JSON → false.
- **`scaffoldWorkspace(cwd, model)`** (`init`) — empty dir → writes `AGENTS.md`, `CLAUDE.md` (`@file AGENTS.md`), and a starter `model.js`; AGENTS.md contains the `nohup jscad-work` line and the "read JSCAD.md" step; re-running keeps existing AGENTS.md/CLAUDE.md (no clobber) and does not duplicate a model; `--force` overwrites pointers.
- **`stopServer(cwd)`** — `.jscad-studio` with a live throwaway child pid → kills it + removes the file; dead pid → removes file, reports stale; missing → no-op.
- The bootstrap-instruction prose and the end-to-end agent launch are verified by a manual `claude` and `opencode` run (documented in the plan), not unit tests.

## Documentation
- Update `README.md` "Operating instructions": lead with the single-command flow (`jscad-work init` once, then `claude`/`opencode`), keep the explicit two-terminal flow as an alternative, document `jscad-work stop` and the persistent-server behavior.

## Scope & deferred
- **IN:** `jscad-work init`, `stop`, the idempotent guard, AGENTS.md/CLAUDE.md scaffolding, the testable workspace module, README update.
- **DEFERRED:** auto-stopping the server on agent-session end (we accept a persistent server + `stop`); a daemon/health endpoint; per-workspace server reuse across different model dirs.

## Success criteria
- In a fresh workspace: `jscad-work init` then `claude` → the agent starts the server in the background and is ready, with no second terminal and no typed startup prompt.
- Running `jscad-work <model>` while a server is live prints "already running" and does not start a second.
- `jscad-work stop` tears the server down; a subsequent `claude` cleanly starts a new one.
- The same flow works under OpenCode via `AGENTS.md`.
- Unit tests for guard/init/stop pass; full suite green; `lefthook run pre-commit` clean; `npm run knip` clean.
