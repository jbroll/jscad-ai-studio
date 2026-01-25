/**
 * Capstan for cable/line drive
 *
 * Crowned (convex) profile helps line self-center.
 * Rims on both ends contain the wraps.
 *
 * Usage in other models:
 *   const capstan = require('./capstan.js');
 *   const cap = capstan.capstan(params.capstan);
 */

const jf = require('@jbroll/jscad-fluent');
const nema17 = require('./nema17.js');

// Capstan dimensions (mm)
const CAPSTAN = {
  radius: 16,
  height: 10,
  rimHeight: 1,
  rimWidth: 1,
  crownHeight: 0.15  // slight crown for line self-centering
};

const capstan = (p) => {
  p._type = 'Capstan';
  p.radius = { type: 'slider', default: CAPSTAN.radius, min: 10, max: 25, step: 0.5, label: 'Radius', live: true };
  p.height = { type: 'slider', default: CAPSTAN.height, min: 6, max: 20, step: 1, label: 'Height', live: true };
  p.rimHeight = { type: 'slider', default: CAPSTAN.rimHeight, min: 0.5, max: 2, step: 0.25, label: 'Rim Height', live: true };
  p.rimWidth = { type: 'slider', default: CAPSTAN.rimWidth, min: 0.5, max: 2, step: 0.25, label: 'Rim Width', live: true };
  p.crownHeight = { type: 'slider', default: CAPSTAN.crownHeight, min: 0, max: 0.5, step: 0.05, label: 'Crown Height', live: true };
  p.boreDia = { type: 'slider', default: 5, min: 0, max: 8, step: 0.5, label: 'Bore Diameter', live: true };
  p.dBore = { type: 'choice', default: 'yes', options: ['yes', 'no'], label: 'D-Bore (for shaft flat)' };

  // Create crowned profile using segments
  const segments = 16;
  const profile = [];
  const innerWidth = p.height - 2 * p.rimWidth;  // width between rims

  // Build profile points (in XZ plane, will be revolved around Z)
  // Start at bore, go out to rim, across crowned surface, back to rim, back to bore
  const boreR = p.boreDia / 2;
  const baseR = p.radius;
  const rimR = p.radius + p.rimHeight;
  const halfHeight = p.height / 2;
  const halfInner = innerWidth / 2;

  // Bottom face (at z = -halfHeight)
  if (boreR > 0) {
    profile.push([boreR, -halfHeight]);
  } else {
    profile.push([0.1, -halfHeight]);  // small center point if no bore
  }
  profile.push([rimR, -halfHeight]);

  // Bottom rim outer edge
  profile.push([rimR, -halfHeight + p.rimWidth]);

  // Crowned surface - convex arc from bottom rim to top rim
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;  // 0 to 1
    // Parabolic crown: highest at center (t=0.5)
    const crown = p.crownHeight * (1 - Math.pow(2 * t - 1, 2));
    const r = baseR + crown;
    profile.push([r, -halfInner + t * innerWidth]);
  }

  // Top rim outer edge
  profile.push([rimR, halfHeight - p.rimWidth]);

  // Top face
  profile.push([rimR, halfHeight]);
  if (boreR > 0) {
    profile.push([boreR, halfHeight]);
  } else {
    profile.push([0.1, halfHeight]);
  }

  // Revolve profile to create capstan
  const capstanBody = jf.polygon(profile)
    .extrudeRotate({ segments: 48 });

  // D-bore key: ridge that engages with shaft flat
  // Shaft flat is at NEMA17.shaftFlat/2 from center (2.25mm for 5mm shaft)
  // Key fills space from flat distance to bore radius
  if (p.dBore === 'yes' && boreR > 0) {
    const flatDist = nema17.NEMA17.shaftFlat / 2;  // 2.25mm
    const keyDepth = boreR - flatDist;  // how much key protrudes into bore
    const keyWidth = Math.sqrt(boreR * boreR - flatDist * flatDist) * 2;  // chord width at flat
    const key = jf.cuboid({ size: [keyDepth, keyWidth, p.height] })
      .translate([flatDist + keyDepth / 2, 0, 0]);
    return capstanBody.union(key).colorize([1.0, 0.85, 0.1]);
  }

  return capstanBody.colorize([1.0, 0.85, 0.1]);
};

// Standalone main for viewing this model directly
const main = (p) => capstan(p);

module.exports = { main, capstan, CAPSTAN };
