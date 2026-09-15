# Install

## Requirements

- Node.js 22 or later.
- Four sibling checkouts next to this repo:
  - `../OpenJSCAD.org`: https://github.com/jbroll/OpenJSCAD.org on branch `fork-main`. Its `packages/modeling` is the one `@jscad/modeling` used by all four repos. `package.json` depends on it as `file:../OpenJSCAD.org/packages/modeling`, and `overrides` (`"@jscad/modeling": "$@jscad/modeling"`) sends the copy the `@jscad/*` serializers require to the same link.
  - `../jscad-fluent`: installed as a `file:` dependency. Run `npm install` in it first; its dev dependencies link the same `../OpenJSCAD.org/packages/modeling`.
  - `../jscad-anchors`: https://github.com/jbroll/jscad-anchors, installed as a `file:` dependency. Models get it for both `@jbroll/jscad-anchors` and `@jscad/modeling`, so frames on anchored geometry survive raw modeling calls. Run `npm install` in it first.
  - `../jscadui`: installed as `file:` dependencies, and the catalog resolves model paths against it. Run `npm install` at its root first.

  ```bash
  git clone -b fork-main https://github.com/jbroll/OpenJSCAD.org ../OpenJSCAD.org
  git clone https://github.com/jbroll/jscad-anchors ../jscad-anchors
  ```
- For `jscad-work render`: Chromium through Playwright (`npx playwright install chromium`), or a system Chromium named by `JSCAD_CHROMIUM`. The viewer app comes from jscad.rkroll.com, which needs network access, or from a local jscadui build named by `JSCAD_VIEWER_ROOT` (see [Configuration](#configuration)).
- Linux or macOS. `bin/jscad-work` is a symlink.

## CLI

```bash
git clone https://github.com/jbroll/jscad-ai-studio
cd jscad-ai-studio
npm install && npm link
```

`npm link` puts `jscad-work` on `PATH` for every shell and agent. The name `jscad` is not used because `@jscad/cli` installs a `jscad` command.

## Claude Code plugin

The plugin provides the skills and puts the repo's `bin/` directory, which holds `jscad-work`, on the Bash tool's `PATH` while the plugin is enabled:

```bash
claude plugin marketplace add /path/to/jscad-ai-studio
claude plugin install jscad-ai-studio@jscad-ai-studio
```

Inside Claude Code the same steps are `/plugin marketplace add /path/to/jscad-ai-studio` and `/plugin install jscad-ai-studio@jscad-ai-studio`. The install shows the command `jscad-work plugin-root` and asks you to accept it, so `jscad-work` must already be on `PATH` from `npm link`. Claude Code runs it to find the plugin directory and uses that directory in place (link mode), so edits and `git pull` take effect in the next session without reinstalling. The plugin cannot be copied into Claude Code's plugin cache yet because it depends on `../jscadui` and `../jscad-fluent`.

Claude Code does not load a link-mode plugin in sessions started inside the plugin directory. To work on this repo, or on `examples/` inside it, with the skills loaded, start `claude --plugin-dir .` from the repo root.

## Permissions

Plugins cannot pre-allow Bash commands, and a skill's `allowed-tools` lasts only for the turn that invoked it. `jscad-work init` therefore adds this rule to the workspace's `.claude/settings.json`:

```json
{ "permissions": { "allow": ["Bash(jscad-work *)"] } }
```

Claude Code applies it after you accept the workspace trust dialog. To allow the CLI in every project instead, add the same rule to `~/.claude/settings.json`.

OpenCode: see [opencode-setup.md](opencode-setup.md).

## Configuration

| Variable | Effect |
|---|---|
| `JSCAD_CHROMIUM` | Path to a system Chromium for `render`, in place of Playwright's. Renders time out with `/usr/bin/chromium` on this machine; leave it unset and let Playwright's bundled Chromium run `render` |
| `JSCAD_VIEWER_ROOT` | A built jscadui viewer directory. The viewer server serves it instead of proxying jscad.rkroll.com, so `render` and the browser tab work offline. Defaults to `../jscadui/apps/jscad-web/build` when that build exists and the variable is unset; set it to an empty string to turn the default off and proxy jscad.rkroll.com instead. Build it with `npm run build:siblings` or `node build.js --skipDocs` in `../jscadui/apps/jscad-web` |
| `JSCAD_LOCAL_PACKAGES` | Comma-separated package directories whose browser file the viewer server serves in place of jsdelivr. Defaults to `../jscad-anchors,../jscad-fluent` when both are built and the variable is unset; set it to an empty string to turn the default off. Each needs its build (`npm run build:siblings`, or `npm run build` in each). The file is `jsdelivr`, else a string `browser`, else `main` from its `package.json` |

## Upgrade

`git pull && npm install`. A link-mode plugin picks up changes in the next session. After pulling `../OpenJSCAD.org`, no reinstall is needed: every repo links its source directly.

The MCP server was removed. If you registered `mcp/server.js` in Claude Code or OpenCode, delete that entry.
