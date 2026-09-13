# User manual

`jscad-work` is one command with three jobs: it sets up a workspace, runs the viewer server, and runs the model tools (`eval`, `measure`, `check`, `render`, `export`, `parts`, `library`, `live-params`). Install it with `npm link` in the clone or through the Claude Code plugin; see [install.md](install.md).

## Workspace and server

| Command | Effect |
|---|---|
| `jscad-work init [model.js] [--force]` | Writes `AGENTS.md`, `CLAUDE.md`, `JSCAD.md`, `NOTES.md`, a starter model, and the `jscad-work` allow rule in `.claude/settings.json` |
| `jscad-work <model.js>` | Starts the viewer server for a model in the current directory, creating the model from a template if it does not exist |
| `jscad-work stop` | Stops the server named in `.jscad-studio` |
| `jscad-work plugin-root` | Prints the repository directory; the Claude Code marketplace entry runs it |
| `jscad-work` | Prints usage and the `.js` models in the current directory |

A model name without `.js` gets `.js` added, except the tool subcommand names below.

### `init`

- Keeps an existing `AGENTS.md` and `CLAUDE.md`; `--force` regenerates them. `NOTES.md` is never overwritten.
- Writes `JSCAD.md` without a viewer URL unless a server is already running.
- Adds `Bash(jscad-work *)` to `permissions.allow` in `.claude/settings.json`, creating the file if needed. Other keys and rules are kept, and the rule is never added twice. Init stops with an error, and leaves the file alone, if it is not valid JSON or `permissions.allow` is not an array.

Claude Code applies allow rules from a project's `.claude/settings.json` only after you accept the workspace trust dialog for that folder. Plugins cannot pre-allow Bash commands, which is why init writes the rule.

### The server

`jscad-work <model.js>` runs in the foreground until Ctrl+C or `jscad-work stop`. Each start:

1. Starts an HTTP server on a random port. It serves the directory's files, proxies the viewer app from jscad.rkroll.com, and injects a bridge for live parameters and reload.
2. Rewrites `JSCAD.md` with the viewer URL and creates `NOTES.md` if missing.
3. Writes `.jscad-studio`: `{ workspace, currentModel, serverPort, pid, viewerUrl }`.
4. Prints the viewer URL.

If `.jscad-studio` names a live pid, it reuses that server and exits. Editing a served `*.js` or `*.scad` file reloads open tabs within about 150 ms.

## Model tools

Every tool subcommand:

- prints one line of JSON on stdout,
- prints errors on stderr as `error: <message>`,
- exits 0 on success, 1 on a model or runtime error (with the result JSON still on stdout when there is one), and 2 on a usage error (with a usage line),
- prints its usage and options with `--help`.

Model paths are relative to the current directory or absolute, `.js` (jscad-fluent) or `.scad` (OpenSCAD).

Common options:

| Option | Meaning |
|---|---|
| `-p, --params JSON` | Parameter overrides as a JSON object. Values may be any JSON type. Nested parameters use dotted names: `-p '{"motor.stackHeight":30}'` |
| `-t, --timeout MS` | Evaluation timeout, default 10000. For `render`, the time the viewer gets to load and run the model, default 60000 |

A model that runs longer than the timeout fails with `eval timeout: model ran longer than 10000 ms; raise it with --timeout MS`.

A failed evaluation prints `{ "ok": false, "geomType": "unknown", "error": "<message>", "line": <n> }` and exits 1. `line` is `0` when the stack trace has no line in the model file, and always `0` for `.scad`.

### `eval`

```
jscad-work eval <model> [-p JSON] [-t MS]
```

Runs the model and reports its geometry type and entity count.

```json
{"ok":true,"geomType":"geom3","entityCount":1}
```

`geomType` is `geom2`, `geom3`, `array` (a multi-part scene), or `unknown` on error.

### `params`

```
jscad-work params <model> [-t MS]
```

Lists declared parameters. Hidden parameters (names starting with `_`) are left out.

```json
{"ok":true,"geomType":"geom3","params":[{"name":"size","type":"slider","default":10,"min":5,"max":20,"step":1,"label":"Size"}]}
```

`name` and `type` are always present; `default`, `min`, `max`, `step`, and `label` when declared. `.scad` models return `[]`.

### `measure`

```
jscad-work measure <model> [-p JSON] [-t MS]
```

```json
{"ok":true,"geomType":"geom3","measure":{"boundingBox":[[-5,-5,0],[5,5,10]],"dimensions":[10,10,10],"center":[0,0,5],"volume":1000,"polygonCount":12}}
```

geom3 gives `volume` and `polygonCount`; geom2 gives `area` and the outline count as `polygonCount`. Arrays aggregate across items.

### `check`

```
jscad-work check <model> [--bed X,Y,Z] [-p JSON] [-t MS]
```

`--bed` is the printer bed in mm, as `220,220,250` or `220x220x250`.

```json
{"ok":true,"geomType":"geom3","check":{"empty":false,"manifold":true,"watertight":true,"openEdges":0,"fitsBed":true,"bbox":[[-5,-5,0],[5,5,10]],"dimensions":[10,10,10],"notes":["wall-thickness analysis not implemented (deferred)"]}}
```

- `fitsBed` is `true` when `--bed` is omitted.
- Only geom3 is fully checked. geom2 and arrays return `empty: true`, `manifold: false`, `watertight: false` with a note.
- `manifold` is the watertight edge count and does not detect non-manifold vertices. The edge count treats T-junctions as open edges, and boolean results usually contain them, so a plate with a subtracted hole typically reports `watertight: false`. Compare `openEdges` between runs rather than requiring zero.

### `export`

```
jscad-work export <model> [-o FILE] [-f FORMAT] [-p JSON] [-t MS]
```

Writes the model to a file and prints its path. The format comes from `-f`, else the `-o` extension, else `stl`. Without `-o` the file is `<model name>.<format>` in the current directory. Missing directories are created.

| Format | Geometry |
|---|---|
| `stl` (binary), `3mf`, `obj` | geom3 or array |
| `svg` | geom2 |

```json
{"ok":true,"geomType":"geom3","export":{"path":"/work/cube.stl","bytes":684,"triangleCount":12,"mime":"model/stl"}}
```

### `render`

```
jscad-work render <model> [--view V[,V...]|all] [-o FILE] [--size WxH] [-p JSON] [-t MS]
```

Loads the model once in headless Chromium through a local viewer server and writes one PNG per view.

| Option | Meaning |
|---|---|
| `--view` | Comma list of `front`, `back`, `left`, `right`, `top`, `bottom`, `iso`, or `all`. Default `iso` |
| `-o, --output FILE` | PNG path. With several views, `-<view>` goes before `.png`: `-o shots/arm.png --view top,iso` writes `shots/arm-top.png` and `shots/arm-iso.png`. Default `.jscad-work/<model>-<view>.png` in the current directory |
| `--size WxH` | Viewport and PNG size in pixels, default `800x600` |
| `-p, --params JSON` | Applied in the viewer before the screenshots |

```json
{"ok":true,"width":800,"height":600,"renders":[{"view":"iso","path":"/work/.jscad-work/arm.js-iso.png"}]}
```

- Render waits until the viewer has drawn the model. A model that throws in the viewer exits 1 with `model error in viewer: <message>`, and a model that does not finish within `--timeout` exits 1 with `render timeout: ...`.
- Needs Chromium through Playwright; set `JSCAD_CHROMIUM` to use a system Chromium. Needs network access to jscad.rkroll.com, which serves the viewer app.
- `-p` needs the deployed viewer's `window.jscadStudio` hook.

### `parts`

```
jscad-work parts <model>
```

Lists the `.js` and `.scad` files in the model's directory and their exported names.

```json
{"parts":[{"file":"bearing.js","exports":["create","BEARING_608"],"hasMain":true}]}
```

### `library search`

```
jscad-work library search [QUERY...] [--tags A,B] [--source S] [--lang scad|js] [--runnable] [--limit N]
```

Searches `catalog/catalog.json` (about 500 models from the jscadui libraries). Query words match whole words in the name (weighted highest), tags, techniques, id, and description. Without a query, the filters alone select entries.

| Option | Meaning |
|---|---|
| `--tags A,B` | Entries carrying every tag |
| `--source S` | `mcad`, `nopscadlib`, `bosl2`, `snippet`, `text`, or `jscad` |
| `--lang L` | `scad` or `js` |
| `--runnable` | Only entries that evaluated headlessly |
| `--limit N` | Maximum results, default 20 |

```json
{"results":[{"id":"bosl2/009-ball_bearings-ball_bearing","name":"...","source":"bosl2","lang":"scad","tags":["bearing"],"runs":true,"dimensions":[22,22,7],"description":"..."}]}
```

### `library get`

```
jscad-work library get <id> [--with-source]
```

Prints the full catalog entry (dimensions, tags, techniques, `runs`, `polygonCount`) and `path`, the absolute path of the model file, or `null` when the file is not on disk. `--with-source` adds the file's text as `source`. An unknown id exits 1.

```json
{"entry":{"id":"bosl2/009-ball_bearings-ball_bearing","...":"..."},"path":"/home/you/src/jscadui/apps/jscad-web/examples/openscad/bosl2/01-part1/009-ball_bearings-ball_bearing.scad"}
```

`require` that path from a model to reuse the part.

### `live-params`

```
jscad-work live-params JSON
```

Pushes parameter values into every viewer tab open on the running server, which re-runs the model. Reads the port from `.jscad-studio` in the current directory, so it needs a running `jscad-work <model.js>`.

```json
{"ok":true,"clients":1}
```

`clients` is the number of tabs that received the values.

## Model languages

`.scad` files are transpiled and evaluated on the Manifold backend and converted to a jscad-fluent geom3, so every tool works on them. Any model can `require('./part.scad')` and combine the result with jscad-fluent geometry. About 90% of the OpenSCAD corpus transpiles.

`.scad` models take no parameter overrides: `params` returns `[]`, and `-p` is ignored without an error.

Models written for jscad-fluent follow its rules: angles in radians, colors in 0-1, boolean inputs all 2D or all 3D, operations return new objects. The full rule set the agent works from is the `JSCAD.md` template, `jscadMd` in `mcp/lib/workspace.js`.

## Maintenance scripts

### Catalog

`node scripts/build-catalog.js [--force]` describes catalog entries and writes `catalog/catalog.json`. It skips entries already described; `--force` redoes all. The entry set follows the jscadui libraries' `skip.txt` and `exclude.txt`. The description backend is chosen in this order:

| Environment | Backend |
|---|---|
| `OLLAMA_HOST` set (with `OLLAMA_MODEL`) | Ollama |
| `ANTHROPIC_API_KEY` set | Anthropic API |
| neither | the logged-in `claude` CLI |

### Session analysis

`node scripts/analyze-sessions.js [--all] [--stdout] [--llm]` reads OpenCode sessions in `~/.local/share/opencode/storage/` and Claude Code sessions in `~/.claude/projects/**/*.jsonl` without modifying them, flags where the agent struggled (tool and eval errors, retries, compactions, bootstrap misses, hazard hits), and groups findings by the prompt to improve (`AGENTS.md`, `JSCAD.md`, the jscad-fluent `llm.txt`, or a skill). `jscad-work` tool subcommands run through Bash count the same as the MCP tool calls in older transcripts.

| Option | Effect |
|---|---|
| `--all` | Every session, not only jscad-work sessions |
| `--stdout` | Print instead of writing `docs/session-analysis/<date>-friction.md` |
| `--llm` | Add an Ollama pass that suggests prompt edits; needs `OLLAMA_HOST`, otherwise heuristics only |

## MCP server (deprecated)

`mcp/server.js` serves the same tools over MCP stdio for one more release; see [`mcp/README.md`](../mcp/README.md).
