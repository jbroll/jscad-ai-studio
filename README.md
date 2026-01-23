# jscad-ai-studio

AI-assisted 3D modeling environment combining [jscad-fluent](../jscad-fluent) with [jscadui](../jscadui), optimized for Claude Code workflows.

## What is This?

This project integrates two powerful tools for a seamless AI-assisted CAD workflow:

- **[jscad-fluent](../jscad-fluent)** - Fluent interface wrapper around JSCAD for creating 3D geometry with chainable methods
- **[jscadui](../jscadui)** - Web-based 3D viewer with hot-reload, interactive parameters, and multiple renderer support

Together with Claude Code's MCP browser tools, this creates a powerful feedback loop where AI can:
1. Write 3D model code
2. Load it in the browser
3. Monitor console for errors
4. Take screenshots to verify the output
5. Iterate based on visual feedback

## Setup

### Prerequisites

1. **Install dependencies for both projects:**

```bash
# Install jscad-fluent
cd ../jscad-fluent
npm install
npm run build

# Install jscadui (must be from root of jscadui monorepo)
cd ../jscadui
npm install

# Install jscad-ai-studio
cd ../jscad-ai-studio
npm install
```

2. **Verify the projects are in the correct locations:**

```
src/
├── jscad-fluent/
├── jscadui/
└── jscad-ai-studio/  (this project)
```

### Quick Start

1. **Start the 3D viewer:**

```bash
npm run dev
```

This launches the jscadui viewer (typically at `http://localhost:8080`)

2. **Open the workspace model in the viewer:**

Navigate to: `http://localhost:8080#/home/john/src/jscad-ai-studio/workspace/model.js`

3. **Edit `workspace/model.js`** and watch it update in real-time!

## Usage

### Creating a Model

Edit `workspace/model.js` (or create a new file):

```javascript
const jf = require('@jbroll/jscad-fluent');

const main = () => {
  const model = jf.cube({ size: 10 })
    .subtract(jf.sphere({ radius: 6.8 }))
    .colorize([0.65, 0.25, 0.8]);

  // Log measurements
  console.log('Volume:', model.measureVolume());
  console.log('Dimensions:', model.measureDimensions());

  return model;
};

module.exports = { main };
```

Save the file and the viewer will automatically reload and render your model!

### Using Templates

Start from a template:

```bash
npm run new my-model          # Creates workspace/my-model.js from template
```

Available templates:
- `basic-model.js` - Simple model template
- `parametric-model.js` - Model with interactive parameters
- `multi-part.js` - Assembly with multiple parts

### Validation

Check if your model is valid before sharing:

```bash
npm run validate workspace/model.js
```

## Project Structure

```
jscad-ai-studio/
├── workspace/           # Your working models (gitignored)
│   └── model.js         # Default model file
├── examples/            # Example models
│   ├── basic/           # Simple examples
│   ├── intermediate/    # More complex models
│   └── advanced/        # Advanced parametric models
├── templates/           # Model templates
├── scripts/             # Helper scripts
├── snapshots/           # Screenshot history (gitignored)
├── CLAUDE.md            # Instructions for Claude Code
└── llm.txt              # API reference for LLMs
```

## Examples

Browse the `examples/` directory to see:

- **Basic**: Primitives, booleans, transformations
- **Intermediate**: Gears, bolts, enclosures
- **Advanced**: Complex parametric assemblies

Load any example in the viewer:
```
http://localhost:8080#/home/john/src/jscad-ai-studio/examples/basic/primitives.js
```

## Features

### Hot Reload

The viewer watches your files and automatically reloads when you save changes. No manual refresh needed!

### Interactive Parameters

Add sliders, color pickers, and other controls to your models:

```javascript
const main = (params) => {
  params.radius = { type: 'slider', default: 10, min: 5, max: 20, label: 'Radius' };
  params.color = { type: 'color', default: '#3366CC', label: 'Color' };

  return jf.cylinder({ radius: params.radius, height: 15 })
    .colorize(jf.colors.hexToRgb(params.color));
};
```

The viewer will display UI controls for these parameters!

### Console Measurements

Models automatically log measurements to the browser console:
- Volume
- Dimensions
- Bounding box
- Polygon count
- Render time

### Visual Debugging

Open your browser's developer console to see:
- Error messages
- Measurement logs
- Performance metrics
- JSCAD warnings

## AI-Assisted Workflow

### With Claude Code

This project is optimized for Claude Code. When Claude Code works with this project:

1. **Reads the API** from `llm.txt`
2. **Follows the workflow** in `CLAUDE.md`
3. **Writes models** to `workspace/`
4. **Uses MCP browser tools** to verify:
   - `browser_navigate` - Load the model
   - `browser_console_messages` - Check for errors
   - `browser_take_screenshot` - Visual verification
5. **Iterates** based on console errors and visual feedback

### Example Session

```
User: "Create a bolt with hexagonal head"

Claude Code:
1. Writes model code to workspace/bolt.js
2. Navigates browser to viewer with that file
3. Checks console for errors
4. Takes screenshot to verify it looks correct
5. Iterates if needed
```

## Tips

### Performance

- Start with low segment counts (`segments: 16`) and increase if needed
- Use `console.log()` to check polygon counts
- Monitor render time in console

### Debugging

- Check browser console for JSCAD errors
- Verify geometry with measurements
- Use different colors to verify boolean operations
- Start simple and add complexity incrementally

### Common Issues

**Model doesn't render:**
- Check console for syntax errors
- Verify `module.exports = { main }` exists
- Ensure geometries are valid (not null/undefined)

**Boolean operations fail:**
- Verify all inputs are same type (all 2D or all 3D)
- Check for coincident faces
- Ensure geometry is manifold (closed, no holes)

**Wrong dimensions:**
- Remember: angles in RADIANS (use `Math.PI`)
- Colors are 0-1 range (not 0-255)
- Check transformation order

## Resources

- **jscad-fluent API**: See `llm.txt` or `../jscad-fluent/README.md`
- **jscadui Documentation**: `../jscadui/README.md`
- **JSCAD Modeling**: https://github.com/jscad/OpenJSCAD.org
- **Examples**: Browse `examples/` directory
- **Claude Code**: https://claude.com/code

## Contributing

This project references jscad-fluent and jscadui as peer dependencies. To contribute:

1. Make changes to your models in `workspace/` or `examples/`
2. Share interesting models by adding them to `examples/`
3. Improve templates in `templates/`
4. Enhance helper scripts in `scripts/`

## License

MIT

## Credits

- **jscad-fluent** by John Roll
- **jscadui** by the jscadui community
- **JSCAD** by the OpenJSCAD.org community
