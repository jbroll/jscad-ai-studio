---
name: jscad-modeling
description: Sourced hardware dimensions for jscad-fluent parts (fits, metric screws and nuts, heat-set inserts, bearings, FDM limits) and a search, require, measure example. Use when a jscad model needs real part sizes or clearances.
---

# jscad modeling reference

`JSCAD.md` in the workspace holds the rules: design conventions, print rules,
the definition of done, and view inspection. This skill adds sourced numbers
and one worked example.

## Tables

Read only the file you need:

- [references/fits-and-fdm.md](references/fits-and-fdm.md): clearance per fit
  class, hole undersize, walls, overhangs, bridges, print-in-place gaps.
- [references/fasteners-and-inserts.md](references/fasteners-and-inserts.md):
  M2-M8 clearance holes, tap drills, socket head and nut sizes, counterbores,
  nut traps, screw bosses, heat-set insert holes.
- [references/bearings.md](references/bearings.md): 608, 625, 623, 626, 6000,
  688, MR105 and pocket rules.

Every row has a confidence label: `standard` (published standard or catalogue),
`consensus` (common practice), or `calibrate` (a starting point; print a test
coupon). Put each value in a named constant whose comment names the table, and
record `calibrate` values in `NOTES.md` so they get tuned after the first print.

## Example: a plate that holds a 608 bearing

1. **Search.** `library_search({ query: '608 bearing', runnableOnly: true })`.
   The first result is `bosl2/009-ball_bearings-ball_bearing`, `dimensions`
   `[22, 22, 7]`.
2. **Get.** `library_get({ id: 'bosl2/009-ball_bearings-ball_bearing' })`
   returns `path`, the absolute path of the `.scad` file.
3. **Require.** Use the catalog body only to show the fit. The pocket comes from
   the bearing table and a named clearance.

   ```js
   const jf = require('@jbroll/jscad-fluent');

   // library_get({ id: 'bosl2/009-ball_bearings-ball_bearing' }).path
   const BEARING_608_MODEL = require('/home/you/src/jscadui/apps/jscad-web/examples/openscad/bosl2/01-part1/009-ball_bearings-ball_bearing.scad');

   const BEARING_608 = { od: 22, width: 7 };   // references/bearings.md
   const FIT = { pressPerSide: 0.05 };         // references/fits-and-fdm.md, calibrate
   const PLATE = { size: [40, 40, 10] };
   const CUT_OVERRUN = 0.5;
   const SEGMENTS = 64;

   const main = (p) => {
     p.showBearing = { type: 'checkbox', default: true, label: 'Show bearing' };

     const floor = PLATE.size[2] - BEARING_608.width;
     const plate = jf.cuboid({ size: PLATE.size, center: [0, 0, PLATE.size[2] / 2] });
     const pocketHeight = BEARING_608.width + CUT_OVERRUN;
     const pocket = jf.cylinder({
       radius: BEARING_608.od / 2 + FIT.pressPerSide,
       height: pocketHeight,
       segments: SEGMENTS,
       center: [0, 0, floor + pocketHeight / 2],
     });
     const part = plate.subtract(pocket);
     if (!p.showBearing) return part;

     // The catalog bearing is centered on the origin.
     const bearing = BEARING_608_MODEL.translate([0, 0, floor + BEARING_608.width / 2]);
     return [part, bearing];
   };

   module.exports = { main };
   ```

4. **Measure.**
   - `measure({ modelPath, params: { showBearing: 0 } })` gives `dimensions`
     `[40, 40, 10]` and `volume` 13319.1. The target is
     40 x 40 x 10 - pi x 11.05² x 7 = 13314.8 mm³; the 64-sided pocket is
     slightly smaller than a true circle, so a little less material is removed.
   - `measure({ modelPath })` with the bearing still gives `[40, 40, 10]`, so the
     bearing top is flush with the plate top and does not stick out.

   Report both target and measured values, then finish the definition of done in
   `JSCAD.md`.
