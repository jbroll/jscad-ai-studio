/**
 * 2D to 3D Extrusion
 *
 * Demonstrates how to create 3D objects from 2D shapes.
 * Shows linear extrusion, rotational extrusion, and twisted extrusion.
 *
 * Expected output: Three extruded shapes
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Linear extrusion - push 2D shape upward
  const linear = jf.circle({ radius: 6 })
    .subtract(jf.circle({ radius: 4 }))  // Make a ring
    .extrudeLinear({ height: 10 })
    .translate([-16, 0, 0])
    .colorize([0.8, 0.3, 0.3]);

  // Rotational extrusion (lathe) - spin 2D profile around Y axis
  const profile = jf.rectangle({ size: [2, 8] })
    .translate([6, 0, 0]);  // Offset from center for lathe
  const rotational = profile
    .extrudeRotate({ segments: 32 })
    .colorize([0.3, 0.8, 0.3]);

  // Twisted extrusion - linear extrusion with twist
  const twisted = jf.square({ size: 6 })
    .extrudeLinear({ height: 20, twistAngle: Math.PI / 2, twistSteps: 20 })
    .translate([16, 0, 0])
    .colorize([0.3, 0.3, 0.8]);

  console.log('✓ Three extrusion types demonstrated');
  console.log('Linear volume:', linear.measureVolume().toFixed(2));
  console.log('Rotational volume:', rotational.measureVolume().toFixed(2));
  console.log('Twisted volume:', twisted.measureVolume().toFixed(2));

  return [linear, rotational, twisted];
};

module.exports = { main };
