/**
 * Layout calculations for motor/capstan positioning
 *
 * The capstan radius drives the motor shelf height, which in turn
 * determines motor Z position, frame height, and bolt positions.
 *
 * Shared by motor-platform.js and vecto-arm-pivot.js.
 */

const nema17 = require('./nema17.js');
const capstan = require('./capstan.js');

// Assembly clearances (mm)
const CLEARANCES = {
  platformToClip: 2,      // gap between platform top and clip bottom
  clipBarToCapstan: 2     // gap between clip bar top and capstan
};

// Clip geometry (derived from vecto-truss-clip defaults)
const CLIP = {
  outerRadius: 12 / 2     // clipOuterDiameter / 2
};

// Motor frame constants
const FRAME = {
  boltHeadDia: 5.5,       // M3 flathead head diameter
  boltHeadClearance: 1,   // clearance above bolt head
  roundRadius: 1          // frame corner rounding (buried in platform)
};

/**
 * Calculate motor/capstan positions
 * @param {Object} opts - { platformHeight, shaftLength, stackHeight, capstanHeight, capstanRadius }
 * @returns {Object} - positions and dimensions for motor mounting
 *
 * Flow: capstanRadius → shelfHeight → motorZ → frame dimensions
 */
const motorPosition = (opts) => {
  const motorFaceSize = nema17.NEMA17.faceSize;
  const boltSpacing = nema17.NEMA17.boltSpacing;

  // Clip bar top position (arm centerline)
  const clipBarTop = opts.platformHeight + CLEARANCES.platformToClip + CLIP.outerRadius;

  // Motor centerline Z - capstan must clear clip bar
  const motorZ = clipBarTop + CLEARANCES.clipBarToCapstan + opts.capstanRadius;

  // Shelf height - gap between platform and motor bottom (derived from capstan size)
  const shelfHeight = motorZ - motorFaceSize / 2 - opts.platformHeight;

  // Motor X position - shaft tip at capstan center
  const shaftTipOffset = nema17.NEMA17.bossHeight + opts.shaftLength;
  const motorX = -shaftTipOffset + opts.capstanHeight / 2;
  const motorBackX = motorX - opts.stackHeight;

  // Frame dimensions - derived from motor position
  const boltOffset = boltSpacing / 2;
  const bottomBoltZ = motorZ - boltOffset;
  const frameTopZ = bottomBoltZ + FRAME.boltHeadDia / 2 + FRAME.boltHeadClearance;
  const frameBottomZ = opts.platformHeight - FRAME.roundRadius;
  const frameHeight = frameTopZ - frameBottomZ;

  return {
    // Positions
    motorX,
    motorZ,
    motorBackX,
    clipBarTop,
    // Shelf
    shelfHeight,
    // Frame
    bottomBoltZ,
    frameHeight,
    frameBottomZ,
    frameTopZ
  };
};

/**
 * Get default capstan dimensions from capstan.js
 */
const defaultCapstan = () => ({
  height: capstan.CAPSTAN.height,
  radius: capstan.CAPSTAN.radius + capstan.CAPSTAN.rimHeight
});

module.exports = { motorPosition, defaultCapstan, CLEARANCES, CLIP, FRAME };
