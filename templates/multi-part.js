/**
 * [Model Name]
 *
 * Multi-part assembly with multiple objects.
 *
 * Expected output: Describe what the assembly should look like
 */

const jf = require('@jbroll/jscad-fluent');

// Helper function to create a part
const createPart = (position, color) => {
  return jf.cube({ size: 8 })
    .translate(position)
    .colorize(color);
};

const main = () => {
  // Create multiple parts
  const part1 = createPart([0, 0, 0], [0.8, 0.2, 0.2]);
  const part2 = createPart([12, 0, 0], [0.2, 0.8, 0.2]);
  const part3 = createPart([6, 10, 0], [0.2, 0.2, 0.8]);

  console.log('✓ Assembly created with 3 parts');

  // Return array of parts
  return [part1, part2, part3];
};

module.exports = { main };
