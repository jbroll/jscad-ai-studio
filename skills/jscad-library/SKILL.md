---
name: jscad-library
description: Search and reuse the curated jscadui model library (bearings, gears, motors, hardware, technique demos) from the jscad-studio MCP. Use when the user wants to find an existing part, reuse a model, or look up how to model something. Triggers on library, find a part, reuse, bearing, gear, screw, motor, example, "how do I model".
compatibility: claude-code, opencode
---

# Using the jscad model library

The `jscad-studio` MCP exposes a curated, eval-verified catalog of ~820 models from the jscadui libraries (mcad, nopscadlib, bosl2, snippets, native jscad).

## Find a part or technique
- `library_search({ query, tags?, source?, lang?, runnableOnly? })` — search by capability/part/technique (e.g. `"608 bearing"`, `"involute gear"`, `"rounded box"`). Pass `runnableOnly: true` to get only models that currently evaluate. `source` filters by library (`mcad`, `nopscadlib`, `bosl2`, `snippet`, `text`, `jscad`); `lang` is `scad` or `js`.
- `library_get({ id })` — fetch the full catalog entry (dimensions, tags, techniques) plus the model's source code.

## Reuse a model (transparent OpenSCAD/JSCAD parts)
Any model — `.scad` or `.js` — can be `require`d straight into your model and composed with jscad-fluent:
```js
const jf = require("@jbroll/jscad-fluent");
const bearing = require("<path from library_get>"); // returns a composable geometry
return jf.cuboid({ size: [40, 40, 10] }).subtract(bearing);
```
Use a model's source (from `library_get`) as a **technique reference** when you don't want to import it wholesale.

## Preview
Run the `render` tool with the entry's `path` as the `modelPath` argument to get a PNG of any catalog model. The `render` tool resolves `modelPath` relative to the process cwd, so pass an absolute path or a path relative to the jscadui repo root (e.g. prefix the entry's `path` with the jscadui repo root, such as `/home/user/src/jscadui/` + entry.path).
