/**
 * Boolean operations example
 */
const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'Booleans';
  p.size = { type: 'slider', default: 20, min: 10, max: 40, label: 'Size', live: true };
  p.holeRadius = { type: 'slider', default: 4, min: 1, max: 8, label: 'Hole Radius', live: true };

  const base = jf.cube({ size: p.size });

  // Subtract holes on each axis
  const holeX = jf.cylinder({ radius: p.holeRadius, height: p.size + 2 }).rotateY(Math.PI / 2);
  const holeY = jf.cylinder({ radius: p.holeRadius, height: p.size + 2 }).rotateX(Math.PI / 2);
  const holeZ = jf.cylinder({ radius: p.holeRadius, height: p.size + 2 });

  return base.subtract(holeX, holeY, holeZ).colorize([0.8, 0.5, 0.2]);
};

module.exports = { main };
