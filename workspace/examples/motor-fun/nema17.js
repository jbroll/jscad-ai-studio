/**
 * NEMA 17 Stepper Motor Model
 *
 * Standard NEMA 17 dimensions with parametric stack height.
 * Can be used standalone or required by other models.
 *
 * Usage in other models:
 *   const nema17 = require('./nema17.js');
 *   const motor = nema17.motor(params.motor);  // pass nested params
 */

const jf = require('@jbroll/jscad-fluent');

// NEMA 17 standard dimensions (mm)
const NEMA17 = {
  faceSize: 42.3,
  boltSpacing: 31,
  boltDia: 3,
  bossDia: 22,
  bossHeight: 2,
  shaftDia: 5,
  shaftFlat: 4.5,      // flat-to-flat on D-shaft
  shaftLength: 24,
  cornerRadius: 2.5
};

const motor = (p) => {
  p._type = 'NEMA 17 Motor';
  p.stackHeight = { type: 'slider', default: 40, min: 20, max: 60, step: 1, label: 'Stack Height', live: true };
  p.shaftLength = { type: 'slider', default: 23.5, min: 15, max: 30, step: 0.5, label: 'Shaft Length', live: true };

  const face = NEMA17.faceSize;
  const r = NEMA17.cornerRadius;

  // Motor body - rounded rectangle extruded
  const body = jf.roundedRectangle({ size: [face, face], roundRadius: r })
    .extrudeLinear({ height: p.stackHeight })
    .translateZ(-p.stackHeight);

  // Mounting holes (subtract from body)
  const boltOffset = NEMA17.boltSpacing / 2;
  const boltHole = jf.cylinder({ radius: NEMA17.boltDia / 2, height: 6 }).translateZ(-3);
  const holes = jf.union(
    boltHole.translate([boltOffset, boltOffset, 0]),
    boltHole.translate([-boltOffset, boltOffset, 0]),
    boltHole.translate([boltOffset, -boltOffset, 0]),
    boltHole.translate([-boltOffset, -boltOffset, 0])
  );

  // Boss (pilot/locating ring)
  const boss = jf.cylinder({ radius: NEMA17.bossDia / 2, height: NEMA17.bossHeight })
    .translateZ(NEMA17.bossHeight / 2);

  // D-shaft: cylinder with flat cut
  // Flat-to-flat is 4.5mm on a 5mm shaft, so flat is 2.25mm from center
  const shaftRadius = NEMA17.shaftDia / 2;
  const flatDistance = NEMA17.shaftFlat / 2;  // distance from center to flat
  const shaftZ = NEMA17.bossHeight + p.shaftLength / 2;

  const shaftCyl = jf.cylinder({ radius: shaftRadius, height: p.shaftLength });
  const flatCut = jf.cuboid({ size: [shaftRadius, shaftRadius * 2, p.shaftLength + 1] })
    .translate([flatDistance + shaftRadius / 2, 0, 0]);  // position box to cut flat
  const shaft = shaftCyl.subtract(flatCut).translateZ(shaftZ);

  // Combine: body with holes, plus boss and shaft
  const motorBody = body.subtract(holes).colorize([0.15, 0.15, 0.15]);
  const motorBoss = boss.colorize([0.7, 0.7, 0.7]);
  const motorShaft = shaft.colorize([0.8, 0.8, 0.8]);

  return [motorBody, motorBoss, motorShaft];
};

// Standalone main for viewing this model directly
const main = (p) => motor(p);

module.exports = { main, motor, NEMA17 };
