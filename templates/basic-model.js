/**
 * [Model Name]
 *
 * Description: Add your description here
 *
 * Expected output: Describe what the model should look like
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Create your model here
  const model = jf.cube({ size: 10 })
    .colorize([0.6, 0.6, 0.8]);

  // Log measurements for verification
  console.log('✓ Model generated');
  console.log('Volume:', model.measureVolume());
  console.log('Dimensions:', model.measureDimensions());

  return model;
};

module.exports = { main };
