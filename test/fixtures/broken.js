const jf = require("@jbroll/jscad-fluent");
const main = (p) => {
  p.size = { type: "slider", default: 10, min: 5, max: 20 };
  return jf.cube({ size: p.size }).nonExistentMethod();
};
module.exports = { main };
