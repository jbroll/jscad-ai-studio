const jf = require("@jbroll/jscad-fluent");

// 0 plate with a hole, 1 pin 0.1 mm oversize in the hole, 2 block resting on the plate,
// 3 block sunk 3 mm into the plate, 4 cube inside 5 a tube without touching it.
const main = () => [
  jf
    .cuboid({ size: [20, 20, 5], center: [0, 0, 2.5] })
    .subtract(jf.cylinder({ radius: 4, height: 6, segments: 32, center: [0, 0, 2.5] })),
  jf.cylinder({ radius: 4.1, height: 10, segments: 32, center: [0, 0, 5] }),
  jf.cuboid({ size: [4, 4, 2], center: [8, 8, 6] }),
  jf.cuboid({ size: [4, 4, 4], center: [-8, -8, 4] }),
  jf.cube({ size: 2, center: [0, 0, -3] }),
  jf.cylinder({ outer: 5, inner: 3, height: 2, segments: 32, center: [0, 0, -3] }),
];

module.exports = { main };
