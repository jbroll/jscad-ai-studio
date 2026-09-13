# Fits and FDM design rules

Ported from quellant/openscad-mcp `reference.py`, topics `fits` and `dfm`
(MIT, see [LICENSE-openscad-mcp.txt](LICENSE-openscad-mcp.txt)). Each row keeps
its confidence label:

- **standard**: from a published standard or manufacturer catalogue.
- **consensus**: common community practice, no governing standard.
- **calibrate**: a starting point only. Print a test coupon.

All values assume a 0.4 mm nozzle and 0.2 mm layers on a consumer FDM printer.

## Fits

Clearance per side is half the diametral clearance. Model the hole at
`shaft + 2 * perSide`.

| Fit | Per side mm (range) | Diametral mm (range) | Confidence | Source |
|---|---|---|---|---|
| Press fit | 0.0 (-0.05 to 0.0) | 0.0 (-0.10 to 0.0) | calibrate | [1] |
| Snap fit / light interference | 0.05 (0.0 to 0.10) | 0.10 (0.0 to 0.20) | calibrate | [1] |
| Close running (slip) | 0.10 (0.08 to 0.15) | 0.20 (0.15 to 0.30) | consensus | [1] |
| Free running (loose) | 0.20 (0.15 to 0.30) | 0.40 (0.30 to 0.60) | consensus | [1] |
| Sliding lid / drawer | 0.25 (0.20 to 0.40) | 0.50 (0.40 to 0.80) | consensus | [1] |
| Screw clearance | 0.20 (0.10 to 0.30) | 0.40 (0.20 to 0.60) | standard | [2] |

- Press fit: FDM holes already print undersized, so a nominal zero-clearance
  pair usually needs force. 0.05 mm too tight splits thin walls.
- Snap fit: add a 0.5-1 mm lead-in chamfer at 30-45 degrees.
- Sliding lid: above about 80 mm of travel use the top of the range and relieve
  the middle of the slot.
- Screw clearance: use the ISO 273 medium column in
  [fasteners-and-inserts.md](fasteners-and-inserts.md), not a generic clearance.

Notes:

- Vertical holes (axis along Z) print close to nominal. Horizontal holes print
  0.2-0.4 mm undersized on the diameter. Oversize them or use a teardrop or
  flat-topped profile. (consensus)
- A cylinder with few segments is an inscribed polygon and is already smaller
  than nominal. Raise `segments` or scale the radius by `1 / cos(PI / segments)`.
  (standard, [4])
- Elephant foot: the first layer spreads 0.1-0.3 mm, so bottom holes are
  undersized. Use slicer compensation or a 0.5 mm 45 degree bottom chamfer.
  (consensus)
- Tuned consumer printers hold about +/-0.1 to +/-0.2 mm in XY. Do not design a
  fit that needs better without measuring your printer. (consensus)

## FDM design rules

| Rule | Value | Confidence | Source |
|---|---|---|---|
| Max unsupported overhang | 45 deg from vertical (45-60 with good cooling) | consensus | [1] |
| Reliable bridge span | 25 mm typical (20-50) | consensus | [1] |
| Min wall, non-structural | 0.8 mm (two perimeters) | consensus | [1] |
| Wall, load-bearing | 1.2-1.6 mm (three or four perimeters) | consensus | [1] |
| Min printable feature | 0.4 mm | consensus | [1] |
| Min legible emboss/engrave | 0.8 mm wide, 0.4 mm deep | consensus | [1] |
| Vertical hole undersize | 0.15 mm on diameter | consensus | [3] |
| Horizontal hole undersize | 0.30 mm (0.2-0.4) on diameter | consensus | [3] |
| Bottom edge chamfer | 0.5 mm (0.4-1.0), chamfer not fillet | consensus | [1] |
| Z strength | about 0.5 of in-plane (0.3-0.8) | consensus | [1] |
| Warp risk footprint | about 100 mm | consensus | [1] |
| Per-part tolerance for stacks | 0.15 mm (0.1-0.2) | consensus | [1] |
| Print-in-place gap | 0.4 mm (0.3-0.5); below 0.3 fuses | calibrate | [1] |

- `jscad-work dfm` defaults to the 0.8 mm wall and 45 degree overhang rows.
  Pass `--wall 1.2` for load-bearing parts and `--up` for the print orientation.
- Walls should be a whole number of extrusion widths; odd widths get weak gap
  fill.
- The first layer over a bridge sags, so a bridged nut trap or horizontal hole
  roof is never dimensionally exact.
- Tolerances add. Reference every feature to one datum and put any adjustment in
  one slot or oversized hole.
- When rules conflict, change the print orientation first. It fixes overhangs,
  layer strength, hole roundness and warping together.
- Pins under about 2 mm diameter snap when removed from the bed.

`JSCAD.md` gives shorter defaults (for example 10 mm bridges). Those are
deliberately conservative. Use this table when a design needs the wider range
and say which value you chose in `NOTES.md`.

## Sources

1. Community FDM practice, consistent with the BOSL2 `$slop` calibration
   procedure, https://github.com/BelfrySCAD/BOSL2/wiki/constants.scad#constant-slop
2. ISO 273 clearance holes, table via IS 1821:1987,
   https://law.resource.org/pub/in/bis/S01/is.1821.1987.pdf
3. nophead, Polyholes, https://hydraraptor.blogspot.com/2011/02/polyholes.html
4. OpenSCAD User Manual, https://en.wikibooks.org/wiki/OpenSCAD_User_Manual
