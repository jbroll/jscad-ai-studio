# BOSL2 reading reference

Enough BOSL2 to read the catalog's `bosl2` sources and port a technique to
jscad-fluent. Written from the BOSL2 source and wiki
(https://github.com/BelfrySCAD/BOSL2/wiki, BSD-2-Clause). The scope follows
swh/openscad-skill's BOSL2 references; that repo has no license, so none of its
text is copied here.

The catalog sources include `lib/std.scad` plus, in a few files, a library file
such as `lib/gears.scad` or `lib/threading.scad`. Arguments not listed here are
in the module's doc comment in that library file.

## Units and conventions that differ from jscad-fluent

| BOSL2 / OpenSCAD | jscad-fluent |
|---|---|
| Angles in degrees | Radians |
| Colors by name or 0-1 RGB | 0-1 RGB via `colorize` |
| `$fn` segment count | `segments` option |
| `cuboid`, `cyl`, `spheroid` centered by default | `cuboid`, `cylinder`, `sphere` centered by default |
| Native `cube(s)` and `cylinder(h, r)` sit in the positive octant / on Z=0 unless `center=true` | Always centered, move with `translate` |
| `difference() { a; b; c; }` keeps the first child | `a.subtract(b, c)` |
| Transforms apply innermost first: `up(5) xrot(90) x` rotates then moves | Chained left to right: `x.rotateX(PI / 2).translateZ(5)` |

## Directions and anchors

- Direction constants are unit vectors: `RIGHT` +X, `LEFT` -X, `BACK` +Y,
  `FRONT`/`FWD` -Y, `TOP`/`UP` +Z, `BOTTOM`/`BOT`/`DOWN` -Z, `CENTER`/`CTR`
  origin. Add them for edges and corners: `TOP+FRONT`, `BOT+LEFT+FWD`.
- Every attachable shape takes `anchor=`, `spin=`, `orient=`, applied in that
  order. `anchor=BOTTOM` puts the bottom face center at the origin. `spin` rotates
  about Z in degrees. `orient=RIGHT` tips the shape's top to point along +X.
- Default anchors: `cuboid`, `cyl`, `spheroid`, `tube` are `CENTER`;
  `prismoid` is `BOTTOM`.

## Shapes (shapes3d.scad)

- `cuboid(size, rounding=, chamfer=, edges=, except=, trimcorners=true, teardrop=, anchor=CENTER)`:
  box with rounded or chamfered edges. Only one of `rounding`/`chamfer`.
  Negative values flare outward and only apply to top or bottom edges.
- `cyl(h|l, r|d, r1=, r2=, d1=, d2=, chamfer=, rounding=, chamfer1=, chamfer2=, rounding1=, rounding2=, circum=, teardrop=)`:
  cylinder or cone with end treatments. `1` is the bottom end, `2` the top.
- `xcyl`, `ycyl`, `zcyl`: `cyl` with its axis on X, Y or Z.
- `tube(h, or=, ir=, od=, id=, wall=)`: hollow cylinder. Two of outer, inner,
  wall.
- `prismoid(size1, size2, h, shift=, rounding=, chamfer=)`: rectangular frustum;
  `size1` bottom, `size2` top.
- `spheroid(r|d, style=)`, `torus(r_maj=, r_min=)`, `teardrop(h|l, r|d, ang=45)`
  (horizontal hole shape that prints without support), `wedge(size)`,
  `rect_tube(h, size, isize=, wall=)`, `text3d(text, h, size)`.
- 2D: `rect(size, rounding=, chamfer=)`, `circle(r|d)`, `stroke(path, width)`
  draws a path as a line.

### Edge sets (`edges=`, `except=`)

- A face direction (`TOP`) selects the four edges around that face.
- An edge direction (`TOP+FRONT`) selects one edge.
- A corner direction (`TOP+FRONT+LEFT`) selects the three edges at that corner.
- `"X"`, `"Y"`, `"Z"` select the four edges parallel to that axis.
- `"ALL"` / `EDGES_ALL` (default) and `"NONE"` / `EDGES_NONE`.
- A list combines sets: `edges=[TOP, "Z"], except=BOT+FRONT`.

## Movement (transforms.scad)

- `up(z)`, `down(z)`, `left(x)`, `right(x)`, `fwd(y)`, `back(y)`, `move([x,y,z])`.
- `xrot(a)`, `yrot(a)`, `zrot(a)`, `rot(a, v=)`: degrees.
- `xflip()`, `yflip()`, `zflip()`: mirror across the plane normal to that axis.
- `xscale(s)`, `yscale(s)`, `zscale(s)`.
- Halving: `left_half()`, `right_half()`, `front_half()`, `back_half()`,
  `top_half()`, `bottom_half()` keep one side of the plane through the origin.

## Copies (distributors.scad)

These place one copy of the children per position and set `$idx` (0-based) and
usually `$pos` for use inside the children.

- `xcopies(spacing, n)`, `ycopies`, `zcopies`: `n` copies centered on the origin.
  `l=` gives the total length instead of `spacing`.
- `grid_copies(spacing, n=[cols, rows], stagger=)`: XY grid. Sets `$row`, `$col`.
- `zrot_copies(n=, r=, sa=)`: `n` copies rotated about Z, moved out by `r`,
  starting at angle `sa`. `xrot_copies`, `yrot_copies` and `rot_copies(rots, v=)`
  are the same idea. Set `$ang`.
- `arc_copies(n, r, sa=, ea=)`: along an arc.
- `xflip_copy()`, `mirror_copy(v)`: the children plus their mirror image.
- `xdistribute(spacing, sizes=)`: lay out different children side by side.

## Attachment (attachments.scad)

Children written after an attachable shape are placed relative to it:

```
cuboid([40, 40, 10])
  attach(TOP) cyl(h=5, d=8, anchor=BOT);
```

- `position(TOP+LEFT)`: move children's origin to that anchor, no rotation.
- `attach(TOP)`: move to the anchor and rotate so the child's top points out of
  that face.
- `attach(TOP, BOT)`: put the child's `BOT` anchor on the parent's `TOP`
  anchor, facing each other. `align=` slides the child to an edge,
  `inside=true` puts it inside the parent, `overlap=` sinks it in.
- `align(TOP, RIGHT)`: sit the child on the top face against the right edge.
- `show_anchors()`, `anchor_arrow()`, `frame_ref()`: debug markers. They add
  geometry, which inflates an entry's catalog `dimensions`.

### Tags and booleans

- `diff()` subtracts every descendant tagged `"remove"` from the untagged ones
  and keeps `"keep"` descendants as is:

  ```
  diff()
    cuboid([40, 40, 10])
      tag("remove") attach(TOP) cyl(h=11, d=22, anchor=TOP);
  ```

  In jscad-fluent: `plate.subtract(pocket)` with the pocket positioned by hand.
- `intersect()` keeps only the overlap with `"intersect"` children.
  `conv_hull()` hulls untagged children.
- `tag_this()`, `recolor(c)`, `color_this(c)`, `highlight()`, `ghost()` change
  tags or display color only.

## Sweeps and extrusions

- `linear_extrude(height, twist=, scale=)` and `rotate_extrude(angle=)` are
  native OpenSCAD; jscad-fluent has `extrudeLinear` and `extrudeRotate`.
- `path_sweep(shape, path)`: sweep a 2D shape along a 3D path.
- `skin([profiles], slices=)`: loft between profiles.
- `attach_prism(...)`: prism that joins a face of its parent with a fillet.

## Parts libraries used by the catalog

Files the catalog sources include, most common first: `bottlecaps` (10),
`joiners` (9), `gears`, `threading`, `walls` (7 each), `cubetruss`, `screws`
(5), `linear_bearings`, `partitions` (4), `hinges`, `metric_screws`,
`modular_hose` (3). Library modules the sources call:

| Area | Modules |
|---|---|
| Gears | `spur_gear`, `ring_gear`, `crown_gear`, `worm`, `worm_gear`, `enveloping_worm` |
| Fasteners | `nut`, `generic_screw`, `metric_bolt` |
| Joints | `dovetail`, `snap_pin`, `snap_pin_socket`, `rabbit_clip`, `half_joiner_clear`, `joiner_clear`, `hirth`, `snap_lock`, `snap_socket`, `living_hinge_mask` |
| Bottles | `pco1810_neck`, `pco1810_cap`, `pco1881_neck`, `pco1881_cap`, `generic_bottle_neck`, `generic_bottle_cap`, `bottle_adapter_*` |
| Bearings and motors | `ball_bearing`, `linear_bearing`, `linear_bearing_housing`, `nema_mount_mask` |
| Truss and hose | `cubetruss_foot`, `cubetruss_joiner`, `cubetruss_clip`, `cubetruss_uclip`, `modular_hose` |
| Edge masks | `chamfer_edge_mask`, `chamfer_corner_mask`, `rounding_corner_mask`, `teardrop_corner_mask`, `rounding_hole_mask`, `polygon_edge_mask`, `mask2d_roundover` |

A mask is a cutter shaped to remove material along an edge or corner: position
it on the edge and subtract it.

## Special variables

- `$fn`, `$fa`, `$fs`: segment count, or minimum angle and size.
- `$slop`: extra clearance per side that BOSL2 adds to printed fits (threads,
  joiners, screw holes). Default 0.
- `$idx`, `$pos`, `$ang`, `$row`, `$col`: set by the copy modules above.
