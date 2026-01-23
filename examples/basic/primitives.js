/**
 * Basic Primitives
 *
 * Demonstrates creating basic 3D shapes with jscad-fluent.
 * Shows cubes, spheres, cylinders, and how to position them.
 *
 * Expected output: Four colored primitives in a row
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Cube - red
  const cube = jf.cube({ size: 10 })
    .translate([-20, 0, 0])
    .colorize([0.8, 0.2, 0.2]);

  // Sphere - green
  const sphere = jf.sphere({ radius: 6, segments: 32 })
    .translate([-6, 0, 0])
    .colorize([0.2, 0.8, 0.2]);

  // Cylinder - blue
  const cylinder = jf.cylinder({ radius: 5, height: 12, segments: 32 })
    .translate([8, 0, 0])
    .colorize([0.2, 0.2, 0.8]);

  // Torus - yellow
  const torus = jf.torus({ innerRadius: 3, outerRadius: 6, innerSegments: 16, outerSegments: 32 })
    .translate([24, 0, 0])
    .colorize([0.8, 0.8, 0.2]);

  console.log('✓ Four primitives created');

  return [cube, sphere, cylinder, torus];
};

module.exports = { main };
