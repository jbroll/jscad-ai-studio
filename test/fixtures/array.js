const jf = require("@jbroll/jscad-fluent");

const main = () => [jf.cube({ size: 5 }), jf.cube({ size: 5 }).translate([10, 0, 0])];

module.exports = { main };
