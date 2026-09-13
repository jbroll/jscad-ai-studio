# User manual

`jscad-work` is one command with three jobs: it sets up a workspace, runs the viewer server, and runs the model tools (`eval`, `measure`, `check`, `dfm`, `interference`, `verify-spec`, `render`, `export`, `parts`, `compare`, `library`, `live-params`). Install it with `npm link` in the clone or through the Claude Code plugin; see [install.md](install.md).

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
jscad-work measure <model> [--parts | --part N[-M]...] [--between A,B] [--section AXIS[,OFFSET]] [-p JSON] [-t MS]
```

```json
{"ok":true,"geomType":"geom3","measure":{"boundingBox":[[-5,-5,0],[5,5,10]],"dimensions":[10,10,10],"center":[0,0,5],"volume":1000,"polygonCount":12}}
```

geom3 gives `volume` and `polygonCount`; geom2 gives `area` and the outline count as `polygonCount`. Arrays aggregate across items.

#### Parts

A part is an item of the array `main` returns, selected by its index as `check` numbers it in `items`. Models and the viewer carry no part names, so the selectors are:

| Selector | Items |
|---|---|
| `N` | Item `N`, counting from 0. A model that returns one geometry has only item `0` |
| `N-M` | Items `N` to `M`, measured together as one group. Use it for a sub-assembly the model spreads over consecutive items |

An item that is itself an array is measured as a group. A selector past the last item exits 1 with `part 12 is out of range; the model has 9 items (0-8)`. To measure a part file on its own, run `measure` on that file.

| Option | Adds |
|---|---|
| `--parts` | `parts`: one entry per item |
| `--part N[-M]` | `parts`: one entry per selector, in order. Repeatable; not combined with `--parts` |
| `--between A,B` | `between`: how the axis-aligned bounding boxes of two selectors relate |

Each `parts` entry has `part` (the selector) and the fields above for that item or group. `between` has:

| Field | Meaning |
|---|---|
| `gap` | Per axis, the space between the two boxes in mm. Negative is how far their extents overlap along that axis |
| `boxesOverlap` | Every `gap` is negative, so the boxes intersect. The solids may still not touch |
| `distance` | Shortest distance between the boxes, 0 when they touch or overlap |
| `centerOffset` | Center of `B` minus center of `A` |
| `axes` | Symmetry axes of the 3D solids in `A` and `B`: `a` and `b` are unit vectors or `null`, `angle` is the angle between them in degrees (0 to 90), and `offset` the shortest distance between the two axis lines in mm, both `null` unless both axes exist |

`gap` and `centerOffset` are rounded to 0.000001 mm, so faces that touch give a gap of 0 rather than boolean noise.

An axis is found from the solids' second moments of volume. A solid of revolution, a regular prism, or a stack of them on one axis (a bearing's races and seals selected as a range) has two equal moments, and its axis is the third direction. A cube or sphere (three equal moments) and a plain box (three distinct ones) give `null`. A long bar gets its length axis and a square plate its normal. A cylinder about as long as 1.7 times its radius has three nearly equal moments and gives `null`. Features that break the symmetry move the result: the D-flat on a NEMA 17 shaft and the key in its capstan give `offset` 0.044 mm. Use `axes` to check that a shaft, pin, or bearing is coaxial with its bore part; holes inside a larger part are not detected.

```json
{"ok":true,"geomType":"array","measure":{"...":"...","entityCount":35,"between":{"a":"1","b":"26-29","gap":[-23.5,-23.5,-8.9],"boxesOverlap":true,"distance":0,"centerOffset":[0,0,4.6],"axes":{"a":[0,0,1],"b":[0,0,1],"angle":0,"offset":0}}}}
```

#### Section

`--section AXIS[,OFFSET]` adds `section`, the cross-section of the solids at the plane `AXIS = OFFSET` (`x`, `y`, or `z`, in mm). Without `OFFSET` the plane passes through the bounding-box center. `boundingBox` and `dimensions` cover the cut outline, with 0 along `AXIS`; `area` is the cut area with holes subtracted, summed over array items. A plane exactly on a face counts that face as above the plane. An offset outside the model's range exits 1.

```json
{"ok":true,"geomType":"array","measure":{"...":"...","section":{"axis":"z","offset":3.5,"boundingBox":[[-11,-11,3.5],[11,11,3.5]],"dimensions":[22,22,0],"area":140.47}}}
```

### `check`

```
jscad-work check <model> [--bed X,Y,Z] [-p JSON] [-t MS]
```

`--bed` is the printer bed in mm, as `220,220,250` or `220x220x250`.

`fitsBed` is `true` when `--bed` is omitted. The other fields depend on the geometry type.

#### geom3

```json
{"ok":true,"geomType":"geom3","check":{"empty":false,"watertight":true,"manifold":true,"openEdges":0,"nonManifoldEdges":0,"nonManifoldVertices":0,"consistentNormals":true,"selfIntersecting":false,"intersectingPairs":0,"intersectionSamples":[],"fitsBed":true,"bbox":[[-5,-5,-5],[5,5,5]],"dimensions":[10,10,10],"notes":["wall thickness and overhangs: run jscad-work dfm"]}}
```

| Field | Meaning |
|---|---|
| `openEdges` | Edges used by one face. Holes in the surface |
| `nonManifoldEdges` | Edges used by more than two faces, as when two solids share only an edge |
| `nonManifoldVertices` | Vertices where the faces form more than one fan, as when two solids share only a corner |
| `watertight` | `openEdges` is 0 |
| `manifold` | `nonManifoldEdges` and `nonManifoldVertices` are 0. An open surface can be manifold, so a printable solid needs `watertight` and `manifold` both `true` |
| `consistentNormals` | Every shared edge is walked in opposite directions by its two faces, and a closed mesh has positive volume (not inside out) |
| `selfIntersecting` | Some pair of faces crosses, as when two solids are joined into one geom3 without a boolean, or a face folds through another |
| `intersectingPairs` | Number of crossing triangle pairs |
| `intersectionSamples` | Up to 5 points, rounded to 0.001 mm, on the crossings |

Vertices within 0.00001 mm are merged, and a vertex lying on another face's edge splits that edge before counting. Boolean results leave such T-junctions, so without the split a plate with a subtracted hole would show open edges. An empty geom3 gives `empty: true` with `watertight`, `manifold`, `consistentNormals`, and `selfIntersecting` `null`.

For self-intersection, faces are split into triangles and every pair whose bounding boxes touch is tested. Triangles that share a vertex are skipped, so a fold whose crossing faces share a corner is not found. Faces that only touch, including coincident faces pointing opposite ways, do not count; coplanar faces pointing the same way count when they overlap. The test adds about 0.4 s on the 35,544-triangle 608 bearing from the catalog and 0.35 s across the 35 items of `examples/motor-fun/vecto-arm-pivot.js`.

#### geom2

```json
{"ok":true,"geomType":"geom2","check":{"empty":false,"closed":true,"outlines":1,"watertight":null,"manifold":null,"fitsBed":true,"bbox":[[-15,-15,0],[15,15,0]],"dimensions":[30,30,0],"notes":["watertight and manifold apply to 3D solids; closed covers 2D outlines"]}}
```

`closed` is `true` when every outline is a closed loop; `outlines` is their count, or `null` when not closed. `watertight` and `manifold` are `null` because they do not apply.

#### Arrays

```json
{"ok":true,"geomType":"array","check":{"empty":false,"watertight":true,"manifold":true,"openEdges":0,"fitsBed":true,"bbox":[[-2.5,-2.5,-2.5],[12.5,2.5,2.5]],"dimensions":[15,5,5],"entityCount":2,"items":[{"index":0,"geomType":"geom3","empty":false,"watertight":true,"...":"..."},{"index":1,"geomType":"geom3","...":"..."}],"notes":["wall thickness and overhangs: run jscad-work dfm"]}}
```

`items` holds each item's own result, as above, plus `index` and `geomType`. `watertight` and `manifold` are `true` when every item that reports a boolean is `true`, `false` when any is `false`, and `null` when no item reports one (only geom2 items). `selfIntersecting` is `true` when any item's is. Items overlapping each other are not self-intersection; `interference` reports those.

### `dfm`

```
jscad-work dfm <model> [--wall MM] [--overhang DEG] [--up AXIS] [-p JSON] [-t MS]
```

Finds walls too thin and overhangs too steep to print without support, with the thresholds from `skills/jscad-modeling/references/fits-and-fdm.md`.

| Option | Meaning |
|---|---|
| `--wall MM` | Walls thinner than this are thin. Default 0.8, two perimeters of a 0.4 mm nozzle |
| `--overhang DEG` | Downward faces more than this many degrees from vertical overhang, 0 to 90. Default 45 |
| `--up AXIS` | Build direction: `+z` (default), `-z`, `+x`, `-x`, `+y`, or `-y`, to try another print orientation without editing the model |

```json
{"ok":true,"geomType":"geom3","dfm":{"up":"+z","wallThreshold":0.8,"overhangLimit":45,"empty":false,"minWall":5,"minWallAt":[5.833,-0.417,20],"thinArea":0,"thinRegions":[],"overhangArea":200,"maxOverhangAngle":90,"overhangRegions":[{"area":100,"maxAngle":90,"boundingBox":[[5,-10,20],[15,0,20]]},{"area":100,"maxAngle":90,"boundingBox":[[-15,-10,20],[-5,0,20]]}]}}
```

| Field | Meaning |
|---|---|
| `minWall` | Thinnest wall found in mm, or `null` when no ray found one |
| `minWallAt` | Where that reading was taken, rounded to 0.001 mm |
| `thinArea` | Surface area in mm² whose wall is thinner than `--wall` |
| `thinRegions` | Up to 5 groups of thin faces joined through shared vertices, thinnest first, each with `minWall`, `area`, and `boundingBox` |
| `overhangArea` | Area in mm² of faces past `--overhang` that are not on the build plate |
| `maxOverhangAngle` | Steepest downward face off the plate, in degrees from vertical: 0 for none, 90 for a flat ceiling |
| `overhangRegions` | Up to 5 groups of overhanging faces, largest first, each with `area`, `maxAngle`, and `boundingBox` |

Wall thickness is sampled, not proven. From points on each face (one per face, up to 64 on faces with edges longer than 2 mm), a ray goes inward along the face normal to the first face it leaves the solid through. A hit on a face that shares a vertex with the sampled one is ignored, since that distance measures the edge's angle. Faces one row back from a sharp edge still read thin, so a feathered rim or a knife edge shows as a small thin region: the tyres in `examples/motor-fun/vecto-arm-pivot.js` read 0.084 mm at their rims. A thin feature narrower than the sample spacing, or one only thin diagonally, can be missed.

A face is on the plate when all its corners are within 0.01 mm of the model's lowest point along `--up`. A 45° chamfer at the default limit does not overhang. Bridges are not told apart from overhangs, so a flat ceiling between two supports counts in full.

For an array, each item is analyzed on its own, with its own plate at its lowest point, and `items` holds each item's result with `index`. The top level gives the smallest `minWall` and its `minWallAt`, the summed `thinArea` and `overhangArea`, and the largest `maxOverhangAngle`, without regions. geom2 items are skipped.

The analysis takes about 0.6 s on the 35,544-triangle 608 bearing from the catalog and 1 s across the 35 items of `vecto-arm-pivot.js`, after evaluation. `openEdges` is the sum, `fitsBed` uses the combined bounding box, and `empty` is `true` when every item is empty.

### `interference`

```
jscad-work interference <model> [--tolerance MM] [--allow A,B]... [-p JSON] [-t MS]
```

Finds array items whose solids overlap. Items are numbered as in [Parts](#parts); an item that is itself an array is one group. Pairs whose bounding boxes do not overlap by more than the tolerance on every axis are skipped without a boolean. For the rest, each solid of one item is intersected with each solid of the other.

| Option | Meaning |
|---|---|
| `--tolerance MM` | Overlaps with `depth` at or below this are not reported, so touching faces and faceting noise pass. Default 0.01 |
| `--allow A,B` | An intended overlap, such as a press fit or a part nested in another, between two item selectors (`N` or `N-M`). A pair matches when one item is in `A` and the other in `B`, in either order. Repeatable |

```json
{"ok":true,"geomType":"array","interference":{"tolerance":0.01,"itemCount":6,"pairsChecked":3,"interferences":[{"a":"0","b":"1","volume":12.641853,"depth":0.097576,"boundingBox":[[-4.1,-4.1,0],[4.1,4.1,5]],"dimensions":[8.2,8.2,5]},{"a":"0","b":"3","volume":48,"depth":1.2,"boundingBox":[[-10,-10,2],[-6,-6,5]],"dimensions":[4,4,3]}],"allowed":[]}}
```

| Field | Meaning |
|---|---|
| `pairsChecked` | Item pairs whose boxes overlapped, so their solids were intersected |
| `interferences` | Overlapping pairs not covered by `--allow`, in index order |
| `allowed` | Overlapping pairs covered by `--allow`, with `allow` naming the matching selectors |
| `volume` | Overlap volume in mm³ |
| `depth` | Overlap thickness estimated as 2 × volume / surface area. Exact for a thin overlap, such as a pin 0.1 mm oversize in its hole (0.098 from a faceted cylinder) or a part sunk 0.1 mm into a face. Low for a chunky overlap: a 4 × 4 × 3 block gives 1.2, and a cube of side s gives s/3 |
| `boundingBox`, `dimensions` | Box around the overlap, showing where it is |
| `notSolid` | Items with no 3D solid, which are skipped. Present only when there are some |

Values are rounded to 0.000001. The command exits 0 whatever it finds; `verify-spec` fails on unallowed overlaps. A selector in `--allow` past the last item exits 1. The model's evaluation timeout covers the intersections too; the 35-item `examples/motor-fun/vecto-arm-pivot.js` checks 80 pairs in under a second after its 3 s evaluation.

### `verify-spec`

```
jscad-work verify-spec <model> [--spec FILE] [--write [--force]] [-p JSON] [-t MS]
```

Checks the model against a spec file of target dimensions, positions, clearances, and allowed overlaps, so an edit cannot silently break a dimension that was right. The spec is `<model name>.spec.json` beside the model unless `--spec FILE` names another. The model runs once with the spec's `params`, and `-p` values override those. Exits 0 when every assertion passes and 1 when any fails, with `error: 2 of 12 spec assertions failed: parts.1.dimensions, interference` on stderr. A missing spec file, invalid JSON, or an unknown field exits 1 naming the problem.

```json
{
  "params": { "capstanOffset": 2 },
  "tolerance": 0.01,
  "volumeTolerance": 0.001,
  "model": { "dimensions": [125.67, 624.6, 74.15] },
  "parts": {
    "1": { "dimensions": [15, 15, 18] },
    "21-29": { "dimensions": [32, 32, 18], "center": [0, 0, null] }
  },
  "between": [
    { "a": "1", "b": "21-29", "axisAngle": 0, "axisOffset": 0 },
    { "a": "0", "b": "2", "gap": [null, null, { "min": 2, "max": 2.5 }] }
  ],
  "interference": {
    "tolerance": 0.01,
    "allow": [
      { "a": "6-9", "b": "6-9", "why": "bearing model: seals drawn inside the races" },
      { "a": "30-31", "b": "32-34", "maxDepth": 0.1, "why": "clips snap on the dowels" }
    ]
  }
}
```

| Field | Asserts |
|---|---|
| `params` | Parameter values the spec holds for |
| `tolerance` | Default tolerance in mm for lengths, default 0.01 |
| `volumeTolerance` | Default tolerance for `volume` and `area` as a fraction of the expected value, default 0.001 |
| `model` | `dimensions`, `center`, `volume`, `area` of the whole model, as `measure` reports them |
| `parts` | The same fields per item selector (`N` or `N-M`), as `measure --part` reports them |
| `between` | A list of `{ "a", "b", ... }` with `gap`, `centerOffset`, `distance`, `axisAngle` (`axes.angle`), and `axisOffset` (`axes.offset`), as `measure --between` reports them |
| `interference` | No overlap beyond `allow`, as `interference` reports it. `tolerance` defaults to 0.01. Each `allow` entry has `a`, `b`, an optional `maxDepth` past which the overlap fails anyway, and an optional `why` |
| `dfm` | `minWall`, `thinArea`, `overhangArea`, and `maxOverhangAngle` of the whole model, as `dfm` reports them. `wall`, `overhang`, and `up` set the thresholds and build direction as the options of the same name do, e.g. `{ "wall": 1.2, "up": "+z", "minWall": { "min": 1.2 }, "overhangArea": { "max": 0 } }` |

An expected value is a number, matched within the default tolerance (0.1 degree for `axisAngle`); `{ "value": v, "tolerance": t }`; or `{ "min": x, "max": y }` with either bound left out. `dimensions`, `center`, `gap`, and `centerOffset` take three of these, and `null` skips an axis. Use a range for the `dfm` fields; a bare number matches within the length tolerance. `between` compares boxes, so a clearance between parts that sit side by side reads on its stacking axis. For hole spacing between parts, assert `centerOffset` or each part's `center`.

```json
{"ok":false,"spec":"/work/vecto-arm-pivot.spec.json","passed":8,"failed":2,"results":[{"assert":"parts.1.dimensions","expected":[15,15,18],"actual":[15,15,18],"pass":true},{"assert":"parts.21-29.dimensions","expected":[32,32,18],"actual":[32,32,18.1],"pass":false},{"assert":"between.4,5.axisOffset","expected":{"max":0.05},"actual":0.043893,"pass":true},{"...":"..."},{"assert":"interference","expected":[],"actual":[{"a":"0","b":"26","volume":18.728671,"depth":0.095216,"dimensions":[32,32,0.1]},{"...":"..."}],"pass":false}],"error":"2 of 10 spec assertions failed: parts.21-29.dimensions, interference"}
```

`results` has one entry per field: `assert` names it, `expected` is the spec's value, `actual` the measurement rounded to 0.000001, and `pass`. The `interference` entry lists each failing overlap as `interference` reports it, without `boundingBox`.

`--write` records the model's current state as a starting spec and prints `{"ok":true,"wrote":"<path>","assertions":109,"recordedOverlaps":35}`: `dimensions`, `center`, and `volume` or `area` for the model and each array item, rounded to 0.001, the default tolerances, and one `allow` entry per current overlap with `maxDepth` set to its depth. Each recorded overlap has `"why": "recorded by --write; confirm it is intended or fix it"`. Review those, and replace recorded values with the real targets, before relying on the spec. `--write` refuses to replace an existing file without `--force`.

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
jscad-work render <model> [--view V[,V...]|all] [--section AXIS[,OFFSET[,+|-]]] [-o FILE] [--size WxH] [-p JSON] [-t MS]
```

Loads the model once in headless Chromium through a local viewer server and writes one PNG per view. The camera zooms to fit the model.

| Option | Meaning |
|---|---|
| `--view` | Comma list of `front`, `back`, `left`, `right`, `top`, `bottom`, `iso`, or `all`. Default `iso` |
| `--section AXIS[,OFFSET[,+\|-]]` | Cut the model at the plane `AXIS = OFFSET` and show one side. `OFFSET` defaults to the bounding-box center. `+` keeps coordinates above the plane, `-` below; the default (`+` for `x` and `y`, `-` for `z`) keeps the side whose cut face looks at the `left`, `front`, and `top` views. Default file names gain `-section-AXIS` |
| `-o, --output FILE` | PNG path. With several views, `-<view>` goes before `.png`: `-o shots/arm.png --view top,iso` writes `shots/arm-top.png` and `shots/arm-iso.png`. Default `.jscad-work/<model>-<view>.png` in the current directory |
| `--size WxH` | Viewport and PNG size in pixels, default `800x600` |
| `-p, --params JSON` | Applied in the viewer before the screenshots |

```json
{"ok":true,"width":800,"height":600,"renders":[{"view":"iso","path":"/work/.jscad-work/arm.js-iso.png"}]}
```

- Render waits until the viewer has drawn the model. A model that throws in the viewer exits 1 with `model error in viewer: <message>`, and a model that does not finish within `--timeout` exits 1 with `render timeout: ...`.
- Needs Chromium through Playwright; set `JSCAD_CHROMIUM` to use a system Chromium. Needs network access to jscad.rkroll.com, which serves the viewer app.
- `-p` needs the deployed viewer's `window.jscadStudio` hook.
- `--section` intersects each solid with a box covering the kept side, so cut faces are closed and keep the item's color. It loads a generated `.jscad-section-<pid>-<model>.js` beside the model and deletes it afterwards. A section offset outside the model exits 1 with `model error in viewer: section offset ...`.

```json
{"ok":true,"width":800,"height":600,"section":{"axis":"y","offset":null,"keep":"+"},"renders":[{"view":"front","path":"/work/.jscad-work/bearing.js-front-section-y.png"}]}
```

### `parts`

```
jscad-work parts <model>
```

Lists the `.js` and `.scad` files in the model's directory and their exported names.

```json
{"parts":[{"file":"bearing.js","exports":["create","BEARING_608"],"hasMain":true}]}
```

### `compare`

```
jscad-work compare <model|result.json> [model|result.json] [-p JSON [-p JSON]] [-t MS]
jscad-work compare <a.png> <b.png> [-o FILE] [--threshold N]
```

#### Measurements

Measures side A and side B and reports B minus A. A side is a model run or a saved result: the JSON `jscad-work measure <model> --parts > before.json` prints. Save one before an edit, then compare it with the model after.

| Form | A | B |
|---|---|---|
| `compare MODEL -p JSON` | `MODEL` with default parameters | `MODEL` with `JSON` |
| `compare MODEL -p A -p B` | `MODEL` with `A` | `MODEL` with `B` |
| `compare X Y [-p JSON]` | `X` | `Y`, with `JSON` when given |

`-p` cannot apply to a saved result. A model that fails exits 1 with the side named: `error: b (arm.js): <message>`.

```json
{"ok":true,"a":{"source":"/work/vecto-arm-pivot.js","geomType":"array","dimensions":[125.67,624.6,74.15],"volume":258772.97,"entityCount":35},"b":{"source":"/work/vecto-arm-pivot.js","params":{"capstanOffset":6},"geomType":"array","dimensions":[125.67,624.6,78.15],"volume":263407.46,"entityCount":35},"delta":{"dimensions":[0,0,4],"center":[0,0,2],"volume":4634.485781,"polygonCount":0,"entityCount":0},"parts":[{"part":"0","dimensions":[0,0,4],"center":[0,0,2],"volume":4634.485781,"polygonCount":0},{"part":"2","dimensions":[0,0,0],"center":[0,0,4],"volume":0,"polygonCount":0}],"unchangedParts":30}
```

- `a` and `b` give each side's `source`, `params`, `geomType`, `dimensions`, and `volume` or `area` and `entityCount` when present.
- `delta` has `dimensions` and `center` per axis and `volume`, `area`, `polygonCount`, and `entityCount` where both sides have them. Deltas are rounded to 0.000001.
- For array models, and saved results that include `parts`, `parts` lists each item whose box, center, or volume changed, matched by index, plus `{"part":"7","added":true,...}` or `{"part":"7","removed":true}` when the item counts differ. `unchangedParts` counts the rest. Inserting an item shifts every later index, so those show as changed.

#### PNGs

Compares two PNGs of the same size pixel by pixel. A pixel differs when any RGBA channel differs by more than `--threshold` (0-255, default 0). Writes a diff image with differing pixels in red over a faded copy of A, to `-o FILE` or `.jscad-work/<a>-vs-<b>-diff.png` in the current directory.

```json
{"ok":true,"a":"/work/before.png","b":"/work/after.png","threshold":0,"width":800,"height":600,"differingPixels":5210,"totalPixels":480000,"percent":1.0854,"region":[[312,140],[488,301]],"diff":"/work/.jscad-work/before-vs-after-diff.png"}
```

`region` is the pixel box `[[minX,minY],[maxX,maxY]]` holding every differing pixel, or `null`. Images of different sizes exit 1. Reads 8-bit non-interlaced PNGs, which covers `render` output.

### `library search`

```
jscad-work library search [QUERY...] [--tags A,B] [--source S] [--lang scad|js] [--parametric]
    [--min-size N|X,Y,Z] [--max-size N|X,Y,Z] [--include-broken] [--limit N]
```

Searches `catalog/catalog.json` (about 500 models from the jscadui libraries). Query words match words in the name (weighted highest), tags, techniques, id, and description. Words are stemmed, so `bearings` matches `bearing` and `threaded` matches `thread`. A synonym (`screw`, `bolt`, `fastener`; `enclosure`, `box`, `case`, `housing`; and a few more groups in `mcp/lib/catalog.js`) scores half. Without a query, the filters alone select entries.

| Option | Meaning |
|---|---|
| `--tags A,B` | Entries carrying every tag |
| `--source S` | `mcad`, `nopscadlib`, `bosl2`, `snippet`, `text`, or `jscad` |
| `--lang L` | `scad` or `js` |
| `--parametric` | Only entries that take parameter overrides |
| `--min-size N\|X,Y,Z` | Smallest `dimensions` in mm. `N` bounds every axis. In `X,Y,Z` an empty axis or `-` has no bound: `30,30,` |
| `--max-size N\|X,Y,Z` | Largest `dimensions` in mm, same form: `,,20`. A value starting with `-` needs `=`: `--max-size=-,-,20` |
| `--include-broken` | Also entries that failed to evaluate headlessly. By default only entries with `runs: true` are returned |
| `--limit N` | Maximum results, default 20 |

Entries without `dimensions` are dropped by either size option.

```json
{"results":[{"id":"bosl2/009-ball_bearings-ball_bearing","name":"...","source":"bosl2","lang":"scad","tags":["bearing"],"runs":true,"parametric":false,"dimensions":[22,22,7],"description":"..."}]}
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
jscad-work live-params [MODEL] JSON
```

Pushes parameter values into every viewer tab open on the running server, which re-runs the model. It needs a running `jscad-work <model.js>` and reads the port from that server's `.jscad-studio`, looking in the model's directory and then each parent. Without `MODEL` the search starts in the current directory. `-p JSON` works in place of the JSON argument.

```json
{"ok":true,"clients":1}
```

`clients` is the number of tabs that received the values.

## Model languages

`.scad` files are transpiled and evaluated on the Manifold backend and converted to a jscad-fluent geom3, so every tool works on them. Any model can `require('./part.scad')` and combine the result with jscad-fluent geometry. About 90% of the OpenSCAD corpus transpiles.

`.scad` models take no parameter overrides: `params` returns `[]`, and `eval`, `measure`, `check`, or `export` with a non-empty `-p` on a `.scad` model exits 1 with `.scad models take no parameter overrides; not applied: <names>`.

Models written for jscad-fluent follow its rules: angles in radians, colors in 0-1, boolean inputs all 2D or all 3D, operations return new objects. The full rule set the agent works from is the `JSCAD.md` template, `jscadMd` in `mcp/lib/workspace.js`.

## Maintenance scripts

### jscad-fluent API reference

`docs/reference/jscad-fluent-llm.txt` is a copy of `../jscad-fluent/llm.txt`, which `JSCAD.md` falls back to when the agent cannot fetch the upstream file. `npm run sync-llm` copies the upstream file over it and exits 1 when `../jscad-fluent` is not beside this repo. `test/llm-sync.test.js` fails with `run npm run sync-llm` when the two differ, and is skipped when `../jscad-fluent` is absent, as in CI.

### Catalog

`node scripts/build-catalog.js [--force]` describes catalog entries and writes `catalog/catalog.json`. It skips entries already described; `--force` redoes all. The entry set follows the jscadui libraries' `skip.txt` and `exclude.txt`. The description backend is chosen in this order:

| Environment | Backend |
|---|---|
| `OLLAMA_HOST` set (with `OLLAMA_MODEL`) | Ollama |
| `ANTHROPIC_API_KEY` set | Anthropic API |
| neither | the logged-in `claude` CLI |

### Session analysis

`node scripts/analyze-sessions.js [--all] [--stdout] [--llm]` reads sessions without modifying them, flags where the agent struggled, and groups findings by the prompt to improve (`AGENTS.md`, `JSCAD.md`, the jscad-fluent `llm.txt`, or a skill). `jscad-work` tool subcommands run through Bash count the same as the MCP tool calls in older transcripts.

| Source | Location |
|---|---|
| OpenCode from mid-2026 | `~/.local/share/opencode/opencode.db`, opened read-only through `node:sqlite` (Node 22.5 or later). Without `--all`, only sessions whose parts mention `jscad` or whose directory is a jscad-work workspace are loaded |
| OpenCode before mid-2026 | `~/.local/share/opencode/storage/`, one JSON file per session, message, and part |
| Claude Code | `~/.claude/projects/**/*.jsonl` |

| Signal | Flags |
|---|---|
| Tool and eval errors, retries, compactions | Failed calls, the same tool called again on the same target, and context compactions |
| Bootstrap miss | A jscad-work session that asked how to start and never ran jscad-work |
| Hazard hits | Code or text matching a hazard the prompts name: degrees, 0-255 colors, high `segments`, zero sizes, coincident faces, empty geometry, choice `options`, plain parameters, thin walls |
| No verify | A jscad-work session that ran `eval`, `render`, or `export`, or edited a `.js`, `.jscad`, or `.scad` file, with no `measure` or `check` |
| Unread render | A successful render none of whose PNGs is opened by a later Read. Looking at the browser tab is not seen |
| Target miss | A size stated in a user message (`40x20x10`, `40 mm wide`, `height of 3 cm`) that no `measure` result matched within 2% or 0.5 mm. Only whole-model boxes are compared, so a part target in an assembly is a false miss |

Sessions are sorted by a score weighting these signals. The report is committed, so paths outside this repo and `~/src`, email addresses, and token-like strings are redacted from it.

| Option | Effect |
|---|---|
| `--all` | Every session, not only jscad-work sessions |
| `--stdout` | Print instead of writing `docs/session-analysis/<date>-friction.md` |
| `--llm` | Add an Ollama pass that suggests prompt edits; needs `OLLAMA_HOST`, otherwise heuristics only |

## MCP server (deprecated)

`mcp/server.js` serves the same tools over MCP stdio for one more release; see [`mcp/README.md`](../mcp/README.md).
