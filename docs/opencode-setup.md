# Using jscad-ai-studio from OpenCode

OpenCode does not read Claude Code plugins, so the skills and the MCP server are registered separately. Both work unmodified.

## Skills

OpenCode looks for `<name>/SKILL.md` in `.opencode/skills/`, `.claude/skills/` and `.agents/skills/` (walking up from the working directory to the git root), and in `~/.config/opencode/skills/`, `~/.claude/skills/` and `~/.agents/skills/`. It has no setting for extra skill paths. Link each skill from the repo's `skills/` directory into the OpenCode global directory, so every workspace sees it:

```bash
mkdir -p ~/.config/opencode/skills
ln -s /path/to/jscad-ai-studio/skills/jscad-modeling ~/.config/opencode/skills/jscad-modeling
ln -s /path/to/jscad-ai-studio/skills/jscad-assembly ~/.config/opencode/skills/jscad-assembly
ln -s /path/to/jscad-ai-studio/skills/jscad-library ~/.config/opencode/skills/jscad-library
```

The directory name must match the skill's `name`. Copy the directories instead if your OpenCode build does not follow symlinks; re-copy after pulling.

## MCP server

Register the server in `~/.config/opencode/opencode.json` (all workspaces) or a workspace `opencode.json`, with an absolute path:

```json
{
  "mcp": {
    "jscad-studio": {
      "type": "local",
      "command": ["node", "/path/to/jscad-ai-studio/mcp/server.js"],
      "enabled": true
    }
  }
}
```

Claude Code gets the same server from the plugin manifest, `.claude-plugin/plugin.json`.
