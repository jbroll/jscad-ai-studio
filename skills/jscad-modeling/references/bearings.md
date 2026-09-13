# Ball bearings

Ported from quellant/openscad-mcp `reference.py`, topic `bearings` (MIT, see
[LICENSE-openscad-mcp.txt](LICENSE-openscad-mcp.txt)). All values in mm.
Confidence: standard.

| Bearing | Bore | OD | Width | Use | Source |
|---|---|---|---|---|---|
| 608 | 8 | 22 | 7 | Skateboard bearing, easiest to source | [1] [2] |
| 625 | 5 | 16 | 5 | Printer idlers | [2] |
| 623 | 3 | 10 | 4 | M3 shafts, idler pulleys | [2] |
| 626 | 6 | 19 | 6 | 6 mm shafts | [2] |
| 6000 | 10 | 26 | 8 | 10 mm shafts | [1] [2] |
| 688-2RS / 688-ZZ | 8 | 16 | 5 | Thin 8 mm bore idlers; open 688 is 4 wide | [3] [2] |
| MR105ZZ / MR105-2RS | 5 | 10 | 4 | Miniature 5 mm shafts; open MR105 is 3 wide | [3] |

`examples/motor-fun/bearing.js` also defines 6001 (12 x 28 x 8) and 6002
(15 x 32 x 9).

## Pockets

- Press fit: pocket bore = OD + 0.0 to 0.1. At OD + 0.2 it is a slip fit that
  needs a retainer.
- Support the outer race only. Leave a shoulder about 2 mm smaller than the OD
  and relieve the pocket floor so the seal does not rub.
- Bearing ODs are held to hundredths; the printer is not. Test pockets at OD,
  OD + 0.1 and OD + 0.2. (calibrate)
- Printed press fits relax as the plastic creeps. Add a lip, snap ring groove,
  or clamping plate for anything that must stay put.
- Press bearings in cold and square. Keep pocket axes along Z where possible;
  horizontal pockets print undersized and out of round.

## Sources

1. BOSL2 `ball_bearings.scad` trade size table, https://github.com/BelfrySCAD/BOSL2/blob/master/ball_bearings.scad
2. igus ball bearing dimensions table, https://www.igus.eu/ball-bearings/wiki/ball-bearings-dimensions-table
3. MISUMI miniature ball bearing pages, https://us.misumi-ec.com/blog/ball-bearings/miniature/
