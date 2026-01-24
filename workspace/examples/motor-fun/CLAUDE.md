# JSCAD Model Development

This directory contains JSCAD models developed using jscad-ai-studio.

## Project Context

**Current model**: vecto-arm-pivot.js
**Viewer URL**: http://127.0.0.1:5120#models/vecto-arm-pivot.js

## Workflow

You are working with the JSCAD AI Studio workflow. Key points:

1. **Models are .js files** in this directory that export a `main` function
2. **Live preview** at http://127.0.0.1:5120 (viewer must be running)
3. **Use jscad-fluent API** - see /home/john/src/jscad-ai-studio/llm.txt for full API reference
4. **Parametric models** - use `main(p)` with parameter declarations for interactive UI controls

## API Reference

The jscad-fluent API is available at: /home/john/src/jscad-ai-studio/llm.txt

Key imports:
```javascript
const jf = require('@jbroll/jscad-fluent');
```

## Parameter Format

For parametric models with UI controls:
```javascript
const main = (p) => {
  p._type = 'Model Name';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, step: 1, label: 'Size', live: true };

  return jf.sphere({ radius: p.size / 2 });
};
```

Use compact one-line parameter declarations.

## Code Style

- Use short parameter name `p` not `params`
- No local copies - use `p.size` directly in code
- Prefer fluent chaining: `jf.cube().translate([1,2,3]).colorize([1,0,0])`
- Keep code brief and expressive

## Starting Viewer

From jscad-ai-studio directory:
```bash
cd /home/john/src/jscad-ai-studio
npm run dev
```

Or use: `jscad-work start`

## Available Models

- **vecto-arm-pivot.js** ← current
- vecto-truss-clip.js

## Creating New Models

Just create a .js file with:
```javascript
const jf = require('@jbroll/jscad-fluent');
const main = () => jf.cube({ size: 10 });
module.exports = { main };
```

Then load in browser at: http://127.0.0.1:5120#models/yourmodel.js
