# CLAUDE.md

AI-assisted 3D modeling with Claude Code. This project provides the `jscad-work` command to set up any directory for JSCAD model development.

## Quick Start

When starting in a new directory, run:
```bash
jscad-work <model-name>.js
```

This creates the model file (if needed), sets up viewer integration, and opens the browser.

## The jscad-work Command

```bash
jscad-work <model.js>    # Create/work on a model (starts viewer + browser)
jscad-work start         # Start the viewer only
jscad-work               # Show help and list models
```

When you run `jscad-work my-model.js`:
1. Creates `my-model.js` from template if it doesn't exist
2. Creates symlink so the viewer can access this directory
3. Generates local `CLAUDE.md` with project-specific context
4. Starts viewer if not running
5. Opens browser to the model URL

## Development Workflow

### 1. Write the Model

Models are JavaScript files that export a `main` function:

```javascript
const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'My Model';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
```

### 2. Verify with MCP Browser Tools

After writing/editing a model, use the browser tools to verify:

```javascript
// Navigate to the model
mcp__playwright_browser_navigate({ url: "http://127.0.0.1:5120#dirname/model.js" })

// Wait for render
mcp__playwright_browser_wait_for({ time: 2 })

// Check for errors
mcp__playwright_browser_console_messages({ level: "error" })

// Visual verification
mcp__playwright_browser_take_screenshot({ type: "png" })
```

### 3. Iterate

Based on console errors and visual feedback:
- Fix geometry errors reported in console
- Adjust dimensions based on measurements
- Verify boolean operations visually
- Refine until correct

## API Reference

**jscad-fluent API**: See `llm.txt` which references:
- https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt

**Key constraints** (from jscad-fluent docs):
- Angles in RADIANS (use `Math.PI`)
- Colors 0-1 range (not 0-255)
- Boolean inputs must match type (all 2D or all 3D)
- Only 2D geometry can be extruded

## Parametric Models

Use `main(p)` with parameter declarations for interactive UI:

```javascript
const main = (p) => {
  p._type = 'Widget';  // Section label
  p.radius = { type: 'slider', default: 5, min: 1, max: 20, label: 'Radius', live: true };
  p.color = { type: 'color', default: '#3366CC', label: 'Color' };

  return jf.sphere({ radius: p.radius })
    .colorize(jf.colors.hexToRgb(p.color));
};
```

Parameter types: `slider`, `int`, `number`, `checkbox`, `color`, `choice`, `text`

## Console Error Patterns

Common errors to watch for in `browser_console_messages`:

| Error | Cause |
|-------|-------|
| `Cannot read property 'polygons' of undefined` | Invalid geometry in boolean |
| `Expected Geom2, got Geom3` | Type mismatch in boolean |
| `Cannot extrude Geom3` | Trying to extrude 3D geometry |
| `angles must be in radians` | Used degrees instead of Math.PI |
| `color values must be 0-1` | Used 0-255 color range |

## Code Style

- Use short parameter name `p` not `params`
- Use `p.value` directly (no local copies)
- Prefer fluent chaining: `jf.cube().translate([1,2,3]).colorize([1,0,0])`
- Compact one-line parameter declarations

## Viewer URL Format

```
http://127.0.0.1:5120#<directory>/<model>.js
```

The viewer hot-reloads on file save.

## External Documentation

- **jscad-fluent**: https://github.com/jbroll/jscad-fluent
- **jscadui parametric system**: See jscadui docs for full parameter options
- **JSCAD**: https://github.com/jscad/OpenJSCAD.org
