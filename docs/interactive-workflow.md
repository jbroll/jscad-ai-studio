# Interactive workflow

A user and an agent work on the same model files through two surfaces, both served by one local viewer server:

- **The browser tab**: the jscad.rkroll.com viewer app, served locally, for orbiting, scrubbing parameter sliders, and visual review.
- **The `jscad-work` model subcommands**: the agent runs them through its shell to evaluate, measure, check, render, and export without a browser.

`jscad-work live-params` connects the two: the agent pushes parameter values into the user's open tab.

## Starting a session

Single command: run `jscad-work init my-bracket.js` once in the model directory, then start `claude` or `opencode`. The agent reads `AGENTS.md` and starts `jscad-work my-bracket.js` in the background. If its permissions deny that, it asks you to run the command in another terminal and keeps working with the model subcommands, which need no server.

Two terminals: run `jscad-work my-bracket.js` yourself, open the printed viewer URL, and start the agent with *"Read ./JSCAD.md and complete the startup actions."*

Either way the server writes `JSCAD.md` (rules and the viewer URL, rewritten on every start), creates `NOTES.md` once for targets and decisions, and writes `.jscad-studio` so `jscad-work live-params` can find it. [user-manual.md](user-manual.md#the-server) has the details.

Nothing else persists. To resume after a reboot or a closed terminal, start again. The port changes, and `JSCAD.md` and `.jscad-studio` are rewritten with it. Your model files and `NOTES.md` carry the work.

## Inner loop: the agent's shell

| Subcommand | Use |
|---|---|
| `jscad-work eval <model>` | Does the edit run? Exit 1 and the error line if not |
| `jscad-work params <model>` | Declared parameters |
| `jscad-work measure <model>` | Bounding box, dimensions, volume or area, polygon count |
| `jscad-work check <model> --bed X,Y,Z` | Empty, watertight, open edges, bed fit |
| `jscad-work render <model> --view all` | One PNG per camera preset; the agent Reads each |
| `jscad-work export <model> -o part.stl` | STL, 3MF, OBJ, or SVG file |
| `jscad-work parts <model>` | Sibling part files and their exports |
| `jscad-work library search` / `library get` | Existing catalog models |
| `jscad-work live-params JSON` | Push parameter values into the open tab |

Typical cadence: edit the model, `eval`, then `measure` against the stated target. Before calling a change done: `check` with the printer bed, then `render --view all` and inspect every view. `JSCAD.md` states this as the definition of done.

In Claude Code, `jscad-work init` adds the allow rule `Bash(jscad-work *)` to `.claude/settings.json`, so these calls run without permission prompts once you trust the workspace. OpenCode allows bash commands by default.

## Outer loop: the browser tab

- Orbit, pan, and zoom.
- Scrub parameter sliders. `live: true` parameters re-run as you drag.
- Editing a served `*.js` or `*.scad` file reloads the tab within about 150 ms with the camera kept.

### live-params

`jscad-work live-params '{"size":33}'` posts to the server named in `.jscad-studio`, which sends the values over server-sent events to the bridge injected into each open tab, which calls `window.jscadStudio.setParams`. The tab re-runs the model. The agent can show "the bracket at 33 mm" in your view, or sweep a parameter to show a tradeoff.

### Letting the agent drive the browser

Optional. With Chrome DevTools MCP configured in `~/.claude.json`, Claude can navigate, reload, and screenshot the tab:

```json
"chrome-devtools": {
  "type": "stdio",
  "command": "npx",
  "args": ["chrome-devtools-mcp@latest", "--executablePath=/usr/bin/chromium"]
}
```

`jscad-work render` and `live-params` work without it.

## Composing models

- **Multi-file assemblies**: a model can `require('./part.js')` across a local dependency graph.
- **OpenSCAD parts**: `require('./part.scad')` returns geometry like a `.js` part, and every subcommand works on `.scad` models directly.
- **Multi-part scenes**: a `main` that returns an array renders each item with its own transform and color. `measure`, `export`, and `check` aggregate across items.

## A representative session

1. `jscad-work init motor-mount.js`, then `claude`. The agent starts the server; you open the viewer URL.
2. The agent runs `jscad-work library search nema 17` for a reference and reads its dimensions.
3. It edits `motor-mount.js`; `jscad-work eval motor-mount.js` exits 1 on a typo, and it fixes it.
4. `jscad-work measure` confirms the bolt-circle spacing; `jscad-work check --bed 220,220,250` confirms it fits.
5. `jscad-work render motor-mount.js --view all -p '{"wall":4}'` previews a thicker wall in seven PNGs.
6. `jscad-work live-params '{"wall":4}'` shows the change in your tab; you orbit and agree.
7. `jscad-work export motor-mount.js -o motor-mount.stl`.
