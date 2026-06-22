# jscad-ai-studio

AI-assisted 3D modeling with [jscad-fluent](https://github.com/jbroll/jscad-fluent).

## Installation

```bash
git clone https://github.com/jbroll/jscad-ai-studio
cd jscad-ai-studio
npm install && npm link
```

## Usage

Run two terminals from your model directory:

**Terminal 1** - Start the server:
```bash
jscad-work my-model.js
```

**Terminal 2** - Start Claude Code:
```bash
claude
```

Then give Claude this prompt:
```
Read ./JSCAD.md and complete the startup actions.
```

### What jscad-work does

1. Starts a local HTTP server (ephemeral port)
2. Proxies the jscadui viewer from jscad.rkroll.com
3. Serves your model files locally
4. Creates `JSCAD.md` with viewer URL and startup instructions

Claude reads `JSCAD.md`, fetches the API reference, reads your model, and navigates the browser to the viewer via Chrome DevTools MCP.

## With Claude

Configure Chrome DevTools MCP in `~/.claude.json`:

```json
"chrome-devtools": {
  "type": "stdio",
  "command": "npx",
  "args": ["chrome-devtools-mcp@latest", "--executablePath=/usr/bin/chromium"]
}
```

Claude reads `.jscad-studio` to get the viewer URL and uses MCP to interact with the browser.

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
| `measure` | Bounding box, dimensions, volume/area, polygon count |
| `export` | Export to STL / 3MF / OBJ / SVG (base64) |
| `check` | Manifold, watertight, empty, and bed-fit checks |
| `render` | PNG screenshot from the headless viewer (needs Chromium) |

`eval`, `params`, `measure`, `export`, `check` are offline pure-Node — no server needed. `render` starts a local viewer server and a Chromium instance.

See [`mcp/README.md`](mcp/README.md) for full input and result-shape documentation.

## Model library (MCP)

The repo includes a curated catalog of ~820 models from the jscadui libraries (mcad, nopscadlib, bosl2, snippets, native jscad), searchable via two MCP tools.

**Generate the catalog** (incremental — skips already-described entries). The description backend is chosen from the environment, in this precedence:

```bash
# 1. Ollama on a local/remote GPU host (no API key, no subscription usage):
OLLAMA_HOST=http://gpu:11434 OLLAMA_MODEL=qwen2.5-coder node scripts/build-catalog.js

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
