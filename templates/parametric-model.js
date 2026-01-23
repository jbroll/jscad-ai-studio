/**
 * [Model Name]
 *
 * Parametric model with interactive controls in the viewer.
 *
 * Expected output: Describe what the model should look like
 */

const jf = require('@jbroll/jscad-fluent');

const main = (params) => {
  // Define model name for UI
  params._type = '[Model Name]';

  // Define interactive parameters
  params.size = {
    type: 'slider',
    default: 10,
    min: 5,
    max: 20,
    step: 1,
    label: 'Size',
    live: true  // Update in real-time as slider moves
  };

  params.color = {
    type: 'color',
    default: '#6688CC',
    label: 'Color'
  };

  params.segments = {
    type: 'int',
    default: 32,
    min: 8,
    max: 64,
    step: 4,
    label: 'Segments'
  };

  // Create model using parameters
  const model = jf.sphere({
    radius: params.size / 2,
    segments: params.segments
  }).colorize(jf.colors.hexToRgb(params.color));

  // Log measurements
  console.log('✓ Parametric model generated');
  console.log('Size:', params.size);
  console.log('Volume:', model.measureVolume().toFixed(2));

  return model;
};

module.exports = { main };
