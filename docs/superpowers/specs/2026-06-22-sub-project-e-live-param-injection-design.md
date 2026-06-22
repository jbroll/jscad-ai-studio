# Sub-project E — Live Parameter Injection — Design

**Date:** 2026-06-22
**Status:** Approved (design). Follows A (core MCP engine), B (OpenSCAD parts), C (model catalog), D (assembly/multi-file), all shipped.
**Parent:** `2026-06-21-jscad-ai-cad-system-design.md`. Originated as the deferred D.4 `params` item.

## Summary

Let parameters be set into the jscadui viewer from outside the page — both in the AI's **headless** `render` (to screenshot a model at specific param values) and **live** in the user's already-open browser tab (the AI nudges what the user is watching). Both build on one foundation: a `window.jscadStudio.setParams` hook exposed by the jscadui app. The live path adds a server→browser relay through the plugin's viewer-server.

## Background (verified)

- The viewer's parameter system is module-internal: `paramsCtrl.setParam(path, value)` updates a param; `runModelUpdate(deps)` re-runs `workerApi.jscadMain(paramsCtrl.getWorkerParams())` and re-renders (`apps/jscad-web/src/paramsUI.js`). A user slider drag goes through `handleTreeParamChange` → `setParam` → scheduled `runModelUpdate`. There is **no external (window/URL/postMessage) surface** today (confirmed in D.4).
- The plugin's `viewer-server.js` serves local model files but **proxies `/` and unknown paths to `jscad.rkroll.com`** — the deployed jscadui app. So the `window.jscadStudio` hook must live in jscadui and be deployed; the live-relay bridge can be injected into the proxied HTML by the viewer-server.
- `jscad-work` writes `.jscad-studio` (in cwd) recording `serverPort` and `pid` — so a live tool can discover the running server.
- jscad.rkroll.com is built+deployed from `apps/jscad-web` (`build.js`).

## Decisions (from brainstorming)

- **Target:** both headless render and the user's live tab (shared `setParams` foundation).
- **Hook mechanism:** `window.jscadStudio` in jscadui `main.js` (durable API), built + deployed to jscad.rkroll.com. (Not DOM-driven; not a local-build serve.)
- **Live transport:** SSE (server→browser, one-way is all that's needed) + a normal HTTP POST (MCP→server). Bridge script injected into the proxied HTML by the viewer-server.
- **Workflow documentation** (the second deliverable) is done **after** E ships, as a separate exploratory effort — not part of E's plan.

## Architecture

```
jscadui apps/jscad-web/main.js (modify)   expose window.jscadStudio = { setParams, getParams, ready }
jscadui apps/jscad-web/ (build + deploy)  publish the hook to jscad.rkroll.com

mcp/lib/viewer-server.js (modify)  inject bridge <script> into proxied "/" HTML;
                                   GET /__studio/events (SSE); POST /__studio/params (broadcast);
                                   startViewerServer returns { ..., broadcastParams }
mcp/lib/render.js (modify)         `params` option -> page.evaluate(setParams) -> await re-render -> PNG
mcp/lib/live-params.js             liveParams(params, {cwd}) -> read .jscad-studio -> POST /__studio/params
mcp/lib/tools.js, mcp/server.js (modify)  register `live_params` tool
```

### E.1 Foundation — `window.jscadStudio` + headless render params

**jscadui `apps/jscad-web/main.js`** — after the app boots and the `runModelUpdate` deps (`workerApi`, `handleEntities`, `setError`, `stopCurrentAnim`) and `paramsCtrl` are available, install:
```
window.jscadStudio = {
  ready: true,
  getParams: () => paramsCtrl.getState().params,
  setParams: async (obj) => {
    for (const [path, value] of Object.entries(obj)) paramsCtrl.setParam(path, value)
    await runModelUpdate(deps)   // awaits the model re-run + entity handling
    // also refresh the param tree inputs so the UI reflects injected values
    return paramsCtrl.getState().params
  },
}
```
`setParams` resolves only after `runModelUpdate` completes (it already awaits `workerApi.jscadMain`), so a caller knows the new geometry is rendered. Unknown param paths are ignored by `setParam` (no throw). The param tree UI is updated so injected values show on sliders.

**plugin `render.js`** — add an optional `params` object. After the existing canvas settle, if `params` is set: `await page.evaluate(p => window.jscadStudio.setParams(p), params)`, then re-use the settle wait, then screenshot. The returned metadata includes `params` when set. If `window.jscadStudio` is absent (un-deployed viewer), throw a clear error rather than silently screenshotting defaults.

**jscadui deploy** — build `apps/jscad-web` and deploy to jscad.rkroll.com so the proxied viewer exposes the hook. This is a required, explicit step; nothing in E.1/E.2 works until it is live.

### E.2 Live relay — into the user's open tab

**plugin `viewer-server.js`**:
- A module-level `Set` of SSE client responses. `GET /__studio/events`: write SSE headers (`text/event-stream`, `no-cache`, keep-alive), add `res` to the set, remove on `close`.
- `POST /__studio/params`: read the JSON body `{ params }`, write `data: <json>\n\n` to every SSE client, respond `{ ok: true, clients: N }`.
- Injection: when proxying `/`, buffer the upstream HTML (don't pipe) and insert a bridge `<script>` before `</body>`:
  ```
  <script>
    const es = new EventSource('/__studio/events');
    es.onmessage = (e) => { try { const d = JSON.parse(e.data); window.jscadStudio?.setParams(d.params); } catch {} };
  </script>
  ```
  Non-`/` upstream proxying is unchanged (piped).
- `startViewerServer` additionally returns `broadcastParams(obj)` for in-process callers.

**plugin `mcp/lib/live-params.js`** — `liveParams(params, { cwd = process.cwd() })`: read `.jscad-studio` from `cwd`; if absent, throw `no running jscad-work server (.jscad-studio not found) — run jscad-work first`. POST `{ params }` to `http://127.0.0.1:<serverPort>/__studio/params`; return `{ ok, clients }`. Surface a clear error if the server is unreachable (stale `.jscad-studio`).

**plugin MCP tool `live_params({ params })`** — registered in `server.js`/`tools.js`; calls `liveParams(params)` and wraps the result. Tool description states it requires a running `jscad-work` session with the viewer open.

## Error handling
- `render` with `params` but no `window.jscadStudio`: throw `viewer does not expose jscadStudio (deploy the jscadui hook)`.
- `live_params` with no `.jscad-studio` or unreachable server: throw the actionable message above.
- Malformed SSE/JSON on the bridge side: swallowed in the browser (`try/catch`), never breaks the viewer.
- `setParams` with unknown paths: ignored (matches `paramsCtrl.setParam` behavior); known paths still applied.

## Testing
- **SSE relay (server-level, ungated):** start `viewer-server`, connect a raw `EventSource`/HTTP client to `/__studio/events`, `POST /__studio/params`, assert the client receives the broadcast JSON and the POST response reports `clients: 1`. Assert the bridge `<script>` is present in the `/` HTML (mock or stub the upstream HTML for the injection unit).
- **`live-params` unit:** with a temp `.jscad-studio` pointing at a stub HTTP server, assert `liveParams` POSTs the right body; with no `.jscad-studio`, assert the clear throw.
- **Headless render params (browser-gated `JSCAD_RENDER_TEST`):** render a slider model with `params` overriding the slider → non-empty PNG; (optionally) `getParams` reflects the set value.
- **jscadui `window.jscadStudio` (in the jscadui repo, jsdom/unit):** `setParams` calls `setParam` per entry and triggers one `runModelUpdate`; `getParams` returns current values.

## Scope & deferred
- **IN:** `window.jscadStudio` hook + deploy; `render` `params`; viewer-server SSE bridge + endpoints; `live_params` tool.
- **DEFERRED:** two-way browser→AI events (e.g. notifying the AI when the user changes a param); param injection for `.scad` OpenSCAD parameters in the viewer (jscad-fluent `p.*` params only for now); persisting injected params back to the model file.
- **SEPARATE (after E):** the interactive-workflow documentation deliverable.

## Success criteria
- After the jscadui deploy, `render({ modelPath, params })` produces a PNG that visibly reflects the overridden params.
- With `jscad-work` running and the viewer open, the `live_params` MCP tool changes the model in the user's tab live (geometry updates, sliders reflect new values).
- SSE relay + `live-params` unit tests pass ungated; render-with-params passes under `JSCAD_RENDER_TEST`; full suite green; `lefthook run pre-commit` clean; `npm run knip` clean.
