const jf = require("@jbroll/jscad-fluent");
const main = () => {
  const block = require("./cube.scad"); // FluentGeom3 (10mm cube, uncentered 0..10)
  return jf.cube({ size: 4 }).translate([20, 0, 0]).union(block);
};
module.exports = { main };
