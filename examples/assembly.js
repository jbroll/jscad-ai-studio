/**
 * Multi-part assembly example
 */
const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'Assembly';
  p.baseSize = { type: 'slider', default: 30, min: 20, max: 50, label: 'Base Size', live: true };
  p.postHeight = { type: 'slider', default: 25, min: 10, max: 40, label: 'Post Height', live: true };
  p.postRadius = { type: 'slider', default: 4, min: 2, max: 8, label: 'Post Radius', live: true };

  // Base plate with rounded corners
  const base = jf.roundedCuboid({
    size: [p.baseSize, p.baseSize, 5],
    roundRadius: 2
  }).colorize([0.3, 0.3, 0.4]);

  // Corner posts
  const offset = p.baseSize / 2 - p.postRadius - 2;
  const post = jf.cylinder({ radius: p.postRadius, height: p.postHeight })
    .translateZ(2.5);

  const posts = jf.union(
    post.translate([offset, offset, 0]),
    post.translate([-offset, offset, 0]),
    post.translate([offset, -offset, 0]),
    post.translate([-offset, -offset, 0])
  ).colorize([0.7, 0.3, 0.3]);

  // Top plate
  const top = jf.roundedCuboid({
    size: [p.baseSize, p.baseSize, 3],
    roundRadius: 2
  }).translateZ(p.postHeight + 2.5).colorize([0.3, 0.5, 0.7]);

  return [base, posts, top];
};

module.exports = { main };
