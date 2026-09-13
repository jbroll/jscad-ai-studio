const jf = require("@jbroll/jscad-fluent");

const main = () =>
  jf
    .cuboid({ size: [20, 20, 5] })
    .subtract(jf.cylinder({ radius: 4, height: 6, segments: 32 }));

module.exports = { main };
