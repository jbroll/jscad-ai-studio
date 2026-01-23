/**
 * Parametric Box with Interactive Controls
 *
 * Demonstrates the jscadui parametric system with interactive sliders.
 * This example creates a customizable box with user-adjustable parameters.
 *
 * Expected output: A box that can be resized using viewer controls
 */

const jf = require('@jbroll/jscad-fluent');

const main = (params) => {
  // Define interactive parameters
  params._type = 'Parametric Box';

  params.width = {
    type: 'slider',
    default: 40,
    min: 20,
    max: 80,
    step: 1,
    label: 'Width',
    live: true
  };

  params.depth = {
    type: 'slider',
    default: 30,
    min: 20,
    max: 60,
    step: 1,
    label: 'Depth',
    live: true
  };

  params.height = {
    type: 'slider',
    default: 20,
    min: 10,
    max: 40,
    step: 1,
    label: 'Height',
    live: true
  };

  params.wallThickness = {
    type: 'slider',
    default: 2,
    min: 1,
    max: 5,
    step: 0.5,
    label: 'Wall Thickness',
    live: true
  };

  params.roundRadius = {
    type: 'slider',
    default: 2,
    min: 0,
    max: 5,
    step: 0.5,
    label: 'Corner Radius',
    live: true
  };

  params.color = {
    type: 'color',
    default: '#4488CC',
    label: 'Color'
  };

  // Use the parameter values
  const outer = jf.roundedCuboid({
    size: [params.width, params.depth, params.height],
    roundRadius: params.roundRadius,
    segments: 16
  });

  const inner = jf.roundedCuboid({
    size: [
      params.width - params.wallThickness * 2,
      params.depth - params.wallThickness * 2,
      params.height - params.wallThickness
    ],
    roundRadius: Math.max(0, params.roundRadius - params.wallThickness / 2),
    segments: 16
  }).translate([0, 0, params.wallThickness]);

  const box = outer
    .subtract(inner)
    .colorize(jf.colors.hexToRgb(params.color));

  console.log('✓ Parametric box created');
  console.log('Dimensions:', [params.width, params.depth, params.height]);
  console.log('Volume:', box.measureVolume().toFixed(2));

  return box;
};

module.exports = { main };
