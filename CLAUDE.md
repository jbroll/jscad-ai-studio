# CLAUDE.md

AI-assisted 3D modeling with Claude Code.

## Quick Start

```bash
jscad-work my-model.js
```

This creates the model, starts the viewer, and opens Chrome with remote debugging (port 9222).

## Browser Connection

Claude connects to the user's browser via Chrome DevTools MCP - same browser, same session.

Use these tools to interact:
- `devtools_navigate` - load URLs
- `devtools_screenshot` - capture the page
- `devtools_console` - check for errors
- `devtools_evaluate` - run JavaScript

## Workflow

1. Write/edit the model file
2. Navigate to the viewer URL
3. Check console for errors
4. Take screenshot to verify visually
5. Iterate based on feedback

## Model Format

```javascript
const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'Model Name';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
```

## API Reference

@url https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt

## Examples

Reference these for development patterns:
- `workspace/examples/booleans.js` - subtract, union operations
- `workspace/examples/extrusion.js` - 2D to 3D with expand
- `workspace/examples/assembly.js` - multi-part models, returning arrays

## Common Errors

| Error | Cause |
|-------|-------|
| `Cannot read property 'polygons' of undefined` | Invalid geometry in boolean |
| `Expected Geom2, got Geom3` | Type mismatch in boolean |
| `angles must be in radians` | Use Math.PI, not degrees |
| `color values must be 0-1` | Use 0-1 range, not 0-255 |
