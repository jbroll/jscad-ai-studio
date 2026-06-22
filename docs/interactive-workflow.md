# Interactive Development Workflow

How a user and Claude actually develop a CAD model with jscad-studio. This describes the **real, verified** loop — every tool and path below is implemented and tested end-to-end.

## The shape of the system

Two surfaces operate on **the same files**, served by one local **viewer-server**:

- **The browser** — a human-facing viewer (jscad.rkroll.com's app, served locally) for orbiting, scrubbing parameter sliders, and visual review.
- **The headless MCP** — the `jscad-studio` tools Claude calls directly (no browser): eval, measure, check, render, export, parts, library search, and live parameter injection.

These are not separate worlds. The viewer-server serves your working directory's model files to both, and Claude can drive the *human's open browser tab* via `live_params`.

## Starting a session

From a directory containing (or about to contain) a model:

```
jscad-work my-bracket.js
```

This:
1. Starts the local **viewer-server** on a random port. It serves the current directory's files; for the app shell it proxies `jscad.rkroll.com` and **injects a small SSE bridge** so live parameter injection works.
2. Writes **`JSCAD.md`** — Claude's context file (viewer URL, startup actions, the API reference link, key constraints).
3. Writes **`.jscad-studio`** — `{ serverPort, pid, currentModel, viewerUrl }`, so the MCP `live_params` tool can find this session.
4. Prints the viewer URL and a one-line Claude startup prompt.

Open the printed URL in a browser, and start Claude with: *"Read ./JSCAD.md and complete the startup actions."*

## The two loops

### Inner loop — headless (Claude, fast, no browser reload)

Claude iterates here for everything mechanical. The `jscad-studio` MCP tools:

| Tool | What it does |
|---|---|
| `eval` | Run the model headlessly; report errors, geometry type, entity count. Fastest way to catch a broken edit. |
| `params` | List the model's declared parameters. |
| `measure` | Bounding box, dimensions, volume/area, polygon count. Arrays (multi-part scenes) aggregate across items. |
| `check` | Manifold / watertight / empty / print-bed-fit — printability. |
| `render` | Offscreen PNG. `view` camera presets (`front`/`back`/`top`/`bottom`/`left`/`right`/`iso`) and `params` overrides. |
| `export` | STL / 3MF / OBJ / SVG (base64). |
| `parts` | List a multi-file project's sibling part files and their exports. |
| `library_search` / `library_get` | Find and pull a curated jscadui library model by keyword/tag. |
| `live_params` | Push parameter overrides into the **user's open browser tab** (see below). |

Typical cadence: edit the model file → `eval` (does it run?) → `measure`/`check` (is it the right size, is it printable?) → `render` (what does it look like from `iso`/`front`?). No browser reload needed for any of this.

### Outer loop — browser (the human)

The open viewer tab is for what the headless loop can't give you: real-time spatial judgment.

- **Orbit / pan / zoom** to inspect.
- **Scrub parameter sliders** — declared `live: true` params re-render as you drag.
- **Auto-reload** — editing a served `*.js`/`*.scad` file reloads the tab automatically (camera preserved, within ~150 ms), so file edits appear without any action. A manual reload (`chrome-devtools` `navigate_page` with `type:"reload"`, or a refresh) is only needed if the tab disconnected from the server.

### Where they meet — `live_params`

The new capability: Claude pushes parameters into the human's *already-open* tab. `live_params({ size: 33 })` →  POST to this session's viewer-server → SSE → the injected bridge → `window.jscadStudio.setParams` → the tab re-renders. The human watches the model change without touching a slider. Verified end-to-end: an open tab's `size` went `10 → 33` from a single `live_params` call.

This makes review collaborative: Claude can say "here's the bracket at 33mm" and *show* it in the human's viewport, or sweep a parameter to demonstrate a tradeoff.

## Composing models

- **Multi-file assemblies:** a model can `require('./part.js')` across a whole local dependency graph — the recursive CJS loader handles it regardless of ambient `type:module`.
- **OpenSCAD parts:** `require('./part.scad')` returns geometry just like a `.js` part; OpenSCAD and jscad-fluent compose transparently. Every tool (`eval`/`measure`/`render`/`check`/`export`) works on `.scad` models directly.
- **Multi-part scenes:** returning an array from `main()` renders each item separately (its own transform/color) — never unioned. `measure`/`export`/`check` aggregate across the items.

## A representative session

1. `jscad-work motor-mount.js`; open the viewer; start Claude on `JSCAD.md`.
2. Claude reads the model, `library_search`es for a NEMA-17 reference, pulls dimensions.
3. Claude edits `motor-mount.js`; `eval` catches a typo; fixes it.
4. `measure` confirms the bolt-circle diameter; `check` confirms it's watertight and fits the bed.
5. `render({ view: "iso" })` for a quick look; `render({ params: { wall: 4 } })` to preview a thicker wall.
6. Claude `live_params({ wall: 4 })` so the human sees the change in their open tab; they orbit, agree.
7. `export` an STL.

The headless loop keeps iteration fast; the browser (and `live_params`) is where human spatial judgment enters.
