# Live-Reload on File Change — Design

**Date:** 2026-06-22
**Status:** Approved (design).
**Context:** Edits made by an agent (OpenCode/Claude) or the user to model files served by `jscad-work` are not reflected in the browser viewer until a manual reload — the viewer's built-in `onFilesChange` reload is tied to the File System Access/drag-drop path, not the HTTP-served `jscad-work` flow. Push a reload to the connected tab when a served file changes.

## Summary

The plugin's viewer-server watches the directory it serves and, on a model-file change, broadcasts a reload over the **existing E SSE channel** (`/__studio/events`). The injected bridge script calls `location.reload()`. Because the viewer persists camera + view settings in `localStorage` (`camera.location`, restored into `OrbitControl` on boot — `viewState.js`/`main.js`), the angle/zoom are preserved; only the re-fetched, edited model re-runs. Entirely plugin-side — no jscadui change or deploy.

## Background (verified)

- `viewer-server.js` already serves local files + proxies the viewer HTML from upstream, injecting a bridge `<script>` that opens `EventSource('/__studio/events')`; `POST /__studio/params` broadcasts to SSE clients (sub-project E).
- The jscadui viewer's auto-reload (`main.js:162` `onFilesChange → reloadProject`) fires from the `fileSystem` layer (File System Access handles / drag-drop), **not** for files fetched over HTTP from our viewer-server — so server-side edits go unnoticed by the tab.
- The viewer saves the camera to `localStorage` (`camera.location`) and restores it on boot (`OrbitControl` is constructed with `viewState.camera`). A full `location.reload()` therefore preserves the view.
- The bridge currently handles only `{ params }` messages; it can branch on a `{ reload: true }` message.

## Decisions (from brainstorming)

- **Mechanism:** server-side `fs.watch` on the served dir → broadcast `{ reload: true }` over the existing SSE → bridge calls `location.reload()`.
- **No in-place re-run / no jscadui deploy:** `location.reload()` is sufficient because the camera is persisted; the simpler, deploy-free path wins.
- **Debounce** editor write-bursts (~150 ms) into a single reload.
- **Watch scope:** `*.js` and `*.scad` only; ignore `.jscad-studio`, `JSCAD.md`, and dotfiles so the watcher never self-triggers.

## Architecture

```
mcp/lib/viewer-server.js (modify)
  ├─ BRIDGE script: add a `reload` branch → location.reload()
  ├─ shouldReload(filename) → bool  (pure: true for *.js/*.scad, false for .jscad-studio/JSCAD.md/dotfiles/null)
  ├─ start an fs.watch(dir, {recursive:true}) watcher in startViewerServer
  │    on a qualifying change → debounce(150ms) → broadcast `data: {"reload":true}\n\n` to sseClients
  └─ tear the watcher down on server `close`
```

### Watcher
`startViewerServer(directory)` starts `fs.watch(directory, { recursive: true }, (event, filename) => { if (shouldReload(filename)) scheduleReload(); })`.
- `shouldReload(filename)`: `filename && (filename.endsWith(".js") || filename.endsWith(".scad")) && !basename starts with "." && basename not in {".jscad-studio","JSCAD.md"}`. (`.jscad-studio` already starts with `.`; `JSCAD.md` is `.md` so excluded by extension anyway — the guard is explicit for clarity.) If `filename` is `null` (some platforms omit it), treat conservatively as **not** reload (avoid spurious reloads); recursive watch on Linux/Node 22 provides the filename.
- `scheduleReload()`: a single shared debounce timer (clear + reset on each event, fire after 150 ms) → `broadcastReload()`.
- `broadcastReload()`: write `data: ${JSON.stringify({ reload: true })}\n\n` to every SSE client (reuse the existing `sseClients` set).
- Lifecycle: keep the watcher handle; `server.on("close", () => watcher.close())`. fs.watch errors are caught and logged (a failed watcher must not crash the server — serving still works, just no auto-reload).

### Bridge
Extend the injected `BRIDGE` script's `onmessage`:
```js
const d = JSON.parse(e.data);
if (d.reload) { location.reload(); return; }
if (window.jscadStudio && d.params) window.jscadStudio.setParams(d.params);
```
(still wrapped in try/catch; reload takes precedence over params).

## Error handling
- `fs.watch` throwing at startup (e.g. unsupported recursive on some FS): catch, log a warning, continue serving without auto-reload — never block server start.
- `filename === null`: no reload (conservative).
- Rapid bursts: debounce coalesces to one reload.
- No connected tabs: `broadcastReload` iterates an empty set — no-op.
- A reload event and a params event can't conflict (reload short-circuits in the bridge).

## Testing (Vitest, server-level)
- **`shouldReload`** (pure): `"model.js"`→true, `"part.scad"`→true, `".jscad-studio"`→false, `"JSCAD.md"`→false, `".hidden.js"`→false, `null`→false.
- **Watch → SSE broadcast:** start `viewer-server` on a temp dir, connect a raw SSE client to `/__studio/events`, write/modify a `*.js` file in the dir, assert a `{"reload":true}` frame arrives (within a generous timeout). Modify `.jscad-studio` and assert **no** reload frame arrives in a short window.
- **Debounce:** several rapid writes produce a single reload frame (assert exactly one within the window).
- **Browser e2e (Playwright, gated like the other render tests):** load the viewer with a model, edit the served file, assert the page reloads (e.g. a sentinel `window.__loadCount` set on each load increments, or `page.waitForNavigation`). Optional if the env lacks Chromium — server-level tests are the gate.

## Documentation
- Note in `README.md` (Operating instructions / "The two loops") and the `jscad-work` `JSCAD.md` template that edits to served `*.js`/`*.scad` files auto-reload the open tab (camera preserved) — no manual reload needed.

## Scope & deferred
- **IN:** dir watcher + debounce + `{reload:true}` broadcast in viewer-server; bridge reload branch; tests; docs note.
- **DEFERRED:** in-place re-run that preserves full UI state without a page reload (would need a `window.jscadStudio.reload()` jscadui hook + deploy); watching files outside the served dir; HMR-style partial updates.

## Success criteria
- Editing a served `*.js`/`*.scad` file causes the connected viewer tab to reload and show the new geometry within ~150 ms, with the camera preserved.
- Touching `.jscad-studio`/`JSCAD.md` does not trigger a reload.
- A failed/duplicate watcher never breaks plain file serving or `live_params`.
- Server-level tests pass ungated; full suite green; `lefthook run pre-commit` + `npm run knip` clean.
