# Quick Start Guide

Get started with jscad-ai-studio in 5 minutes!

## Prerequisites

Make sure both projects are installed:

```bash
# Install jscad-fluent
cd /home/john/src/jscad-fluent
npm install
npm run build

# Install jscadui
cd /home/john/src/jscadui
npm install

# Install jscad-ai-studio
cd /home/john/src/jscad-ai-studio
npm install
```

## Start the Viewer

```bash
cd /home/john/src/jscad-ai-studio
npm run dev
```

This will start the viewer (usually at http://localhost:8080)

## Load Your First Model

Once the viewer is running, open your browser to:

```
http://localhost:8080#/home/john/src/jscad-ai-studio/workspace/model.js
```

You should see a cube with a spherical cutout!

## Edit the Model

Open `workspace/model.js` in your editor and try changing the code:

```javascript
const jf = require('@jbroll/jscad-fluent');

const main = () => {
  // Try changing the size!
  const model = jf.cube({ size: 15 })  // Changed from 10 to 15
    .subtract(jf.sphere({ radius: 8 }))  // Changed from 6.8 to 8
    .colorize([0.2, 0.8, 0.2]);  // Changed to green

  console.log('Volume:', model.measureVolume());
  return model;
};

module.exports = { main };
```

Save the file and watch it update in the viewer automatically!

## Try the Examples

Browse the examples to see what's possible:

```
http://localhost:8080#/home/john/src/jscad-ai-studio/examples/basic/primitives.js
http://localhost:8080#/home/john/src/jscad-ai-studio/examples/basic/booleans.js
http://localhost:8080#/home/john/src/jscad-ai-studio/examples/intermediate/hex-bolt.js
http://localhost:8080#/home/john/src/jscad-ai-studio/examples/advanced/parametric-box.js
```

## Create a New Model

```bash
npm run new my-gear
```

This creates `workspace/my-gear.js` from a template. Edit it and load it in the viewer:

```
http://localhost:8080#/home/john/src/jscad-ai-studio/workspace/my-gear.js
```

## Using with Claude Code

When working with Claude Code, it will:

1. Read the API from `llm.txt`
2. Follow the workflow in `CLAUDE.md`
3. Write models to `workspace/`
4. Use MCP browser tools to verify the output
5. Iterate based on visual feedback

Just ask Claude to "create a 3D model of..." and it will handle the rest!

## Next Steps

- Read `README.md` for detailed documentation
- Browse `examples/` for inspiration
- See `llm.txt` for the complete API reference
- Check `CLAUDE.md` for the Claude Code workflow

## Common Commands

```bash
npm run dev        # Start viewer
npm run new <name> # Create new model
npm run validate   # Check model syntax
npm run help       # Show help
```

## Tips

- ✅ Angles are in **radians** (use Math.PI)
- ✅ Colors are **0-1 range** (not 0-255)
- ✅ Check browser console for errors and measurements
- ✅ Models auto-reload when you save

Happy modeling! 🎨
