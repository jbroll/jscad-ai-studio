# JSCAD Context

AI-assisted 3D modeling with Claude Code.

## Quick Start

```bash
jscad-work my-model.js
```

Creates model, starts viewer, opens Chrome with debug port 9222.

## Browser Connection

Claude connects via Chrome DevTools MCP (port 9222) - same browser you're viewing.

## Viewer URL

```
http://127.0.0.1:5120#<directory>/<model>.js
```

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
