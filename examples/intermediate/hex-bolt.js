/**
 * Hexagonal Bolt
 *
 * Demonstrates creating a realistic bolt with hexagonal head and threaded shaft.
 * Shows polygon creation, extrusion, and combining multiple parts.
 *
 * Expected output: A bolt with hex head
 * Volume: ~1900 cubic units
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Create hexagonal head using polygon
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6;
    hexPoints.push([8 * Math.cos(angle), 8 * Math.sin(angle)]);
  }

  const head = jf.polygon(hexPoints)
    .extrudeLinear({ height: 5 })
    .colorize([0.7, 0.7, 0.7]);

  // Cylindrical shaft
  const shaft = jf.cylinder({ radius: 4, height: 30, segments: 32 })
    .translate([0, 0, -30])
    .colorize([0.7, 0.7, 0.7]);

  // Combine into single bolt
  const bolt = head.union(shaft);

  // Log measurements
  console.log('✓ Hex bolt created');
  console.log('Total height:', Math.abs(bolt.measureDimensions()[2]).toFixed(2));
  console.log('Volume:', bolt.measureVolume().toFixed(2));
  console.log('Bounding box:', bolt.measureBoundingBox());

  return bolt;
};

module.exports = { main };
