const jf = require("@jbroll/jscad-fluent");
const main = () => [
  jf.cube({ size: 10 }),
  jf.sphere({ radius: 3 }).translate([20, 0, 0]),
];
module.exports = { main };
