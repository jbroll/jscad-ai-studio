/**
 * Tyre for 608 Bearing
 *
 * Fits over 608 bearing OD (22mm) with concave groove for 5/16" dowel.
 * Can be used standalone or required by other models.
 *
 * Usage in other models:
 *   const tyre608 = require('./tyre-608.js');
 *   const tyre = tyre608.tyre(params.tyre);
 */

const jf = require('@jbroll/jscad-fluent');
const bearing = require('./bearing.js');

// Tyre dimensions (mm)
const TYRE_608 = {
  innerDia: bearing.BEARING_608.outerDia,  // 22mm - fits over 608 OD
  dowelDia: 25.4 * 5/16,  // 5/16" = 7.9375mm
  wallThickness: 2,       // base wall before groove
  width: 6                // slightly less than bearing width
};

const tyre = (p) => {
  p._type = '608 Tyre';
  p.thickness = { type: 'slider', default: TYRE_608.wallThickness, min: 1.5, max: 4, step: 0.5, label: 'Wall Thickness', live: true };
  p.width = { type: 'slider', default: TYRE_608.width, min: 4, max: 8, step: 0.5, label: 'Width', live: true };
  p.grooveRadius = { type: 'slider', default: TYRE_608.dowelDia / 2, min: 2, max: 6, step: 0.25, label: 'Groove Radius', live: true };
  p.edgeRadius = { type: 'slider', default: 1, min: 0.5, max: 2, step: 0.25, label: 'Edge Radius', live: true };
  p.lipHeight = { type: 'slider', default: 0.5, min: 0.25, max: 2, step: 0.25, label: 'Retention Lip Height', live: true };
  p.lipInset = { type: 'slider', default: 0.75, min: 0.25, max: 3, step: 0.25, label: 'Retention Lip Inset', live: true };

  const innerR = TYRE_608.innerDia / 2;
  const outerR = innerR + p.thickness + p.grooveRadius;
  const bearingWidth = bearing.BEARING_608.width;  // 7mm

  // Base tyre - hollow cylinder (outer, thin section)
  const baseTyre = jf.cylinder({ radius: outerR, height: p.width })
    .subtract(jf.cylinder({ radius: innerR, height: p.width + 1 }))
    .translateZ(p.width / 2);

  // Concave groove - subtract a torus from outer edge
  const grooveTorus = jf.torus({
    innerRadius: p.grooveRadius,
    outerRadius: outerR,
    innerSegments: 32,
    outerSegments: 48
  }).translateZ(p.width / 2);

  // Edge chamfers - small tori to round off the sharp outer edges
  const edgeTorus = jf.torus({
    innerRadius: p.edgeRadius,
    outerRadius: outerR,
    innerSegments: 16,
    outerSegments: 48
  });
  const topEdge = edgeTorus.translateZ(p.width - p.edgeRadius);
  const bottomEdge = edgeTorus.translateZ(p.edgeRadius);

  // Inner fatter cylinder - wider section at inner radius to engage bearing
  const innerFatR = innerR + p.thickness * 0.6;  // slightly smaller than full thickness
  const innerFatWidth = bearingWidth;  // matches bearing width
  const innerFatCylinder = jf.cylinder({ radius: innerFatR, height: innerFatWidth })
    .subtract(jf.cylinder({ radius: innerR, height: innerFatWidth + 1 }))
    .translateZ(innerFatWidth / 2);

  // Retention lips - wrap over bearing faces to capture it
  const lipOuterR = innerR;
  const lipInnerR = innerR - p.lipInset;
  const lip = jf.cylinder({ radius: lipOuterR, height: p.lipHeight })
    .subtract(jf.cylinder({ radius: lipInnerR, height: p.lipHeight + 1 }));
  const topLip = lip.translateZ(innerFatWidth - p.lipHeight / 2);
  const bottomLip = lip.translateZ(p.lipHeight / 2);

  const tyreShape = baseTyre
    .subtract(grooveTorus)
    .subtract(topEdge)
    .subtract(bottomEdge)
    .union(innerFatCylinder)
    .union(topLip)
    .union(bottomLip)
    .colorize([0.2, 0.2, 0.2]);

  return tyreShape;
};

// Standalone main for viewing this model directly
const main = (p) => tyre(p);

module.exports = { main, tyre, TYRE_608 };
