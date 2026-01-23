/**
 * Default Workspace Model
 *
 * This is the default model in your workspace.
 * Edit this file or create new models using: npm run new <name>
 *
 * Expected output: A cube with a spherical hole
 */

const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Create a cube with a spherical cutout
  const model = jf.cube({ size: 10 })
    .subtract(jf.sphere({ radius: 6.8 }))
    .colorize([0.65, 0.25, 0.8]);

  // Log measurements for verification
  console.log('✓ Model generated successfully');
  console.log('Volume:', model.measureVolume().toFixed(2));
  console.log('Dimensions:', model.measureDimensions());
  console.log('Bounding Box:', model.measureBoundingBox());

  return model;
};

module.exports = { main };
