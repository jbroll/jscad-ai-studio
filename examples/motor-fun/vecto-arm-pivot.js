/**
 * vecto-arm-pivot
 *
 * Rotating platform with 15mm stud for 6002 bearing press-fit
 * Includes NEMA 17 motor mounted on platform
 */

const jf = require('@jbroll/jscad-fluent');
const nema17 = require('./nema17.js');
const bearing = require('./bearing.js');
const tyre608 = require('./tyre-608.js');
const trussClip = require('./vecto-truss-clip.js');
const capstanPart = require('./capstan.js');
const armPart = require('./arm.js');
const motorPlatformPart = require('./motor-platform.js');
const pivotStudPart = require('./pivot-stud.js');
const layout = require('./layout.js');

const main = (p) => {
  p._type = 'Vecto Arm Pivot';
  p.capstanOffset = { type: 'slider', default: layout.CLEARANCES.clipBarToCapstan, min: 0, max: 10, step: 0.5, label: 'Capstan Offset', live: true };

  // Create capstan first (initializes params needed for motor positioning)
  const capstan = capstanPart.capstan(p.capstan);
  const capstanRadius = p.capstan.radius + p.capstan.rimHeight;
  const capstanHeight = p.capstan.height;

  // Initialize platform params
  p.platform = p.platform || {};

  // Platform height must be initialized before we can calculate derived values
  // Call platform once to initialize its parameters
  motorPlatformPart.platform(p.platform);
  const platformHeight = p.platform.platformHeight;

  // Calculate motor Z position from platform height, capstan offset, and capstan radius
  const clipBarTop = platformHeight + layout.CLEARANCES.platformToClip + layout.CLIP.outerRadius;
  const motorZ = clipBarTop + p.capstanOffset + capstanRadius;

  // Shelf height is DERIVED from motor position - not user adjustable
  // shelfHeight = motorZ - motorFaceSize/2 - platformHeight
  const motorFaceSize = nema17.NEMA17.faceSize;
  const shelfHeight = motorZ - motorFaceSize / 2 - platformHeight;
  p.platform.shelfHeight = shelfHeight;  // pass calculated value

  // Create motor platform with calculated shelf height
  const motorPlatform = motorPlatformPart.platform(p.platform);

  // Pivot stud (separate for printability)
  const pivotStud = pivotStudPart.stud(p.stud);

  // Get motor for positioning (params already initialized by platform)
  const motor = nema17.motor(p.platform.motor);

  // Motor X position from shaft geometry
  const shaftTipOffset = nema17.NEMA17.bossHeight + p.platform.motor.shaftLength;
  const motorX = -shaftTipOffset + capstanHeight / 2;

  const motorPositioned = motor.map(part =>
    part
      .rotateY(Math.PI / 2)
      .translate([motorX, 0, motorZ])
  );

  const capstanPositioned = capstan
    .rotateY(Math.PI / 2)
    .translate([0, 0, motorZ]);

  // 608-2RS bearing - centerline aligned with dowel centerline (clipBarTop)
  const brg608Z = clipBarTop - bearing.BEARING_608.width / 2;

  // Position 608 bearing so tyre just touches the nearest dowel
  const dowelX = trussClip.TRUSS_CLIP.dowelSpacing / 2;
  const tyreGrooveBottomR = bearing.BEARING_608.outerDia / 2 + 2;
  const dowelRadius = trussClip.TRUSS_CLIP.dowelDiameter / 2;
  const brg608X = dowelX + tyreGrooveBottomR + dowelRadius;

  // Helper: create 608 bearing + tyre at position
  const bearingTyre608 = (brgParams, tyreParams, x, y) => {
    const brg = bearing.create(bearing.BEARING_608, brgParams);
    const tyre = tyre608.tyre(tyreParams);
    return [
      ...brg.map(part => part.translate([x, y, brg608Z])),
      tyre.translate([x, y, brg608Z])
    ];
  };

  // Three 608 bearing/tyre assemblies
  const brg608X_other = -brg608X;
  const motorYOffset = nema17.NEMA17.faceSize / 2 + 30;

  const bearingTyres = [
    ...bearingTyre608(p.bearing608, p.tyre608, brg608X, 0),
    ...bearingTyre608(p.bearing608upper, p.tyre608upper, brg608X_other, motorYOffset),
    ...bearingTyre608(p.bearing608lower, p.tyre608lower, brg608X_other, -motorYOffset)
  ];

  // 6002-2RS bearings - two bearings on stud below platform with spacer
  const bearingWidth = bearing.BEARING_6002.width;
  const spacerHeight = 0.1;

  const brg6002Lower = bearing.create(bearing.BEARING_6002,p.bearing6002);
  const brg6002LowerPositioned = brg6002Lower.map(part => part.translate([0, 0, -p.stud.studLength]));

  const spacer = jf.cylinder({
    outer: bearing.BEARING_6002.innerDia / 2 + 2,
    inner: bearing.BEARING_6002.innerDia / 2,
    height: spacerHeight
  })
    .translate([0, 0, -p.stud.studLength + bearingWidth + spacerHeight / 2])
    .colorize([0.5, 0.5, 0.55]);

  const brg6002Upper = bearing.create(bearing.BEARING_6002,p.bearing6002upper);
  const brg6002UpperPositioned = brg6002Upper.map(part =>
    part.translate([0, 0, -p.stud.studLength + bearingWidth + spacerHeight])
  );

  // Arm assembly - two parallel dowels with clips
  const armAssembly = armPart.arm(p.arm);
  const armComponents = armAssembly.map(part =>
    part.translate([0, 0, clipBarTop])
  );

  return [
    motorPlatform,
    pivotStud,
    motorPositioned,
    capstanPositioned,
    bearingTyres,
    brg6002LowerPositioned,
    spacer,
    brg6002UpperPositioned,
    armComponents
  ].flat(2);
};

module.exports = { main };
