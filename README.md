# jscad-ai-studio

AI-assisted 3D modeling environment combining [jscad-fluent](https://github.com/jbroll/jscad-fluent) with [jscadui](https://github.com/jbroll/jscadui).

## Installation

### Prerequisites

The following projects should be siblings in the same directory:

```
src/
├── jscad-fluent/
├── jscadui/
└── jscad-ai-studio/  (this project)
```

### Setup

```bash
# Install jscad-fluent
cd ../jscad-fluent
npm install && npm run build

# Install jscadui
cd ../jscadui
npm install

# Install jscad-ai-studio and global command
cd ../jscad-ai-studio
npm install
npm link
```

## Usage

### Start a New Model

From any directory:

```bash
jscad-work my-model.js
```

This command:
- Creates the model file from a template (if new)
- Sets up viewer integration
- Starts the viewer if needed
- Opens the browser to your model

### Commands

```bash
jscad-work <model.js>    # Create/work on a model
jscad-work               # Show help and list models
```

### Model Files

Models are JavaScript files exporting a `main` function:

```javascript
const jf = require('@jbroll/jscad-fluent');

const main = (p) => {
  p._type = 'My Model';
  p.size = { type: 'slider', default: 10, min: 5, max: 20, label: 'Size', live: true };

  return jf.cube({ size: p.size }).colorize([0.3, 0.6, 0.8]);
};

module.exports = { main };
```

The viewer hot-reloads on save.

### Viewer URL

```
http://127.0.0.1:5120#<directory>/<model>.js
```

## Documentation

- **jscad-fluent API**: https://github.com/jbroll/jscad-fluent
- **jscadui viewer**: https://github.com/jbroll/jscadui
- **JSCAD**: https://github.com/jscad/OpenJSCAD.org

## License

MIT
