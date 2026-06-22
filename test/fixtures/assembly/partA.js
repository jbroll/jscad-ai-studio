const jf = require("@jbroll/jscad-fluent");
const partB = require("./partB.js");
module.exports = { widget: () => jf.cube({ size: 6 }).union(partB.knob().translate([5, 0, 0])) };
