# jscad-ai-studio

AI-assisted 3D modeling with [jscad-fluent](https://github.com/jbroll/jscad-fluent).

## Installation

```bash
git clone https://github.com/jbroll/jscad-ai-studio
cd jscad-ai-studio
npm install && npm link
```

## Usage

From any directory containing JSCAD models:

```bash
jscad-work my-model.js
```

This:
1. Starts a local HTTP server (ephemeral port)
2. Proxies the jscadui viewer from jscad.rkroll.com
3. Serves your model files locally
4. Writes `.jscad-studio` config for Claude

Claude then navigates to the viewer URL via Chrome DevTools MCP.

## With Claude

Configure Chrome DevTools MCP in `~/.claude.json`:

```json
"chrome-devtools": {
  "type": "stdio",
  "command": "npx",
  "args": ["chrome-devtools-mcp@latest", "--executablePath=/usr/bin/chromium"]
}
```

Claude reads `.jscad-studio` to get the viewer URL and uses MCP to interact with the browser.

## Documentation

- **jscad-fluent API**: https://github.com/jbroll/jscad-fluent

## License

[MIT](LICENSE)
