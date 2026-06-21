const jf = require("@jbroll/jscad-fluent");

const main = (p) => {
  p._type = "Cube";
  p.size = { type: "slider", default: 10, min: 5, max: 20, step: 1, label: "Size", live: true };
  return jf.cube({ size: p.size });
};

module.exports = { main };
