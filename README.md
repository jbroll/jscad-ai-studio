# jscad-ai-studio

AI-assisted 3D modeling with [jscad-fluent](https://github.com/jbroll/jscad-fluent).

## Installation

```bash
git clone https://github.com/jbroll/jscad-ai-studio
cd jscad-ai-studio
npm install && npm link
```

## Operating instructions

### Starting work (single command)

One-time per workspace, scaffold the agent pointer + a starter model:
```bash
jscad-work init my-model.js
```
Then just start your agent — no second terminal, no typed prompt:
```bash
claude        # or: opencode
```
`init` writes `AGENTS.md` (the startup pointer, auto-loaded by Claude Code and OpenCode) and `CLAUDE.md` (`@file AGENTS.md`). On startup the agent reads it, starts the `jscad-work` server **in the background** if one isn't already running, then reads `JSCAD.md` and begins. The server persists across sessions; stop it with:
```bash
jscad-work stop
```

### Starting work (explicit two terminals)

If you prefer to run the server yourself, run two terminals from the directory that holds (or will hold) your model:

**Terminal 1** — start the work server (creates the model from a template if it doesn't exist):
```bash
jscad-work my-model.js
```

**Terminal 2** — start Claude Code and give it the startup prompt:
```bash
claude
```
```
Read ./JSCAD.md and complete the startup actions.
```

Open the viewer URL that `jscad-work` prints in a browser. You now have both loops running (see below).

**What `jscad-work` does each run** (it is stateless — safe to re-run any time):
1. Starts a local HTTP server on an ephemeral port — serves your model files, proxies the viewer app from jscad.rkroll.com, and injects the live-parameter bridge.
2. Writes **`JSCAD.md`** — Claude's context (viewer URL, startup actions, API reference link, key constraints). Always overwritten.
3. Writes **`.jscad-studio`** — `{ serverPort, pid, currentModel, viewerUrl }`, which the `live_params` MCP tool uses to reach your open tab.
4. Prints the viewer URL and the Claude startup prompt.

### Resuming work

There is no persistent session to reattach to — the durable state is your **model files** (and the committed model library). To resume after closing a terminal, a reboot, or switching models, just start again:

```bash
jscad-work my-model.js     # fresh server + regenerated JSCAD.md / .jscad-studio
claude                     # → "Read ./JSCAD.md and complete the startup actions."
```

- The server port changes each run; `JSCAD.md` and `.jscad-studio` are rewritten with the current values, so Claude always reads the right viewer URL.
- If `jscad-work` is **still running** and you only restarted Claude, the same prompt resumes — `JSCAD.md` already points at the live server.
- Switch models by running `jscad-work other-model.js` (updates the current model + viewer URL).
- With the single-command flow, just re-run `claude`/`opencode`: the agent reuses a live server (idempotent) or starts a fresh one. Use `jscad-work stop` to tear the server down.

### The two loops

The browser tab and the headless MCP tools operate on the **same files** via the one work server:

- **Browser (interactive)** — orbit/pan/zoom, scrub parameter sliders, reload to pick up file edits.
- **Headless MCP (Claude's inner loop)** — `eval` / `measure` / `check` / `render` / `export` / `parts` / `library_search` — fast iteration with no browser reload.
- **Bridge** — `live_params` pushes parameter overrides into your **open** tab so Claude and you share one live view.

Full details and a representative session: [`docs/interactive-workflow.md`](docs/interactive-workflow.md).

### Browser control (optional)

To let Claude drive the browser tab directly (navigate, screenshot, reload), configure Chrome DevTools MCP in `~/.claude.json`:

```json
"chrome-devtools": {
  "type": "stdio",
  "command": "npx",
  "args": ["chrome-devtools-mcp@latest", "--executablePath=/usr/bin/chromium"]
}
```

This is optional — the headless MCP loop (including `render` PNGs and `live_params`) works without it.

## Example Session

```
╭─── Claude Code v2.1.1 ───────────────────────────────────────────────────────────────────────────╮
│                                                    │ Tips for getting started                    │
│                 Welcome back john!                 │ Run /init to create a CLAUDE.md file with … │
│                                                    │ ─────────────────────────────────────────── │
│                       ▐▛███▜▌                      │ Recent activity                             │
│                      ▝▜█████▛▘                     │ No recent activity                          │
│                        ▘▘ ▝▝                       │                                             │
│                                                    │                                             │
│     Opus 4.5 · Claude Max · john@rkroll.com's      │                                             │
│     Organization                                   │                                             │
│      ~/src/jscad-ai-studio/examples/motor-fun      │                                             │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯

❯ Read ./JSCAD.md and complete the startup actions.

● Read(JSCAD.md)
  ⎿  Read 23 lines

● Fetch(https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt)
  ⎿  Received 8.8KB (200 OK)

● Read(vecto-arm-pivot.js)
  ⎿  Read 138 lines

● chrome-devtools - navigate_page (MCP)(type: "url", url:
                                       "http://127.0.0.1:35705/#vecto-arm-pivot.js")
  ⎿  # navigate_page response
     Successfully navigated to http://127.0.0.1:35705/#vecto-arm-pivot.js.
     ## Pages
     1: http://127.0.0.1:35705/#vecto-arm-pivot.js [selected]

● Startup complete. Here's the current state:

  Current model: vecto-arm-pivot.js - A rotating platform assembly with:
  - NEMA 17 motor on a platform with adjustable shelf height
  - Pivot stud with dual 6002 bearings and spacer
  - Three 608 bearing/tyre assemblies for truss contact
  - Capstan driven by the motor
  - Arm assembly with parallel dowels

  Key components imported from modules:
  - nema17.js, bearing.js, tyre-608.js
  - vecto-truss-clip.js, capstan.js, arm.js
  - motor-platform.js, pivot-stud.js, layout.js

  Browser is now showing the viewer at http://127.0.0.1:35705/#vecto-arm-pivot.js

  API reference loaded - jscad-fluent with chainable operations, radians for angles, 0-1 color range.

  Ready to help with edits. Changes to model files are served immediately; I'll reload the browser after edits.

────────────────────────────────────────────────────────────────────────────────────────────────────
❯ take a screenshot                                                                          ↵ send
────────────────────────────────────────────────────────────────────────────────────────────────────
  ? for shortcuts
```

## Headless loop (MCP)

The repo ships a `.mcp.json` that registers the `jscad-studio` MCP plugin. When Claude Code loads the plugin, it can evaluate, measure, and render models without a browser open.

Install (once):

```bash
git clone https://github.com/jbroll/jscad-ai-studio
cd jscad-ai-studio
npm install && npm link
```

Claude Code picks up `.mcp.json` automatically. Then Claude can call these tools on any `.js` (jscad-fluent) or `.scad` (OpenSCAD) model file — both are first-class:

| Tool | Purpose |
|---|---|
| `eval` | Run the model; report errors, geometry type, entity count |
| `params` | List declared parameters |
| `measure` | Bounding box, dimensions, volume/area, polygon count (arrays aggregate) |
| `export` | Export to STL / 3MF / OBJ / SVG (base64) |
| `check` | Manifold, watertight, empty, and bed-fit checks |
| `render` | PNG screenshot from the headless viewer — `view` camera presets + `params` overrides (needs Chromium) |
| `parts` | List a multi-file project's sibling part files and their exports |
| `live_params` | Push parameter overrides into the user's open browser tab (needs a running `jscad-work` session) |

`eval`, `params`, `measure`, `export`, `check`, `parts` are offline pure-Node — no server needed. `render` starts a local viewer server and a Chromium instance. `live_params` posts to the running `jscad-work` server (found via `.jscad-studio`).

Multi-file assemblies (`require('./part.js')`) and OpenSCAD parts (`require('./part.scad')`) compose transparently; a model returning an array renders each item separately.

See [`mcp/README.md`](mcp/README.md) for full input and result-shape documentation.

## Model library (MCP)

The repo includes a curated catalog of ~500 models from the jscadui libraries (mcad, nopscadlib, bosl2, snippets, native jscad), searchable via two MCP tools. The set mirrors the libraries' own `skip.txt`/`exclude.txt`, so structural/library files are excluded.

**Generate the catalog** (incremental — skips already-described entries). The description backend is chosen from the environment, in this precedence:

```bash
# 1. Ollama on a local/remote GPU host (no API key, no subscription usage):
OLLAMA_HOST=http://gpu:11434 OLLAMA_MODEL=qwen2.5-coder:14b-16k node scripts/build-catalog.js

# 2. Anthropic API (if you have a key):
ANTHROPIC_API_KEY=… node scripts/build-catalog.js

# 3. Default — the logged-in `claude` CLI (Pro/Max subscription auth, no API key):
node scripts/build-catalog.js
```

Selection: `OLLAMA_HOST` set → Ollama; else `ANTHROPIC_API_KEY` set → Anthropic API; else the `claude` CLI. Add `--force` to re-describe all entries from scratch. The catalog is committed to `catalog/catalog.json`.

**Search and retrieve** via the `jscad-studio` MCP tools:

| Tool | Purpose |
|---|---|
| `library_search` | Keyword/tag search — returns matching entries with id, name, tags, source, lang |
| `library_get` | Fetch a full entry by id — includes dimensions, tags, techniques, and source code |

**Client setup:**

- **Claude Code** — `.mcp.json` in the repo root registers the MCP server automatically.
- **OpenCode** — add the server to `opencode.json`; see [`docs/opencode-setup.md`](docs/opencode-setup.md).

The `jscad-library` skill (`skills/jscad-library/SKILL.md`) teaches Claude how to search → retrieve → reuse or reference catalog models.

## Documentation

- **jscad-fluent API**: https://github.com/jbroll/jscad-fluent
- **MCP plugin**: [`mcp/README.md`](mcp/README.md)
- **OpenCode setup**: [`docs/opencode-setup.md`](docs/opencode-setup.md)

## License

[MIT](LICENSE)
