# CLAUDE.md

This file provides guidance to Claude Code when working with jscad-ai-studio for AI-assisted 3D modeling.

## Project Overview

**jscad-ai-studio** is an integrated environment for AI-assisted 3D modeling that combines:
- **jscad-fluent**: A fluent interface wrapper around JSCAD for creating 3D geometry
- **jscadui**: A web-based 3D viewer with hot-reload and interactive parameters
- **MCP Browser Tools**: For visual verification and debugging

This project is optimized for Claude Code workflows, enabling you to create, visualize, debug, and iterate on 3D models with immediate visual feedback.

## Quick Start

### For Claude Code

**IMPORTANT: Check for current working model first!**

If a `.current-model` file exists in the project root, read it to see which model the user is working on. This file contains:
- The model name and file path
- The viewer URL to use with MCP browser tools

If the file doesn't exist or the user asks to work on a different model, proceed with the workflow below.

When the user asks you to create a 3D model:

1. **Ensure the viewer is running** (ask user if not):
   ```bash
   npm run dev
   ```
   This starts the jscadui viewer at http://127.0.0.1:5120

2. **Write the model** to `workspace/<name>.js` using the jscad-fluent API (see llm.txt for complete API)

3. **Use MCP browser tools** to verify:
   ```javascript
   // Navigate to the model
   browser_navigate("http://127.0.0.1:5120#/home/john/src/jscad-ai-studio/workspace/model.js")

   // Wait for model to render
   browser_wait_for({ time: 2 })

   // Check for errors
   browser_console_messages({ level: "error" })

   // Visual verification
   browser_take_screenshot({ filename: "snapshots/model-v1.png" })
   ```

4. **Iterate** based on console errors and visual feedback

## Development Workflow

### Creating a New Model

Models are JavaScript files that export a `main` function:

```javascript
const jf = require('@jbroll/jscad-fluent');

const main = () => {
  const model = jf.cube({ size: 10 })
    .subtract(jf.sphere({ radius: 6.8 }))
    .colorize([0.65, 0.25, 0.8]);

  // Log measurements for verification
  console.log('✓ Model generated successfully');
  console.log('Volume:', model.measureVolume());
  console.log('Dimensions:', model.measureDimensions());
  console.log('Bounding Box:', model.measureBoundingBox());

  return model;
};

module.exports = { main };
```

### Model File Locations

- **workspace/model.js** - Current working model (default)
- **examples/basic/** - Simple examples (primitives, booleans, transforms)
- **examples/intermediate/** - More complex models (gears, bolts, assemblies)
- **examples/advanced/** - Complex parametric models
- **templates/** - Starting templates for new models

### Using Templates

Start with a template for common patterns:

```javascript
// Copy from templates/
const template = require('./templates/basic-model.js');
// Or parametric-model.js, multi-part.js
```

## Browser-Based Verification

### Navigation

Load a model in the viewer:
```
http://127.0.0.1:5120#/home/john/src/jscad-ai-studio/workspace/model.js
```

The viewer supports:
- **Hot reload**: Watches file changes and auto-reloads
- **Drag & drop**: Drop files/folders to load
- **URL parameters**: Load remote scripts or use data URLs

### Console Error Patterns

Monitor `browser_console_messages` for these JSCAD-specific errors:

**Geometry Errors:**
- `"Cannot read property 'polygons' of undefined"` → Invalid geometry passed to boolean operation
- `"Path is not closed"` → Path2 must be closed before extrusion
- `"Normals are incorrect"` → Polygon winding order issue (counter-clockwise expected)
- `"Non-manifold geometry detected"` → Boolean operation created invalid mesh
- `"Degenerate geometry"` → Zero-volume object or coincident faces

**API Usage Errors:**
- `"TypeError: ... is not a function"` → Method doesn't exist or wrong geometry type
- `"radius is required"` → Missing required parameter
- `"angles must be in radians"` → Used degrees instead of radians (use Math.PI)
- `"color values must be 0-1"` → Used 0-255 range instead of 0-1

**Type Mismatches:**
- `"Expected Geom2, got Geom3"` → Can't use 3D geometry in 2D boolean operation
- `"Cannot extrude Geom3"` → Only 2D geometry (FluentGeom2) can be extruded
- `"Cannot offset Geom3"` → Offset only works on 2D geometry

### Visual Verification Checklist

When using `browser_take_screenshot`, verify:

- ✅ **Geometry renders correctly** (no missing faces, holes, or artifacts)
- ✅ **Dimensions are accurate** (use measurements logged to console)
- ✅ **Boolean operations succeeded** (holes, unions, intersections visible)
- ✅ **Colors applied correctly** (0-1 range RGB/RGBA)
- ✅ **Transformations applied** (position, rotation, scale, mirror)
- ✅ **No degenerate geometry** (zero-volume objects, coincident faces)
- ✅ **Performance acceptable** (polygon count, render time in console)

### Measurement Verification

The viewer automatically logs measurements to console. Verify:

```javascript
// Expected console output:
✓ Model generated successfully
Volume: 523.5987755982989
Dimensions: [10, 10, 10]
Bounding Box: [[-5, -5, -5], [5, 5, 5]]
Polygon count: 256
Render time: 45ms
```

Compare these values to your expectations to catch errors early.

## Common Patterns

### Basic Boolean Operations

```javascript
// Union - combine objects
const combined = jf.cube({ size: 10 })
  .union(jf.sphere({ radius: 6 }).translate([5, 0, 0]));

// Subtract - create holes
const withHole = jf.cube({ size: 10 })
  .subtract(jf.cylinder({ radius: 2, height: 12 }));

// Intersect - keep only overlap
const intersection = jf.cube({ size: 10 })
  .intersect(jf.sphere({ radius: 7 }));

// Multiple operations
const base = jf.cube({ size: 20 });
const holes = [
  jf.cylinder({ radius: 2, height: 25 }).translate([5, 5, 0]),
  jf.cylinder({ radius: 2, height: 25 }).translate([-5, -5, 0])
];
const withHoles = base.subtract(...holes);
```

### 2D to 3D Extrusion

```javascript
// Linear extrusion
const shape2d = jf.circle({ radius: 10 })
  .subtract(jf.circle({ radius: 8 }));
const ring3d = shape2d.extrudeLinear({ height: 5 });

// Rotational extrusion (lathe)
const profile = jf.rectangle({ size: [2, 10] })
  .translate([8, 0, 0]);
const vase = profile.extrudeRotate({ segments: 32 });

// Twisted extrusion
const twisted = jf.square({ size: 5 })
  .extrudeLinear({ height: 20, twistAngle: Math.PI / 2, twistSteps: 10 });
```

### Transformations

```javascript
// Remember: angles are in RADIANS
const model = jf.cube({ size: 10 })
  .rotate([0, 0, Math.PI / 4])           // 45° rotation around Z
  .translate([10, 5, 0])                 // move in space
  .scale([1, 1, 2])                      // stretch 2x in Z
  .mirror({ normal: [1, 0, 0] })         // mirror across YZ plane
  .center()                              // center at origin
  .colorize([0.8, 0.2, 0.2]);           // red color
```

### Parametric Models

```javascript
const createGear = (teeth, radius, height) => {
  // Parametric gear logic
  const angle = (Math.PI * 2) / teeth;
  const teeth3d = [];

  for (let i = 0; i < teeth; i++) {
    const tooth = jf.cube({ size: [2, 4, height] })
      .translate([radius, 0, 0])
      .rotateZ(i * angle);
    teeth3d.push(tooth);
  }

  return jf.cylinder({ radius: radius * 0.8, height })
    .union(...teeth3d);
};

const main = () => createGear(12, 10, 5);
```

## Debugging Strategies

### When the Model Doesn't Render

1. **Check console errors** first with `browser_console_messages`
2. **Verify the file exports `main`** correctly
3. **Check for syntax errors** in the JavaScript
4. **Ensure all geometries are valid** (not null/undefined)
5. **Verify boolean operations** use matching types (all 2D or all 3D)

### When Dimensions Are Wrong

1. **Log measurements** to console
2. **Check coordinate system** (Y-up in JSCAD)
3. **Verify parameter units** (no implicit unit system)
4. **Check transformation order** (they compound)

### When Boolean Operations Fail

1. **Verify geometry is manifold** (closed, no holes in mesh)
2. **Check for coincident faces** (exact overlap causes issues)
3. **Ensure proper winding order** (counter-clockwise for extrusion)
4. **Try expanding/offsetting** slightly to avoid edge cases
5. **Simplify the operation** to isolate the problem

### When Performance Is Poor

1. **Check polygon count** in console
2. **Reduce segment counts** on curves (circles, spheres)
3. **Simplify boolean operations** (fewer objects)
4. **Avoid unnecessary detail** for the scale

## Advanced Features

### Using the Parametric System (jscadui)

Models can define interactive parameters:

```javascript
const main = (params) => {
  // Define parameters inline
  params.radius = { type: 'slider', default: 10, min: 5, max: 20, label: 'Radius' };
  params.height = { type: 'slider', default: 15, min: 5, max: 30, label: 'Height' };
  params.color = { type: 'color', default: '#3366CC', label: 'Color' };

  // Use the values
  return jf.cylinder({ radius: params.radius, height: params.height })
    .colorize(jf.colors.hexToRgb(params.color));
};

module.exports = { main };
```

The viewer will display sliders and controls for these parameters.

### Multi-Part Assemblies

Return arrays to show multiple objects:

```javascript
const main = () => {
  const base = jf.cube({ size: 20 }).colorize([0.5, 0.5, 0.5]);
  const shaft = jf.cylinder({ radius: 3, height: 30 })
    .translate([0, 0, 10])
    .colorize([0.8, 0.2, 0.2]);

  return [base, shaft];
};
```

### Color Utilities

```javascript
// Hex colors
const red = jf.colors.hexToRgb('#FF0000');
const semiTransparent = jf.colors.hexToRgb('#FF000080');

// CSS color names
const blue = jf.colors.css.cornflowerblue;

// HSL/HSV
const yellow = jf.colors.hslToRgb([0.16, 1, 0.5]);

model.colorize(red);
```

## Critical Constraints

**ALWAYS remember:**
- ✅ Angles are in **RADIANS** (not degrees) - use `Math.PI`
- ✅ Colors are **0-1 range** (not 0-255)
- ✅ Boolean operations require **matching types** (all Geom2 or all Geom3)
- ✅ Only **2D geometry (Geom2)** can be extruded to 3D
- ✅ Transformations return **new objects** (fluent but immutable)
- ✅ Measurements return **values** (not chainable)

## Example Session

```javascript
// User: "Create a bolt with a hexagonal head"

// 1. Write the model
const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Hexagonal head
  const hexPoints = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * 2 * i) / 6;
    hexPoints.push([8 * Math.cos(angle), 8 * Math.sin(angle)]);
  }
  const head = jf.polygon(hexPoints)
    .extrudeLinear({ height: 5 })
    .colorize([0.7, 0.7, 0.7]);

  // Cylindrical shaft
  const shaft = jf.cylinder({ radius: 4, height: 30 })
    .translate([0, 0, -30])
    .colorize([0.7, 0.7, 0.7]);

  const bolt = head.union(shaft);

  console.log('✓ Bolt generated');
  console.log('Volume:', bolt.measureVolume());
  console.log('Height:', bolt.measureDimensions()[2]);

  return bolt;
};

module.exports = { main };

// 2. Load in browser and verify
browser_navigate("http://127.0.0.1:5120#/home/john/src/jscad-ai-studio/workspace/model.js")
browser_wait_for({ time: 2 })
browser_console_messages({ level: "info" })  // See measurements
browser_take_screenshot({ filename: "snapshots/bolt-v1.png" })

// 3. Iterate based on visual feedback
```

## File Organization

- **Keep workspace/ clean** - Only current working models
- **Move completed models to examples/** - Organize by complexity
- **Use snapshots/ for comparison** - Screenshot versions for visual diffs
- **Reference templates/** - Don't modify, copy from them

## Tips for Success

1. **Start simple** - Test primitives before complex booleans
2. **Log measurements** - Verify dimensions match expectations
3. **Use screenshots** - Visual verification catches subtle errors
4. **Check console early** - Errors appear before rendering fails
5. **Iterate incrementally** - Add complexity step by step
6. **Learn from examples** - Study working models in examples/
7. **Use color** - Different colors help verify boolean operations
8. **Name things clearly** - Descriptive variable names help debugging

## Resources

- **API Reference**: See `llm.txt` for complete jscad-fluent API
- **Examples**: Browse `examples/` for working models
- **Templates**: Use `templates/` for starting points
- **jscad-fluent docs**: ../jscad-fluent/README.md
- **jscadui docs**: ../jscadui/README.md

## Troubleshooting

### Viewer won't start
- Check if jscadui is installed: `cd ../jscadui && npm i`
- Check port conflicts: Try different port in scripts/start-viewer.js

### Model won't load
- Verify file path is absolute in URL
- Check console for syntax errors
- Ensure `module.exports = { main }` exists

### Can't see changes
- Viewer should auto-reload on file save
- Try manual refresh in browser
- Check file watcher is working

### Geometry looks wrong
- Check winding order (counter-clockwise)
- Verify boolean operation types match
- Look for degenerate geometry warnings

---

**Remember:** This is an iterative process. Use the browser tools to verify each step, check console logs for errors and measurements, and take screenshots to track progress. The visual feedback loop is your most powerful debugging tool.
