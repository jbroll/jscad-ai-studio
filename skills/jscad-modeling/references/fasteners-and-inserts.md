# Metric fasteners and heat-set inserts

Ported from quellant/openscad-mcp `reference.py`, topics `fasteners`, `inserts`
and the captive nut trap and screw boss rows of `joints` (MIT, see
[LICENSE-openscad-mcp.txt](LICENSE-openscad-mcp.txt)). All values in mm.

## ISO metric coarse screws (confidence: standard)

| Size | Pitch | Clearance close | Clearance medium | Clearance free | Tap drill | SHCS head dia | SHCS head height | Nut across flats | Nut height (max) | Counterbore dia |
|---|---|---|---|---|---|---|---|---|---|---|
| M2 | 0.40 | 2.2 | 2.4 | 2.6 | 1.60 | 3.8 | 2.0 | 4.0 | 1.6 | 4.3 |
| M2.5 | 0.45 | 2.7 | 2.9 | 3.1 | 2.05 | 4.5 | 2.5 | 5.0 | 2.0 | 5.0 |
| M3 | 0.50 | 3.2 | 3.4 | 3.6 | 2.50 | 5.5 | 3.0 | 5.5 | 2.4 | 6.0 |
| M4 | 0.70 | 4.3 | 4.5 | 4.8 | 3.30 | 7.0 | 4.0 | 7.0 | 3.2 | 7.5 |
| M5 | 0.80 | 5.3 | 5.5 | 5.8 | 4.20 | 8.5 | 5.0 | 8.0 | 4.7 | 9.0 |
| M6 | 1.00 | 6.4 | 6.6 | 7.0 | 5.00 | 10.0 | 6.0 | 10.0 | 5.2 | 10.5 |
| M8 | 1.25 | 8.4 | 9.0 | 10.0 | 6.80 | 13.0 | 8.0 | 13.0 | 6.8 | 13.5 |

- Clearance columns are the ISO 273 fine, medium and coarse series [1]. Use
  medium unless there is a reason not to.
- Tap drill is the ISO metric coarse recommendation [2].
- Socket head cap screw (SHCS) heads are ISO 4762 [3]; head height equals the
  nominal diameter.
- Hex nuts are ISO 4032 style 1 [4].
- Counterbore diameter is head diameter + 0.5 mm, a working rule, not a
  standard. Counterbore depth: head height + 0.2-0.4 mm. (consensus)
- Self-tapping into plastic: pilot hole about nominal minus pitch, with at least
  two perimeters around it. (consensus) Do not thread plastic for joints undone
  more than a few times; use an insert or a nut trap.
- Printed clearance holes come out undersized. Add hole compensation (see
  [fits-and-fdm.md](fits-and-fdm.md)) or drill after printing.

## Captive nut trap (confidence: consensus)

- Pocket across flats: ISO 4032 across flats + 0.1-0.3 mm total (typical 0.2).
- Pocket depth: nut height + about 0.2 mm.
- Either a side slot the nut slides into, or a top pocket the print bridges
  over. The bridged roof must be a clean bridge. [4]

## Screw boss (confidence: consensus)

- Wall around the hole: 2.0 mm (1.6-3.0).
- Thread engagement: at least 2x screw diameter.
- Fillet the boss root and leave a small gap between the boss and any adjacent
  wall.

## Heat-set inserts (confidence: consensus)

| Insert | Hole dia | Insert length | Insert OD | Hole depth | Min wall | Boss OD |
|---|---|---|---|---|---|---|
| M2 | 3.2 | 3.0 | 3.6 | 4.0 | 1.3 | 6.2 |
| M2.5 | 4.0 | 4.0 | 4.6 | 5.0 | 1.6 | 7.8 |
| M3 | 4.0 | 5.7 | 4.6 | 6.7 | 1.6 | 7.8 |
| M3 Voron (short) | 4.4 | 4.0 | 5.0 | 5.0 | 1.6 | 8.2 |
| M4 | 5.7 | 8.1 | 6.3 | 9.1 | 2.1 | 10.5 |
| M5 | 6.5 | 9.5 | 7.1 | 10.5 | 2.6 | 12.3 |

- Values are CNC Kitchen's [5]. Boss OD is insert OD + 2x min wall. SPIROL
  recommends a boss of 2-3x insert diameter for load-bearing bosses [6].
- Vendors differ: ruthex uses 5.6 mm for M4 and 6.4 mm for M5 (these are the
  values in `JSCAD.md`), and M2/M2.5 insert lengths differ by 1.7 mm between
  vendors. Use the datasheet for the inserts in hand and record it in
  `NOTES.md`.
- Straight hole, no taper or chamfer. Blind holes get about 1 mm extra depth.
- Printed holes run small. Test a coupon at nominal, +0.1 and +0.2 mm.
  (calibrate)
- Set the insert flush or 0.1-0.2 mm below the surface. PLA creeps under
  preload; PETG, ABS and ASA hold better.

## Sources

1. ISO 273, table via IS 1821:1987, https://law.resource.org/pub/in/bis/S01/is.1821.1987.pdf
2. Fuller Fasteners, recommended tapping drill sizes, https://fullerfasteners.com/tech/recommended-tapping-drill-size/
3. ISO 4762, https://www.fasteners.eu/standards/ISO/4762/
4. ISO 4032 as encoded in BOSL2 `screws.scad` `_nut_info_metric`, https://github.com/BelfrySCAD/BOSL2/blob/master/screws.scad
5. CNC Kitchen, Heat-Set Insert Dimensions and Design Guidelines, https://www.cnckitchen.com/s/CNCKitchen_Heat-Set-Insert-Dimensions-and-Design-Guidelines.pdf
6. SPIROL, How to Design the Proper Hole for Heat/Ultrasonic Inserts, https://www.spirol.com/resources/white-papers/how-to-design-the-proper-hole-for-heat-ultrasonic-inserts/
