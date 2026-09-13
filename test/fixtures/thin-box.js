const jf = require("@jbroll/jscad-fluent");

// An open-top cup with 0.5 mm side walls and a 1 mm floor.
const main = () =>
  jf
    .cuboid({ size: [20, 20, 10], center: [0, 0, 5] })
    .subtract(jf.cuboid({ size: [19, 19, 10], center: [0, 0, 6] }));

module.exports = { main };
