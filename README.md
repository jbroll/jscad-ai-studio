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

## Example Session

```
╭─── Claude Code v2.1.1 ───────────────────────────────────────────────────────────────────────────╮
│                                                    │ Tips for getting started                    │
│                 Welcome back john!                 │ Run /init to create a CLAUDE.md file with … │
│                                                    │ ─────────────────────────────────────────── │
│                       ▐▛███▜▌                      │ Recent activity                             │
│                      ▝▜█████▛▘                     │ No recent activity                          │
│                        ▘▘ ▝▝                       │                                             │
│                                                    │                                             │
│     Opus 4.5 · Claude Max · john@rkroll.com's      │                                             │
│     Organization                                   │                                             │
│      ~/src/jscad-ai-studio/examples/motor-fun      │                                             │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯

❯ Read ./JSCAD.md and complete the startup actions.

● Read(JSCAD.md)
  ⎿  Read 23 lines

● Fetch(https://raw.githubusercontent.com/jbroll/jscad-fluent/main/llm.txt)
  ⎿  Received 8.8KB (200 OK)

● Read(vecto-arm-pivot.js)
  ⎿  Read 138 lines

● chrome-devtools - navigate_page (MCP)(type: "url", url:
                                       "http://127.0.0.1:35705/#vecto-arm-pivot.js")
  ⎿  # navigate_page response
     Successfully navigated to http://127.0.0.1:35705/#vecto-arm-pivot.js.
     ## Pages
     1: http://127.0.0.1:35705/#vecto-arm-pivot.js [selected]

● Startup complete. Here's the current state:

  Current model: vecto-arm-pivot.js - A rotating platform assembly with:
  - NEMA 17 motor on a platform with adjustable shelf height
  - Pivot stud with dual 6002 bearings and spacer
  - Three 608 bearing/tyre assemblies for truss contact
  - Capstan driven by the motor
  - Arm assembly with parallel dowels

  Key components imported from modules:
  - nema17.js, bearing.js, tyre-608.js
  - vecto-truss-clip.js, capstan.js, arm.js
  - motor-platform.js, pivot-stud.js, layout.js

  Browser is now showing the viewer at http://127.0.0.1:35705/#vecto-arm-pivot.js

  API reference loaded - jscad-fluent with chainable operations, radians for angles, 0-1 color range.

  Ready to help with edits. Changes to model files are served immediately; I'll reload the browser after edits.

────────────────────────────────────────────────────────────────────────────────────────────────────
❯ take a screenshot                                                                          ↵ send
────────────────────────────────────────────────────────────────────────────────────────────────────
  ? for shortcuts
```

## Documentation

- **jscad-fluent API**: https://github.com/jbroll/jscad-fluent

## License

[MIT](LICENSE)
