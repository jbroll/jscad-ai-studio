# jscad-ai-studio

AI-assisted 3D modeling with [jscad-fluent](https://github.com/jbroll/jscad-fluent) and [jscadui](https://github.com/jbroll/jscadui).

## Installation

```bash
# Clone sibling projects
cd ~/src
git clone https://github.com/jbroll/jscad-fluent
git clone https://github.com/jbroll/jscadui
git clone https://github.com/jbroll/jscad-ai-studio

# Install
cd jscad-fluent && npm install && npm run build
cd ../jscadui && npm install
cd ../jscad-ai-studio && npm install && npm link
```

## Usage

From any directory:

```bash
jscad-work my-model.js
```

This creates the model (if new), starts the viewer, and opens your browser.

## Documentation

- **jscad-fluent API**: https://github.com/jbroll/jscad-fluent
- **jscadui viewer**: https://github.com/jbroll/jscadui

## License

[MIT](LICENSE)
