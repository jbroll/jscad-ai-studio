---
name: jscad-library
description: Search and reuse the jscad model catalog (bearings, gears, motors, fasteners, BOSL2 and NopSCADlib parts) with jscad-work library search and library get. Use in jscad work when a standard part or modeling technique may already exist.
---

# jscad model library

`jscad-work library` searches a catalog of 496 models from the jscadui
libraries (`mcad`, `nopscadlib`, `bosl2`, `snippet`, `text`, `jscad`). Each
entry records whether it evaluated headlessly (`runs`), its bounding-box
`dimensions`, and its `polygonCount`.

## Find

- `jscad-work library search QUERY [--tags A,B] [--source S] [--lang scad|js]`
  matches words in the name, tags, techniques, id and description. Plurals and
  common synonyms match (`screws` finds `bolt`). Results only include entries
  that run; `--include-broken` adds the rest.
- `--max-size 30` or `--min-size 20,20,` filters on `dimensions` in mm, per
  axis with an empty axis for no bound. `--parametric` keeps entries that take
  parameter overrides.
- `jscad-work library get ID` prints `{ entry, path }`. `path` is the absolute
  path of the model file, `null` when the file is not on disk. Read the file at
  `path`, or add `--with-source` to get its text as `source`.

## Reuse

`require` the `path` from `library get` exactly as printed:

```js
// jscad-work library get bosl2/009-ball_bearings-ball_bearing -> path
const BEARING_608_MODEL = require('/home/you/src/jscadui/apps/jscad-web/examples/openscad/bosl2/01-part1/009-ball_bearings-ball_bearing.scad');
```

- A `.scad` file returns one geom3, rendered with the file's own defaults. The
  608 above measures 22 x 22 x 7 mm, centered on the origin. Place it with
  `translate`/`rotate`.
- A `.js` file returns its exports. Call its `main` or factory with a child
  params proxy: `lib.main(p.gear)`.
- Before relying on an entry, run `jscad-work measure PATH` and
  `jscad-work render PATH --view iso`, then Read the PNG.

## When not to reuse

- **You need a size the file does not produce.** `.scad` files take no
  parameter overrides, and `-p` overrides on a `.scad` path are ignored without
  an error. Model the part in jscad-fluent from named dimensions (the
  `jscad-modeling` skill has sourced tables) and read the catalog source only
  for technique.
- **The entry is a demo scene.** Many entries lay out several parts, labels, or
  anchor arrows. Compare `dimensions` with the part you expect: `mcad/stepper_test`
  is 552 x 285 x 197 mm, not one motor. Pick another entry or copy the module you
  need.
- **The shape must be cut into your part.** A catalog body has no clearance.
  Model the pocket, bore, or mounting pattern from named dimensions and a named
  fit clearance, and use the catalog body only to show the fit.
- **`runs` is `false`.** `failureClass` and `error` say why.
- **`polygonCount` is high.** The 608 above has 35,544 polygons. Using it as a
  boolean input is slow and can hit the 10 s eval timeout (`--timeout MS`
  raises it). Return it as a separate item in the model's array instead.

## Reading BOSL2 sources

178 entries are BOSL2 examples, and 160 of them run. For what their modules and
arguments do, read [bosl2-reference.md](bosl2-reference.md).
