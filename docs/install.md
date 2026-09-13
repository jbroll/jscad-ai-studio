# Install

## Requirements

- Node.js 22 or later.
- `../jscad-fluent` and `../jscadui` cloned next to this repo. `package.json` installs them as `file:` dependencies, and the catalog resolves model paths against `../jscadui`.
- For `jscad-work render`: Chromium through Playwright (`npx playwright install chromium`), or a system Chromium named by `JSCAD_CHROMIUM`, plus network access to jscad.rkroll.com, which serves the viewer app.
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

## Upgrade

`git pull && npm install`. A link-mode plugin picks up changes in the next session.

The MCP server was removed. If you registered `mcp/server.js` in Claude Code or OpenCode, delete that entry.
