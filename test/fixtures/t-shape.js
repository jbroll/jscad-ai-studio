const jf = require("@jbroll/jscad-fluent");

// A 10 mm stem under a 30 mm bar, 10 mm deep. The bar's underside is flat, or with
// chamfer a 45 degree slope from the stem out to the bar's edges.
const main = (p) => {
  p.chamfer = { type: "checkbox", default: false };
  const profile = p.chamfer
    ? [[-5, 0], [5, 0], [5, 10], [15, 20], [15, 25], [-15, 25], [-15, 20], [-5, 10]]
    : [[-5, 0], [5, 0], [5, 20], [15, 20], [15, 25], [-15, 25], [-15, 20], [-5, 20]];
  return jf.polygon(profile).extrudeLinear({ height: 10 }).rotateX(Math.PI / 2);
};

module.exports = { main };
