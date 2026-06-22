# Using jscad-ai-studio from OpenCode

The `jscad-studio` MCP server and skills are portable. OpenCode reads `.claude/skills/**/SKILL.md` unmodified, so the `jscad-library` (and other) skills work as-is. Register the MCP server in `opencode.json`:

```json
{
  "mcp": {
    "jscad-studio": {
      "type": "local",
      "command": ["node", "<path to>/jscad-ai-studio/mcp/server.js"],
      "enabled": true
    }
  }
}
```

(Claude Code uses `.mcp.json` with the same `node mcp/server.js` command — see the repo root.)
