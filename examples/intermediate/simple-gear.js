/**
 * Simple Gear
 *
 * Demonstrates creating a simple gear with teeth using a loop.
 * Shows how to create complex shapes from basic primitives.
 *
 * Expected output: A gear with 12 teeth
 */

const jf = require('@jbroll/jscad-fluent');

const createGear = (numTeeth, radius, toothHeight, thickness) => {
  // Start with base cylinder
  let gear = jf.cylinder({ radius: radius, height: thickness, segments: 64 });

  // Add teeth around the perimeter
  const anglePerTooth = (Math.PI * 2) / numTeeth;

  for (let i = 0; i < numTeeth; i++) {
    const tooth = jf.cuboid({ size: [toothHeight, 3, thickness] })
      .translate([radius + toothHeight / 2, 0, 0])
      .rotateZ(i * anglePerTooth);

    gear = gear.union(tooth);
  }

  return gear;
};

const main = () => {
  const gear = createGear(12, 10, 4, 5)
    .colorize([0.3, 0.5, 0.8]);

  console.log('✓ Gear created with 12 teeth');
  console.log('Outer diameter:', gear.measureDimensions()[0].toFixed(2));
  console.log('Volume:', gear.measureVolume().toFixed(2));

  return gear;
};

module.exports = { main };
