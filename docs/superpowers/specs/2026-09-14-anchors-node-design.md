# Anchors in jscad-work (Node side)

Adopt `@jbroll/jscad-anchors` in the model tools so assemblies can be aligned by
construction and checked from frames instead of meshes. Replaces the "Hole
alignment across parts" item in `docs/backlog.md`.

Out of scope: rendering anchored models in the viewer. The viewer loads
`@jbroll/jscad-fluent` from jsdelivr (0.6.1, no anchor methods), and
`@jbroll/jscad-anchors` is not on npm. That is a separate spec covering a
single-file anchors build, a jscadui hook for extra module bundles, and
`viewer-server` serving the local packages.

## Findings this design rests on

Measured with a scratch script against an anchored plate (a cuboid with a
carried hole, rotated and translated):

- `measure`, `check`, `dfm`, and `interference` leave frames readable. They go
  through jscad-fluent, whose methods already import modeling from
  jscad-anchors.
- The `@jscad/stl-serializer`, `3mf-serializer`, `obj-serializer`, and
  `svg-serializer` bake geometry with raw modeling. Their output bytes are
  unchanged by the `anchors` field; the frames go stale afterward.
- `export` to 3mf or obj throws `geometry was baked outside jscad-anchors`.
  After serializing, `exportGeom` and `exportArray` count triangles through
  the fluent `toPolygons()`, which is wrapped and detects the raw bake. stl
  counts from the output bytes and does not throw.
- `@jscadui/format-jscad` reads only `polygons`, `sides`, `outlines`, `color`,
  and `transforms`, and never calls modeling, so it ignores `anchors`.
- A model that requires `@jbroll/jscad-anchors` fails with `Cannot find module`
  outside this repo, because `lib/cjs-loader.js` maps only jscad-fluent and
  `@jscad/modeling`.
- jscad-anchors currently resolves in this repo only through jscad-fluent's own
  `node_modules` symlink.

## Dependencies and loading

- `package.json` adds `"@jbroll/jscad-anchors": "file:../jscad-anchors"` and
  `"@jbroll/jscad-modeling": "file:../OpenJSCAD.org/packages/modeling"`, per
  jscad-fluent's `docs/install.md`. `overrides` is unchanged.
- New `lib/anchors.js` loads the package with `createRequire`, as `lib/jf.js`
  does for jscad-fluent, and exports the package object.
- `lib/cjs-loader.js` maps both `@jbroll/jscad-anchors` and `@jscad/modeling`
  to that package object. jscad-anchors re-exports every modeling namespace,
  so a model calling raw modeling on anchored geometry keeps its frames.
  Results for unanchored geometry are unchanged. Deep paths such as
  `@jscad/modeling/src/...` still resolve to raw modeling.
- `docs/install.md` lists `../jscad-anchors` as a fourth sibling checkout.

## Export

`exportGeom` (3mf, obj) and `exportArray` (3mf, obj) compute the triangle count
before calling the serializer. Nothing reads frames after export, and export is
the last output `runModelSync` produces, so the stale frames the serializers
leave do not matter.

## `measure --anchors`

New boolean option. Adds `measure.anchors`, one entry per array item (a single
geometry is item `0`):

```json
{"part":"0","anchors":{"bolt1.axis":{"origin":[6,2,3],"z":[0,-1,0],"x":[1,0,0]}}}
```

- Frames are the item's explicit frames in world space, as `anchors(geom)`
  returns them, rounded to 0.000001. The 27 default direction anchors are not
  listed.
- An item that is itself an array reports `"anchors": null`.
- An item with no frames (including `.scad` results) reports `{}`.

## `verify-spec` `anchors`

New top-level assertion field, a list of entries:

```json
"anchors": [
  { "a": "0:bolt1.axis", "b": "1:axis", "axisAngle": 0, "axisOffset": 0 },
  { "a": "0:top", "b": "2:bottom", "distance": { "max": 0.05 } }
]
```

- Selector `N:name`: `N` is one item index (no ranges); `name` is an explicit
  anchor or a direction name, looked up with `anchors.anchor`, so defaults such
  as `top` work.
- Fields, each using the existing expectation grammar (number,
  `{min, max}`, `{value, tolerance}`):
  - `distance`: distance between the two origins, mm.
  - `axisAngle`: angle between the `z` axes, 0 to 90 degrees, so opposed axes
    read 0. Default tolerance 0.1 degree.
  - `axisOffset`: shortest distance between the two `z` axis lines, mm.
- `axisAngle` and `axisOffset` come from `axisRelation` in `lib/axis.js`,
  called with `{ centroid: origin, axis: z }`.
- Result names: `anchors.0:bolt1.axis,1:axis.axisOffset`.
- `validateSpec` rejects a selector not matching `N:name` and unknown fields,
  in the style of the existing messages.
- At run time an index past the last item, an item that is an array, or an
  unknown anchor name exits 1 with the message, as an out-of-range part does
  now.
- `verify-spec --write` does not draft anchor entries.

## Skill, template, and docs

- `skills/jscad-assembly/SKILL.md`: a section on aligning by construction. Give
  the cutter an `axis` frame with `withAnchors`, cut with
  `subtract(cutter, { carry: { bolt1: cutter } })`, place the mating part with
  `attachTo(parent, parentAnchor, childAnchor)` (argument order differs from
  `anchors.attach`), list frames with `measure --anchors`, and assert
  `axisOffset: 0` and `axisAngle: 0` in the spec. State that `render` cannot
  load anchored models yet.
- `lib/workspace.js` `JSCAD.md` Tools line: mention `measure --anchors`.
- `docs/user-manual.md`: `--anchors` under `measure`; the `anchors` field under
  `verify-spec`; the `between` note "holes inside a larger part are not
  detected" points to anchors.
- `docs/backlog.md`: replace the hole-alignment item with the viewer item
  described under out of scope.
- `../jscad-anchors/docs/backlog.md`: answer the "Serializers and
  `format-jscad`" item with the findings above, in that repo's own commit.

## Tests

- Fixture `test/fixtures/anchored-plate.js`: an array of a plate with a hole cut
  by a cutter carried as `bolt1`, and a pin with an `axis` frame attached to
  `bolt1.axis`.
- Loader: a model in a temp directory requiring `@jbroll/jscad-anchors` and
  `@jscad/modeling` evaluates, and raw-style modeling calls on anchored
  geometry leave frames readable.
- `measure --anchors`: world frames per item, `null` for an array item.
- `verify-spec`: coaxial pin passes `axisAngle`/`axisOffset`; a moved pin
  fails; `validateSpec` rejects `"0"`, `"0-1:axis"`, and unknown fields;
  unknown anchor name and array item exit 1.
- Export: the fixture exports to 3mf and obj, with the same triangle counts as
  the fixture with its `anchors` fields removed.
