const jf = require("@jbroll/jscad-fluent");

const main = () => jf.cylinder({ outer: 10, inner: 5, height: 10 }).translateZ(5);

module.exports = { main };
