const jf = require("@jbroll/jscad-fluent");

const AXIS = { axis: { origin: [0, 0, 0], z: [0, 0, 1] } };

const main = (p) => {
  p.pinShift = { type: "slider", default: 0, min: -5, max: 5, step: 0.5, label: "Pin shift" };
  const cutter = jf
    .cylinder({ radius: 3, height: 10, segments: 32 })
    .withAnchors(AXIS)
    .translate([6, 2, 0]);
  const plate = jf.cuboid({ size: [30, 20, 5] }).subtract(cutter, { carry: { bolt1: cutter } });
  const pin = jf
    .cylinder({ radius: 2.9, height: 12, segments: 32 })
    .withAnchors(AXIS)
    .attachTo(plate, "bolt1.axis", "axis")
    .translate([p.pinShift, 0, 0]);
  return [plate, pin];
};

module.exports = { main };
