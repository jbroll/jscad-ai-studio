---
name: jscad-library
description: Search and reuse the jscad-studio model catalog (bearings, gears, motors, fasteners, BOSL2 and NopSCADlib parts) with library_search and library_get. Use in jscad work when a standard part or modeling technique may already exist.
---

# jscad model library

The `jscad-studio` MCP server has a catalog of 496 models from the jscadui
libraries (`mcad`, `nopscadlib`, `bosl2`, `snippet`, `text`, `jscad`). Each
entry records whether it evaluated headlessly (`runs`), its bounding-box
`dimensions`, and its `polygonCount`.

## Find

- `library_search({ query, tags?, source?, lang?, runnableOnly?, limit? })`
  matches whole words in the name, tags, techniques, id and description, so
  search `bearing`, not `bearings`. Pass `runnableOnly: true` when you plan to
  `require` the result. `lang` is `scad` or `js`.
- `library_get({ id })` returns `{ entry, path, source }`. `path` is the
  absolute path of the model file and `source` is its text. Both are `null` when
  the file is not on disk.

## Reuse

`require` the `path` from `library_get` exactly as returned:

```js
// library_get({ id: 'bosl2/009-ball_bearings-ball_bearing' }).path
const BEARING_608_MODEL = require('/home/you/src/jscadui/apps/jscad-web/examples/openscad/bosl2/01-part1/009-ball_bearings-ball_bearing.scad');
```

- A `.scad` file returns one geom3, rendered with the file's own defaults. The
  608 above measures 22 x 22 x 7 mm, centered on the origin. Place it with
  `translate`/`rotate`.
- A `.js` file returns its exports. Call its `main` or factory with a child
  params proxy: `lib.main(p.gear)`.
- Before relying on an entry, `measure({ modelPath: path })` and
  `render({ modelPath: path, view: 'iso' })` it.

## When not to reuse

- **You need a size the file does not produce.** `.scad` files take no
  parameter overrides, and overrides passed to `eval`/`measure` on a `.scad`
  path are ignored without an error. Model the part in jscad-fluent from named
  dimensions (the `jscad-modeling` skill has sourced tables) and read the
  catalog source only for technique.
- **The entry is a demo scene.** Many entries lay out several parts, labels, or
  anchor arrows. Compare `dimensions` with the part you expect: `mcad/stepper_test`
  is 552 x 285 x 197 mm, not one motor. Pick another entry or copy the module you
  need.
- **The shape must be cut into your part.** A catalog body has no clearance.
  Model the pocket, bore, or mounting pattern from named dimensions and a named
  fit clearance, and use the catalog body only to show the fit.
- **`runs` is `false`.** `failureClass` and `error` say why.
- **`polygonCount` is high.** The 608 above has 35,544 polygons. Using it as a
  boolean input is slow and can hit the 10 s `eval` timeout. Return it as a
  separate item in the model's array instead.

## Reading BOSL2 sources

178 entries are BOSL2 examples, and 160 of them run. For what their modules and
arguments do, read [bosl2-reference.md](bosl2-reference.md).
