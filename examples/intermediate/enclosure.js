/**
 * Simple Enclosure
 *
 * Demonstrates creating a box with rounded corners and mounting holes.
 * Shows practical CAD design patterns.
 *
 * Expected output: A hollowed box with rounded corners and corner holes
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  const width = 40;
  const depth = 30;
  const height = 20;
  const wallThickness = 2;

  // Outer shell with rounded corners
  const outer = jf.roundedCuboid({
    size: [width, depth, height],
    roundRadius: 2,
    segments: 16
  });

  // Inner cavity
  const inner = jf.roundedCuboid({
    size: [width - wallThickness * 2, depth - wallThickness * 2, height - wallThickness],
    roundRadius: 1,
    segments: 16
  }).translate([0, 0, wallThickness]);

  // Create hollow box
  let enclosure = outer.subtract(inner);

  // Add mounting holes in corners
  const holeRadius = 1.5;
  const holeInset = 4;

  const holes = [
    jf.cylinder({ radius: holeRadius, height: height + 2, segments: 16 })
      .translate([width / 2 - holeInset, depth / 2 - holeInset, -1]),
    jf.cylinder({ radius: holeRadius, height: height + 2, segments: 16 })
      .translate([-width / 2 + holeInset, depth / 2 - holeInset, -1]),
    jf.cylinder({ radius: holeRadius, height: height + 2, segments: 16 })
      .translate([width / 2 - holeInset, -depth / 2 + holeInset, -1]),
    jf.cylinder({ radius: holeRadius, height: height + 2, segments: 16 })
      .translate([-width / 2 + holeInset, -depth / 2 + holeInset, -1])
  ];

  enclosure = enclosure.subtract(...holes);

  enclosure = enclosure.colorize([0.4, 0.6, 0.4]);

  console.log('✓ Enclosure created');
  console.log('Dimensions:', enclosure.measureDimensions());
  console.log('Volume:', enclosure.measureVolume().toFixed(2));
  console.log('Wall thickness:', wallThickness);

  return enclosure;
};

module.exports = { main };
