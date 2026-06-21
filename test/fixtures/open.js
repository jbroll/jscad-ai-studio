const jf = require("@jbroll/jscad-fluent");
const main = () => jf.polyhedron({
  points: [[0, 0, 0], [10, 0, 0], [0, 10, 0]],
  faces: [[0, 1, 2]],
});
module.exports = { main };
