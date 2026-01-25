/**
 * Parametric Ball Bearing Model
 *
 * Factory for creating sealed ball bearings of any size.
 * Includes presets for common sizes (608, 6001, 6002).
 *
 * Usage:
 *   const bearing = require('./bearing.js');
 *   const brg608 = bearing.bearing608(p.bearing);
 *   const brg6002 = bearing.bearing6002(p.bearing);
 *   // Or with custom dimensions:
 *   const custom = bearing.create(bearing.BEARING_608, p.bearing);
 */

const jf = require('@jbroll/jscad-fluent');

// Standard bearing dimensions (mm)
const BEARING_608 = {
  name: '608-2RS',
  innerDia: 8,
  outerDia: 22,
  width: 7,
  raceThickness: 3,
  sealInset: 0.5,
  sealThickness: 0.8
};

const BEARING_6001 = {
  name: '6001-2RS',
  innerDia: 12,
  outerDia: 28,
  width: 8,
  raceThickness: 4,
  sealInset: 0.5,
  sealThickness: 0.8
};

const BEARING_6002 = {
  name: '6002-2RS',
  innerDia: 15,
  outerDia: 32,
  width: 9,
  raceThickness: 4,
  sealInset: 0.5,
  sealThickness: 0.8
};

/**
 * Create a bearing model from dimensions
 * @param {Object} dims - Bearing dimensions (use BEARING_608, etc.)
 * @param {Object} p - Parameter object for UI binding
 */
const create = (dims, p) => {
  p._type = dims.name + ' Bearing';

  const { innerDia: id, outerDia: od, width: w, raceThickness: rt, sealInset, sealThickness } = dims;

  // Outer race (hollow cylinder)
  const outerRace = jf.cylinder({ outer: od / 2, inner: (od - rt) / 2, height: w })
    .translateZ(w / 2)
    .colorize([0.7, 0.7, 0.75]);

  // Inner race (hollow cylinder)
  const innerRace = jf.cylinder({ outer: (id + rt) / 2, inner: id / 2, height: w })
    .translateZ(w / 2)
    .colorize([0.7, 0.7, 0.75]);

  // Rubber seals (2RS = double sealed)
  const seal = jf.cylinder({ outer: (od - 2) / 2, inner: (id + 2) / 2, height: sealThickness })
    .colorize([0.15, 0.15, 0.2]);

  const seal1 = seal.translateZ(sealInset + sealThickness / 2);
  const seal2 = seal.translateZ(w - sealInset - sealThickness / 2);

  return [outerRace, innerRace, seal1, seal2];
};

// Standalone main for viewing - defaults to 608
const main = (p) => {
  p._type = 'Bearing Selector';
  p.size = { type: 'choice', default: '608', options: ['608', '6001', '6002'], label: 'Bearing Size' };

  const dims = { '608': BEARING_608, '6001': BEARING_6001, '6002': BEARING_6002 }[p.size];
  return create(dims, p);
};

module.exports = { main, create, BEARING_608, BEARING_6001, BEARING_6002 };
