/**
 * Transformations
 *
 * Demonstrates translate, rotate, scale, and mirror operations.
 * CRITICAL: Angles are in RADIANS, not degrees!
 *
 * Expected output: Four cubes with different transformations applied
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Original - for reference
  const original = jf.cube({ size: 8 })
    .translate([-24, 0, 0])
    .colorize([0.7, 0.7, 0.7]);

  // Rotated - 45 degrees around Z axis (Math.PI / 4 radians)
  const rotated = jf.cube({ size: 8 })
    .rotateZ(Math.PI / 4)  // RADIANS not degrees!
    .translate([-8, 0, 0])
    .colorize([0.8, 0.3, 0.3]);

  // Scaled - stretched in Z direction
  const scaled = jf.cube({ size: 8 })
    .scale([1, 1, 1.5])
    .translate([8, 0, 0])
    .colorize([0.3, 0.8, 0.3]);

  // Mirrored - with a hole to show the effect
  const mirrored = jf.cube({ size: 8 })
    .subtract(jf.cylinder({ radius: 2, height: 10 }).translate([2, 2, 0]))
    .mirrorX()
    .translate([24, 0, 0])
    .colorize([0.3, 0.3, 0.8]);

  console.log('✓ Transformations demonstrated');
  console.log('Remember: Angles are in RADIANS! Use Math.PI');

  return [original, rotated, scaled, mirrored];
};

module.exports = { main };
