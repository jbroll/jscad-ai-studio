/**
 * Arm assembly - dual dowel truss structure
 *
 * Two parallel 5/16" dowels connected by clips at regular intervals.
 *
 * Usage in other models:
 *   const arm = require('./arm.js');
 *   const armAssembly = arm.arm(params.arm);
 */

const jf = require('@jbroll/jscad-fluent');
const trussClip = require('./vecto-truss-clip.js');

// Arm dimensions (mm)
const ARM = {
  length: 24 * 25.4,        // 24" = 609.6mm
  clipSpacing: 12 * 25.4,   // 12" = 304.8mm center to center
  dowelDia: trussClip.TRUSS_CLIP.dowelDiameter,    // 5/16" = 7.94mm
  dowelSpacing: trussClip.TRUSS_CLIP.dowelSpacing  // 1" = 25.4mm
};

const arm = (p) => {
  p._type = 'Arm Assembly';
  p.length = { type: 'slider', default: ARM.length, min: 200, max: 1000, step: 10, label: 'Arm Length (mm)', live: true };
  p.clipSpacing = { type: 'slider', default: ARM.clipSpacing, min: 100, max: 400, step: 10, label: 'Clip Spacing (mm)', live: true };

  const dowelDia = ARM.dowelDia;
  const dowelSpacing = ARM.dowelSpacing;

  // Calculate number of clips based on arm length and clip spacing
  // Clips at both ends plus intermediate clips
  const numClips = Math.max(2, Math.floor(p.length / p.clipSpacing) + 1);
  const actualClipSpacing = p.length / (numClips - 1);

  // Two parallel dowels running along Y axis, spaced in X
  const dowel1 = jf.cylinder({ radius: dowelDia / 2, height: p.length, segments: 24 })
    .rotateX(Math.PI / 2)
    .translate([-dowelSpacing / 2, 0, 0])
    .colorize([0.85, 0.75, 0.6]);  // wood color

  const dowel2 = jf.cylinder({ radius: dowelDia / 2, height: p.length, segments: 24 })
    .rotateX(Math.PI / 2)
    .translate([dowelSpacing / 2, 0, 0])
    .colorize([0.85, 0.75, 0.6]);

  // Create clips at regular intervals
  // Clips are centered along Y axis from -length/2 to +length/2
  const clips = [];
  const startY = -p.length / 2;
  for (let i = 0; i < numClips; i++) {
    const clipY = startY + i * actualClipSpacing;
    const clip = trussClip.clip(p.clip).translate([0, clipY, 0]);
    clips.push(clip);
  }

  return [dowel1, dowel2, ...clips];
};

// Standalone main for viewing this model directly
const main = (p) => arm(p);

module.exports = { main, arm, ARM };
