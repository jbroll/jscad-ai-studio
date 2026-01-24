/**
 * Pivot Stud
 *
 * Central stud that press-fits into 6002 bearings for platform rotation.
 * Separate from platform for printability.
 * Has 1/4-20 bolt hole through center with hex nut recess at bottom.
 *
 * Usage in other models:
 *   const pivotStud = require('./pivot-stud.js');
 *   const stud = pivotStud.stud(params.stud);
 */

const jf = require('@jbroll/jscad-fluent');
const { QUARTER_TWENTY } = require('./constants.js');

const stud = (p) => {
  p._type = 'Pivot Stud';
  p.studDia = { type: 'slider', default: 15, min: 14, max: 16, step: 0.1, label: 'Stud Dia (6002=15)', live: true };
  p.studLength = { type: 'slider', default: 18, min: 10, max: 25, step: 1, label: 'Stud Length', live: true };
  p.nutRecess = { type: 'slider', default: QUARTER_TWENTY.nutThickness + 1, min: 4, max: 10, step: 0.5, label: 'Nut Recess Depth', live: true };

  // Main stud body
  const studBody = jf.cylinder({ radius: p.studDia / 2, height: p.studLength })
    .translateZ(-p.studLength / 2);

  // 1/4" clearance hole through center
  const boltHole = jf.cylinder({ radius: QUARTER_TWENTY.boltClearance / 2, height: p.studLength + 1 })
    .translateZ(-p.studLength / 2);

  // Hex nut recess at bottom (using 6-sided cylinder)
  const nutRadius = QUARTER_TWENTY.nutAcrossFlats / 2 / Math.cos(Math.PI / 6);  // circumradius from across-flats
  const nutRecess = jf.cylinder({ radius: nutRadius, height: p.nutRecess, segments: 6 })
    .translateZ(-p.studLength + p.nutRecess / 2);

  const studShape = studBody.subtract(boltHole).subtract(nutRecess)
    .colorize([0.3, 0.6, 0.8]);

  return studShape;
};

// Standalone main for viewing this model directly
const main = (p) => stud(p);

module.exports = { main, stud };
