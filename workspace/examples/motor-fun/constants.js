/**
 * Shared hardware constants
 *
 * Common fastener dimensions used across multiple models.
 */

// 1/4-20 UNC hardware dimensions (mm)
const QUARTER_TWENTY = {
  boltDia: 6.35,           // 1/4" nominal
  boltClearance: 6.75,     // clearance hole
  nutAcrossFlats: 11.11,   // 7/16"
  nutThickness: 5.56,      // 7/32"
  headDia: 12.7            // 1/2" flathead diameter
};

module.exports = { QUARTER_TWENTY };
