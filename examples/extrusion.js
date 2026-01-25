/**
 * 2D to 3D extrusion example
 */
const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'Extrusion';
  p.width = { type: 'slider', default: 30, min: 10, max: 50, label: 'Width', live: true };
  p.height = { type: 'slider', default: 10, min: 5, max: 20, label: 'Height', live: true };
  p.holeRadius = { type: 'slider', default: 5, min: 2, max: 10, label: 'Hole Radius', live: true };

  // Create 2D shape with hole
  const shape2d = jf.rectangle({ size: [p.width, p.width] })
    .subtract(jf.circle({ radius: p.holeRadius }))
    .expand({ delta: 2, corners: 'round' });

  // Extrude to 3D
  return shape2d.extrudeLinear({ height: p.height }).colorize([0.3, 0.7, 0.5]);
};

module.exports = { main };
