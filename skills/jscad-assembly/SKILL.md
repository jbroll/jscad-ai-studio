---
name: jscad-assembly
description: Structure a multi-part jscad-fluent assembly across files with shared constants, a layout module for derived positions, and named clearances. Use when a jscad model has more than one part or parts must fit together.
---

# Multi-part jscad assemblies

`JSCAD.md` states the conventions. This skill shows how to apply them when a
model grows past one part. The reference project is `examples/motor-fun` in the
jscad-ai-studio install (`JSCAD.md` gives its absolute path).

## File layout

```
constants.js        shared hardware sizes used by more than one part
<part>.js           one file per part: a factory, its presets, and a main
layout.js           clearances and every position derived from them
<assembly>.js       requires the parts and layout, places parts, returns an array
```

- A part file exports a factory taking a params child proxy (`motor(p)`,
  `create(dims, p)`), the preset objects it uses (`BEARING_608`, `NEMA17`), and
  a `main(p)` so the part renders and measures on its own.
- Parts are modeled in their own frame (see `JSCAD.md`). Only the assembly file
  calls `rotate`/`translate` to place them.
- Pass a child proxy per instance (`p.bearing608upper`, `p.bearing608lower`) so
  each instance gets its own parameter group. Give interchangeable parts the same
  `_type` and `_class` to link their edits.
- `jscad-work parts <assembly>.js` lists sibling files and their exports. Run it
  before editing an unfamiliar assembly.

## Derived positions

Keep placement arithmetic in `layout.js`, not inline in the assembly. Each
position is computed from part constants and named clearances, in dependency
order, and returned as one object:

```js
const CLEARANCES = {
  platformToClip: 2,   // gap between platform top and clip bottom
  clipBarToCapstan: 2, // gap between clip bar top and capstan
};

const motorPosition = (opts) => {
  const clipBarTop = opts.platformHeight + CLEARANCES.platformToClip + CLIP.outerRadius;
  const motorZ = clipBarTop + CLEARANCES.clipBarToCapstan + opts.capstanRadius;
  const shelfHeight = motorZ - NEMA17.faceSize / 2 - opts.platformHeight;
  return { clipBarTop, motorZ, shelfHeight };
};

module.exports = { motorPosition, CLEARANCES };
```

- A dimension that follows from others is computed, never a parameter. In
  `vecto-arm-pivot.js` the shelf height comes from the capstan radius, so the
  user cannot set a shelf that collides with the capstan.
- When an assembly needs a part's parameter value before placing it (for example
  `p.platform.platformHeight`), call the part factory once to declare its
  parameters, then read them.
- Export `CLEARANCES` so a slider default can reference it
  (`default: layout.CLEARANCES.clipBarToCapstan`).

## Declaring clearances

- One named entry per interface: `platformToClip`, not `gap1`. The comment says
  which two surfaces it separates.
- Fit clearances (press, slip, running) come from the fits table in the
  `jscad-modeling` skill. Record the chosen value and the reason in `NOTES.md`.
- When a derived gap can go negative for some parameter values, fail loudly in
  `layout.js`:

  ```js
  if (shelfHeight < 0) throw new Error(`shelfHeight ${shelfHeight} < 0: capstan too small`);
  ```

  `jscad-work eval` then reports the error and line instead of returning
  overlapping geometry.

## Checking fit today

There is no interference subcommand yet. `jscad-work measure` on an assembly
returns one bounding box for the whole array.

1. `jscad-work measure <part>.js` for each part file on its own (its `main`) and
   compare with the constants the layout assumes.
2. Compute each gap from the layout values and report it with the target, the
   same way as any other dimension.
3. `jscad-work measure <assembly>.js` and check the overall bounding box against
   the expected envelope.
4. For two parts stacked along one axis, temporarily return only those two from
   `main` and measure them. If the combined dimension along that axis is less
   than the two part dimensions plus the declared clearance, they overlap.
5. `jscad-work render <assembly>.js --view all` and Read each PNG, looking at
   every contact zone. Push sliders to their `min` and `max` with
   `-p '{"name":value}'` and render again, since collisions often appear only at
   extremes. For a shaft in a bore or a part inside a housing, add
   `--section y --view front` through the joint.
