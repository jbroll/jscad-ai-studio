const jf = require("@jbroll/jscad-fluent");
const main = (p) => {
  p.w = { type: "slider", default: 30, min: 10, max: 50 };
  return jf.rectangle({ size: [p.w, p.w] });
};
module.exports = { main };
