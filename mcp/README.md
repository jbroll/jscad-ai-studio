# jscad-studio MCP Plugin

MCP plugin for headless JSCAD model evaluation, measurement, export, geometry checking, and rendering. Register it by placing the repo's `.mcp.json` in your project or user MCP config — Claude Code picks it up automatically.

All tools accept a `modelPath` (relative to cwd or absolute). Five tools (`eval`, `params`, `measure`, `export`, `check`) are offline pure-Node and need no browser. `render` requires Chromium (via Playwright).

## Tools

### `eval`

Run a model headlessly; report errors, geometry type, and entity count.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `modelPath` | string | yes | Path to the model `.js` file |
| `params` | `Record<string, number>` | no | Parameter name → value overrides |

**Result**

```jsonc
// success
{ "ok": true, "geomType": "geom3", "entityCount": 1 }

// failure
{ "ok": false, "geomType": "unknown", "error": "ReferenceError: x is not defined", "line": 42 }
```

`geomType` is one of `"geom2"`, `"geom3"`, `"array"`, or `"unknown"` (on error).
`entityCount` is omitted on error.

---

### `params`

List a model's declared parameters.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `modelPath` | string | yes | Path to the model `.js` file |

**Result**

```jsonc
{
  "ok": true,
  "geomType": "geom3",
  "params": [
    { "name": "size", "type": "slider", "default": 10, "min": 5, "max": 20, "step": 1, "label": "Size" }
  ]
}
```

Each param object always has `name` and `type`; `default`, `min`, `max`, `step`, `label` are present when the model declares them (otherwise `undefined`). Hidden parameters are excluded.

---

### `measure`

Measure bounding box, dimensions, center, volume/area, and polygon count.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `modelPath` | string | yes | Path to the model `.js` file |
| `params` | `Record<string, number>` | no | Parameter overrides |

**Result**

```jsonc
{
  "ok": true,
  "geomType": "geom3",
  "measure": {
    "boundingBox": [[-5, -5, 0], [5, 5, 10]],
    "dimensions": [10, 10, 10],
    "center": [0, 0, 5],
    "volume": 1000,
    "polygonCount": 12
  }
}
```

For `geom3`: `volume` and `polygonCount` (triangle/polygon count).
For `geom2`: `area` and `polygonCount` (outline count) instead of `volume`.

---

### `export`

Export the model to STL, 3MF, OBJ, or SVG; return base64-encoded file data.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `modelPath` | string | yes | Path to the model `.js` file |
| `params` | `Record<string, number>` | no | Parameter overrides |
| `format` | `"stl" \| "3mf" \| "obj" \| "svg"` | no | Output format (default: `"stl"`) |

Format constraints: `stl`, `3mf`, `obj` require `geom3`; `svg` requires `geom2`.

**Result**

```jsonc
{
  "ok": true,
  "geomType": "geom3",
  "export": {
    "base64": "<base64-encoded file bytes>",
    "bytes": 16384,
    "triangleCount": 226,
    "mime": "model/stl"
  }
}
```

---

### `check`

Run manifold, watertight, empty, and bed-fit checks on the geometry.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `modelPath` | string | yes | Path to the model `.js` file |
| `params` | `Record<string, number>` | no | Parameter overrides |
| `bed` | `[number, number, number]` | no | Printer bed dimensions `[x, y, z]` in model units |

**Result**

```jsonc
{
  "ok": true,
  "geomType": "geom3",
  "check": {
    "empty": false,
    "manifold": true,
    "watertight": true,
    "openEdges": 0,
    "fitsBed": true,
    "bbox": [[-5, -5, 0], [5, 5, 10]],
    "dimensions": [10, 10, 10],
    "notes": ["wall-thickness analysis not implemented (deferred)"]
  }
}
```

`fitsBed` is always `true` when `bed` is omitted. Check only fully supports `geom3`; for `geom2` or `array`, `empty: true`, `manifold: false`, `watertight: false` are returned with a note. Note: `manifold` is currently derived from the watertight edge-count check and does not detect non-manifold vertices (two surfaces touching at a point); full manifold and wall-thickness analysis is deferred.

---

### `render`

Render the model to a PNG using the local headless viewer.

Requires Chromium. Set `JSCAD_CHROMIUM` env var to override the executable path.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `modelPath` | string | yes | Path to the model `.js`/`.scad` file |
| `size` | `[number, number]` | no | Viewport `[width, height]` in pixels (default: `[800, 600]`) |
| `view` | string | no | Camera preset: `front`/`back`/`top`/`bottom`/`left`/`right`/`iso` (default: viewer default) |
| `params` | object | no | Parameter overrides applied before the snapshot (requires the deployed `window.jscadStudio` hook) |

**Result**

```jsonc
{ "path": "/tmp/jscad-my-model.js-800x600.png", "width": 800, "height": 600, "view": "iso", "params": { "size": 18 } }
```

`path` is the absolute path to the saved PNG on disk. `view`/`params` echo back only when provided.

---

### `parts`

List the sibling part files of a multi-file model and their exported names — for discovering what an assembly composes.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `modelPath` | string | yes | Path to a model `.js`/`.scad` file |

**Result**

```jsonc
{ "parts": [{ "file": "bearing.js", "exports": ["create", "BEARING_608"], "hasMain": true }] }
```

---

### `live_params`

Push parameter overrides into the **user's open browser tab** (served by a running `jscad-work` session) so the model updates live in front of them.

Requires an active `jscad-work` session — the tool reads `.jscad-studio` in the current directory for the server port and POSTs to its SSE bridge.

**Inputs**

| Field | Type | Required | Description |
|---|---|---|---|
| `params` | object | yes | Parameter name → value overrides |

**Result**

```jsonc
{ "ok": true, "clients": 1 }
```

`clients` is the number of connected viewer tabs that received the update.

---

## Model languages

All tools accept both `.js` (jscad-fluent) and `.scad` (OpenSCAD) model paths.

### OpenSCAD (`.scad`) support

`.scad` files are transpiled and evaluated on the [Manifold](https://github.com/elalish/manifold) backend, and the resulting solid is converted to a jscad-fluent `geom3`. This happens transparently — `eval`, `measure`, `export`, `check`, and `render` all work identically on `.scad` paths.

**Composing parts**: any model (`.js` or `.scad`) can `require` a `.scad` file:

```js
// part.scad is an OpenSCAD file
const scadPart = require('./part.scad');   // returns a FluentGeom3

// Mix with jscad-fluent geometry
const jf = require('@jbroll/jscad-fluent');
const main = () => jf.union(scadPart, jf.cube({ size: 10, center: true }));
module.exports = { main };
```

**Parameters**: OpenSCAD customizer parameter override is not yet supported. `params` returns `[]` for `.scad` files. Parameter overrides passed to `eval`/`measure`/`export`/`check` are silently ignored.

**Error handling**: unsupported `.scad` files return a structured error `{ ok: false, error: "<message>", line: 0 }`. The `line` field is always `0` for `.scad` (OpenSCAD transpiler does not expose source line numbers). Approximately 90% of the OpenSCAD corpus transpiles successfully.

**Headless vs. browser**: `eval`, `measure`, `export`, and `check` are offline pure-Node — no browser needed. `render` requires Chromium and the local viewer server, same as for `.js` models.

---

## Model-Author Constraints

These apply to all JSCAD model files evaluated by this plugin:

- **Angles**: always radians — use `Math.PI` (e.g. `Math.PI / 2` for 90°)
- **Colors**: 0–1 range, not 0–255 (e.g. `[0.3, 0.6, 0.8]`)
- **Booleans**: all inputs must be the same geometry type (all `geom2` or all `geom3`)
- **Immutability**: all operations return new objects; originals are not modified

## Error Handling

When a model throws during evaluation, all tools return `{ ok: false, error: "<message>", line: <number>, geomType: "unknown" }`. The `line` field is `0` when a line number cannot be determined from the stack trace. Evaluation that exceeds 10 seconds returns `{ ok: false, error: "timeout", geomType: "unknown" }`.
