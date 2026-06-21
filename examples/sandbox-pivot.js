/**
 * sandbox-pivot
 *
 * Description: [Add description here]
 */

const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'R-Theta Hub';
  p.outerRadius = { type: 'slider', default: 50, min: 30, max: 100, step: 5, label: 'Outer Radius', live: true };
  p.innerRadius = { type: 'slider', default: 20, min: 10, max: 40, step: 1, label: 'Inner Radius', live: true };
  p.height = { type: 'slider', default: 100, min: 50, max: 200, step: 10, label: 'Height', live: true };
  p.protrusion = { type: 'slider', default: 20, min: 10, max: 50, step: 5, label: 'Protrusion Length', live: true };
  p.grooveWidth = { type: 'slider', default: 2, min: 1, max: 5, step: 0.5, label: 'Groove Width', live: true };
  p.gearRadius = { type: 'slider', default: 25.4, min: 10, max: 50, step: 0.1, label: 'Gear Radius', live: true };

  // Outer hollow cylinder (radial beam pivot)
  const outerCylinder = jf.cylinder({
    radius: p.outerRadius,
    height: p.height,
    inner: p.outerRadius * 0.8 // 20% wall thickness
  });

  // Inner drive shaft with protrusion
  const innerCylinder = jf.cylinder({
    radius: p.innerRadius,
    height: p.height + 2 * p.protrusion
  });

  // Timing belt groove (outer cylinder)
  const outerGroove = jf.cylinder({
    radius: p.grooveWidth / 2,
    height: p.height
  }).translate([0, 0, 0]);

  // Timing belt groove (inner cylinder)
  const innerGroove = jf.cylinder({
    radius: p.grooveWidth / 2,
    height: p.height
  }).translate([0, 0, 0]);

  // Gears for linear axis
  const topGear = jf.cylinder({
    radius: p.gearRadius,
    height: 5
  }).translate([0, 0, p.height/2 + p.protrusion]);

  const bottomGear = jf.cylinder({
    radius: p.gearRadius,
    height: 5
  }).translate([0, 0, -p.height/2 - p.protrusion]);

  // Combine and colorize
  return outerCylinder
    .subtract(outerGroove)
    .union(innerCylinder.subtract(innerGroove))
    .union(topGear)
    .union(bottomGear)
    .colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
