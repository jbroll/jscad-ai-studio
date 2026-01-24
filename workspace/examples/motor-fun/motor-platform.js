/**
 * Motor Platform
 *
 * Rotating platform with motor mounting frame and 608 bearing posts.
 * Pivot stud is separate (pivot-stud.js) for printability.
 *
 * Usage in other models:
 *   const motorPlatform = require('./motor-platform.js');
 *   const platform = motorPlatform.platform(params.platform);
 */

const jf = require('@jbroll/jscad-fluent');
const nema17 = require('./nema17.js');
const bearing = require('./bearing.js');
const trussClip = require('./vecto-truss-clip.js');
const { QUARTER_TWENTY } = require('./constants.js');
const layout = require('./layout.js');

const platform = (p) => {
  p._type = 'Motor Platform';
  p.platformHeight = { type: 'slider', default: 8, min: 4, max: 15, step: 1, label: 'Platform Height', live: true };
  p.shelfHeight = { type: 'slider', default: 6, min: 0, max: 15, step: 0.5, label: 'Shelf Height', live: true };
  p.frameWall = { type: 'slider', default: 2.5, min: 2, max: 5, step: 0.5, label: 'Frame Wall', live: true };

  // Get motor dimensions (initializes params)
  nema17.motor(p.motor);

  // Motor position calculations from shelfHeight parameter
  // shelfHeight determines motor bottom Z, everything else flows from that
  const motorFaceSize = nema17.NEMA17.faceSize;
  const boltSpacing = nema17.NEMA17.boltSpacing;
  const boltOffset = boltSpacing / 2;

  // Motor Z position derived from shelf height
  const motorBottomZ = p.platformHeight + p.shelfHeight;
  const motorZ = motorBottomZ + motorFaceSize / 2;

  // Motor X position from shaft geometry
  const shaftTipOffset = nema17.NEMA17.bossHeight + p.motor.shaftLength;
  const capstanDims = layout.defaultCapstan();  // only for X positioning
  const motorX = -shaftTipOffset + capstanDims.height / 2;
  const motorBackX = motorX - p.motor.stackHeight;

  // Frame dimensions derived from motor position
  const bottomBoltZ = motorZ - boltOffset;
  const frameTopZ = bottomBoltZ + layout.FRAME.boltHeadDia / 2 + layout.FRAME.boltHeadClearance;
  const frameBottomZ = p.platformHeight - layout.FRAME.roundRadius;
  const frameHeight = frameTopZ - frameBottomZ;

  // Clip bar position (for bearing posts)
  const clipBarTop = p.platformHeight + layout.CLEARANCES.platformToClip + layout.CLIP.outerRadius;

  // 608 bearing post positions (needed for platform shape)
  const dowelX = trussClip.TRUSS_CLIP.dowelSpacing / 2;
  const tyreGrooveBottomR = bearing.BEARING_608.outerDia / 2 + 2;
  const dowelRadius = trussClip.TRUSS_CLIP.dowelDiameter / 2;
  const brg608X = dowelX + tyreGrooveBottomR + dowelRadius;
  const brg608X_other = -brg608X;
  const motorYOffset = motorFaceSize / 2 + 30;

  // Post dimensions
  const postStudDia = bearing.BEARING_608.innerDia;
  const postBaseOversize = 1;

  // Platform shape: hull of 5 cylinders under structural components
  const oversize = 5;  // mm oversize from shadowed component
  // Bearing support cylinders sized to cover 608 bearing + tyre assembly
  const tyreOuterRadius = bearing.BEARING_608.outerDia / 2 + 6;  // ~17mm
  const postSupportRadius = tyreOuterRadius + oversize;
  // Motor corner cylinders - smaller, about half
  const motorCornerRadius = (tyreOuterRadius + oversize) / 2;

  // Motor frame back corners
  const backCornerX = motorBackX - p.frameWall;
  const backCornerY = motorFaceSize / 2 + p.frameWall;

  // 5 rounded support cylinders
  const roundRadius = 2;  // edge rounding
  const createSupportCyl = (x, y, radius) => {
    return jf.roundedCylinder({ radius: radius, height: p.platformHeight, roundRadius: roundRadius })
      .translate([x, y, p.platformHeight / 2]);
  };

  const supportCyl1 = createSupportCyl(brg608X, 0, postSupportRadius);
  const supportCyl2 = createSupportCyl(brg608X_other, motorYOffset, postSupportRadius);
  const supportCyl3 = createSupportCyl(brg608X_other, -motorYOffset, postSupportRadius);
  const supportCyl4 = createSupportCyl(backCornerX, backCornerY, motorCornerRadius);
  const supportCyl5 = createSupportCyl(backCornerX, -backCornerY, motorCornerRadius);

  // Hull using append pattern: cyl1.append(cyl2).append(cyl3)...hull()
  const platformDiscSolid = supportCyl1
    .append(supportCyl2)
    .append(supportCyl3)
    .append(supportCyl4)
    .append(supportCyl5)
    .hull();

  // Center 1/4-20 bolt hole with flathead countersink
  const centerBoltHole = jf.cylinder({ radius: QUARTER_TWENTY.boltClearance / 2, height: p.platformHeight + 1 })
    .translateZ(p.platformHeight / 2);
  const countersinkAngle = 82 * Math.PI / 180;  // 82° American flathead
  const countersinkDepthCenter = (QUARTER_TWENTY.headDia / 2 - QUARTER_TWENTY.boltClearance / 2) / Math.tan(countersinkAngle / 2);
  const centerCountersink = jf.cylinder({
    radius: [QUARTER_TWENTY.boltClearance / 2, QUARTER_TWENTY.headDia / 2],
    height: countersinkDepthCenter
  }).translateZ(p.platformHeight - countersinkDepthCenter / 2);

  const platformDisc = platformDiscSolid.subtract(centerBoltHole, centerCountersink);

  // Bolt hole dimensions (boltOffset already calculated above)
  const boltHoleDia = 3.2;  // M3 clearance
  const boltHeadDia = layout.FRAME.boltHeadDia;
  const countersinkDepth = 1.2;  // depth of countersink

  // Frame geometry
  const frameRoundRadius = layout.FRAME.roundRadius;
  const frameArmZ = (frameBottomZ + frameTopZ) / 2;

  // Motor body position after rotation
  const motorFrontX = motorX;  // shaft/boss side

  // Side arms - run along X from back to front of motor
  const armDepth = p.motor.stackHeight + p.frameWall * 2;
  const armWidth = p.frameWall;
  const armY = motorFaceSize / 2 + armWidth / 2;
  const armX = (motorFrontX + motorBackX) / 2;
  const sideArm = jf.roundedCuboid({ size: [armDepth, armWidth, frameHeight], roundRadius: frameRoundRadius });
  const leftArm = sideArm.translate([armX, -armY, frameArmZ]);
  const rightArm = sideArm.translate([armX, armY, frameArmZ]);

  // Front bar - at shaft side (+X)
  const frontBarX = motorFrontX + p.frameWall / 2;
  const frontBar = jf.roundedCuboid({
    size: [p.frameWall, motorFaceSize + p.frameWall * 2, frameHeight],
    roundRadius: frameRoundRadius
  }).translate([frontBarX, 0, frameArmZ]);

  // Back bar - behind motor (-X)
  const backBarX = motorBackX - p.frameWall / 2;
  const backBar = jf.roundedCuboid({
    size: [p.frameWall, motorFaceSize + p.frameWall * 2, frameHeight],
    roundRadius: frameRoundRadius
  }).translate([backBarX, 0, frameArmZ]);

  // Motor shelf - ledge around inside of frame for motor to sit on
  // shelfHeight is a parameter (set by parent from capstan size, or standalone slider)
  const shelfLip = 5;  // width of shelf ledge

  // Create shelf as outer minus inner (hollow rectangle ledge)
  const shelfOuter = jf.cuboid({
    size: [p.motor.stackHeight, motorFaceSize, p.shelfHeight]
  });
  const shelfInner = jf.cuboid({
    size: [p.motor.stackHeight - shelfLip * 2, motorFaceSize - shelfLip * 2, p.shelfHeight + 1]
  });
  const shelf = shelfOuter.subtract(shelfInner)
    .translate([motorX - p.motor.stackHeight / 2, 0, p.platformHeight + p.shelfHeight / 2]);

  // Circular hole through platform inscribed by shelf inner opening, with rounded edges
  const holeRoundRadius = 2;  // fillet radius for hole edges
  const holeRadius = Math.min(p.motor.stackHeight - shelfLip * 2, motorFaceSize - shelfLip * 2) / 2;
  const holeX = motorX - p.motor.stackHeight / 2;

  // Subtract large hole, add back tori at edges and pipe between them
  // Torus outerRadius = holeRadius so torus outer edge = holeRadius + holeRoundRadius (matches hole)
  const platformHoleCyl = jf.cylinder({ radius: holeRadius, height: p.platformHeight + 1 })
    .translate([holeX, 0, p.platformHeight / 2]);

  // Torus at top edge - creates rounded fillet
  const topTorus = jf.torus({
    innerRadius: holeRoundRadius,
    outerRadius: holeRadius
  }).translate([holeX, 0, p.platformHeight - holeRoundRadius]);

  // Torus at bottom edge
  const bottomTorus = jf.torus({
    innerRadius: holeRoundRadius,
    outerRadius: holeRadius
  }).translate([holeX, 0, holeRoundRadius]);

  // Pipe between tori to complete the hole wall
  const middlePipe = jf.cylinder({
    outer: holeRadius,
    inner: holeRadius - holeRoundRadius,
    height: p.platformHeight - 2 * holeRoundRadius
  }).translate([holeX, 0, p.platformHeight / 2]);

  const roundedHoleFiller = jf.union(topTorus, bottomTorus, middlePipe);

  const frame = jf.union(leftArm, rightArm, frontBar, backBar, shelf);

  // 4 mounting bolt holes with countersinks
  const frontOuterX = frontBarX + p.frameWall / 2;
  const backOuterX = backBarX - p.frameWall / 2;

  const createFrontBoltHole = (y) => {
    const shaft = jf.cylinder({ radius: boltHoleDia / 2, height: p.frameWall * 2 })
      .rotateY(Math.PI / 2)
      .translate([frontBarX, y, bottomBoltZ]);
    const csink = jf.cylinder({ radius: [boltHoleDia / 2, boltHeadDia / 2], height: countersinkDepth })
      .rotateY(Math.PI / 2)
      .translate([frontOuterX - countersinkDepth / 2, y, bottomBoltZ]);
    return shaft.union(csink);
  };

  const createBackBoltHole = (y) => {
    const shaft = jf.cylinder({ radius: boltHoleDia / 2, height: p.frameWall * 2 })
      .rotateY(Math.PI / 2)
      .translate([backBarX, y, bottomBoltZ]);
    const csink = jf.cylinder({ radius: [boltHeadDia / 2, boltHoleDia / 2], height: countersinkDepth })
      .rotateY(Math.PI / 2)
      .translate([backOuterX + countersinkDepth / 2, y, bottomBoltZ]);
    return shaft.union(csink);
  };

  const boltHoles = jf.union(
    createFrontBoltHole(boltOffset),
    createFrontBoltHole(-boltOffset),
    createBackBoltHole(boltOffset),
    createBackBoltHole(-boltOffset)
  );

  const motorMount = frame.subtract(boltHoles);

  // 608 bearing posts - studs that hold the 608 bearings for tyre drive
  const dowelCenterZ = clipBarTop;  // same as platformHeight + 2 + 6
  const brg608Z = dowelCenterZ - bearing.BEARING_608.width / 2;

  // Post snap dimensions
  const postSnapHeight = 0.25;
  const postSnapInset = 0.25;

  // Base dimensions for bearing posts - 25° taper from vertical
  const taperAngle = 25 * Math.PI / 180;  // 25° in radians
  const baseHeight = brg608Z - p.platformHeight;
  const baseTopRadius = postStudDia / 2 + postBaseOversize;  // narrower at bearing
  const baseTaper = baseHeight * Math.tan(taperAngle);
  const baseBottomRadius = baseTopRadius + baseTaper;  // wider at platform

  // Holes under bearing posts - same 25° taper angle, 3mm smaller at top
  const holeHeight = brg608Z + 1;  // from bottom of platform to just past top of base
  const holeTopRadius = baseTopRadius - 3;
  const holeTaper = holeHeight * Math.tan(taperAngle);
  const holeBottomRadius = holeTopRadius + holeTaper;

  const createBearingPostHole = (x, y) => {
    return jf.cylinder({ radius: [holeBottomRadius, holeTopRadius], height: holeHeight })
      .translate([x, y, holeHeight / 2]);
  };

  const bearingPostHoles = jf.union(
    createBearingPostHole(brg608X, 0),
    createBearingPostHole(brg608X_other, motorYOffset),
    createBearingPostHole(brg608X_other, -motorYOffset)
  );

  // Combine platform and motor mount, subtract platform hole and bearing post holes
  // Add tori and pipe to create smooth fillet edges on the hole
  const combined = platformDisc
    .subtract(platformHoleCyl)
    .union(roundedHoleFiller)
    .subtract(bearingPostHoles)
    .union(motorMount)
    .colorize([0.3, 0.6, 0.8]);

  const createBearingPost = (x, y) => {
    const brgWidth = bearing.BEARING_608.width;
    const studHeight = brgWidth + postSnapHeight;

    const base = jf.cylinder({ radius: [baseBottomRadius, baseTopRadius], height: baseHeight })
      .translateZ(p.platformHeight + baseHeight / 2);
    const postStud = jf.cylinder({ radius: postStudDia / 2, height: studHeight })
      .translateZ(brg608Z + studHeight / 2);
    const snapLip = jf.cylinder({ radius: postStudDia / 2 + postSnapInset, height: postSnapHeight })
      .translateZ(brg608Z + brgWidth + postSnapHeight / 2);

    return jf.union(base, postStud, snapLip).translate([x, y, 0]);
  };

  return combined.union(
    createBearingPost(brg608X, 0),
    createBearingPost(brg608X_other, motorYOffset),
    createBearingPost(brg608X_other, -motorYOffset)
  );
};

// Standalone main for viewing this model directly
const main = (p) => platform(p);

module.exports = { main, platform };
