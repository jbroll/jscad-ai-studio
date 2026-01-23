/**
 * Boolean Operations
 *
 * Demonstrates union, subtract, and intersect operations.
 * These are the fundamental operations for combining shapes.
 *
 * Expected output: Three objects showing different boolean operations
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Union - combine two shapes
  const union = jf.cube({ size: 10 })
    .union(jf.sphere({ radius: 6 }))
    .translate([-16, 0, 0])
    .colorize([0.8, 0.3, 0.3]);

  // Subtract - create holes
  const subtract = jf.cube({ size: 10 })
    .subtract(jf.sphere({ radius: 6 }))
    .colorize([0.3, 0.8, 0.3]);

  // Intersect - keep only overlap
  const intersect = jf.cube({ size: 10 })
    .intersect(jf.sphere({ radius: 6 }))
    .translate([16, 0, 0])
    .colorize([0.3, 0.3, 0.8]);

  console.log('✓ Three boolean operations demonstrated');
  console.log('Union volume:', union.measureVolume().toFixed(2));
  console.log('Subtract volume:', subtract.measureVolume().toFixed(2));
  console.log('Intersect volume:', intersect.measureVolume().toFixed(2));

  return [union, subtract, intersect];
};

module.exports = { main };
