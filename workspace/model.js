/**
 * Example JSCAD model - starting point for new models
 */

const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'Example';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
