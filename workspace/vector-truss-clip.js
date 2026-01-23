/**
 * vector-truss-clip
 *
 * A 3D printed clip that holds two 5/16" dowels 1" apart (center to center).
 * Multiple clips can be used to create a truss structure from dowels.
 *
 * Design:
 * - C-shaped clips that snap onto dowels from the inside
 * - Connecting bar runs parallel to dowels, positioned just below centerline
 * - Opens at the top/outside for easy installation
 *
 * Dimensions:
 * - Dowel diameter: 5/16" (7.94mm)
 * - Dowel spacing: 1" (25.4mm) center to center
 */

const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'Vector Truss Clip';
  p.dowelDiameter = { type: 'slider', default: 7.94, min: 5, max: 15, step: 0.1, label: 'Dowel Diameter (mm)', live: true };
  p.dowelSpacing = { type: 'slider', default: 25.4, min: 15, max: 50, step: 0.5, label: 'Dowel Spacing (mm)', live: true };
  p.clipOuterDiameter = { type: 'slider', default: 12, min: 8, max: 20, step: 0.5, label: 'Clip Outer Diameter (mm)', live: true };
  p.clipLength = { type: 'slider', default: 15, min: 8, max: 30, step: 1, label: 'Clip Length (mm)', live: true };
  p.clipOpeningAngle = { type: 'slider', default: 60, min: 30, max: 120, step: 5, label: 'Clip Opening Angle (deg)', live: true };
  p.baseHeight = { type: 'slider', default: 3, min: 2, max: 8, step: 0.5, label: 'Base Height (mm)', live: true };
  p.snapFitTolerance = { type: 'slider', default: 0.1, min: 0, max: 0.5, step: 0.05, label: 'Snap Fit Tolerance (mm)', live: true };

  const deg = (d) => d * Math.PI / 180;

  // Create C-shaped clip at given x position
  const createCClip = (x) =>
    jf.cylinder({
      outer: p.clipOuterDiameter / 2,
      inner: p.dowelDiameter / 2 - p.snapFitTolerance,
      height: p.clipLength,
      segments: 32,
      angle: [deg(p.clipOpeningAngle / 2), deg(360 - p.clipOpeningAngle / 2)]
    })
    .rotateZ(x < 0 ? Math.PI : 0)
    .rotateX(Math.PI / 2)
    .translate([x, 0, 0]);

  // Combine bar and clips
  return jf.cuboid({ size: [p.dowelSpacing - p.clipOuterDiameter + 4, p.clipLength - 4, p.baseHeight] })
    .translate([0, 0, -p.baseHeight / 2])
    .union(
      createCClip(-p.dowelSpacing / 2),
      createCClip(p.dowelSpacing / 2)
    )
    .colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
