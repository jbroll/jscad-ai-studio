const jf = require("@jbroll/jscad-fluent");

const main = () => jf.cube({ size: 10 }).union(jf.cube({ size: 10 }).translate([5, 5, 5]));

module.exports = { main };
