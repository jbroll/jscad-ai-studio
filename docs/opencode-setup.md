# Using jscad-ai-studio from OpenCode

OpenCode does not read Claude Code plugins. It runs the model tools as `jscad-work` subcommands through its bash tool, and gets the skills by linking them.

## CLI

`npm link` in the clone puts `jscad-work` on `PATH` ([install.md](install.md)). OpenCode's `bash` permission defaults to `allow`, so the subcommands run without prompts. If your `opencode.json` asks before bash commands, allow the CLI after the catch-all rule, since the last matching rule wins:

```json
{
  "permission": {
    "bash": {
      "*": "ask",
      "jscad-work *": "allow"
    }
  }
}
```

`jscad-work init <model> --opencode` scaffolds the workspace (`AGENTS.md`, `CLAUDE.md`, the starter model), starts the server and the browser, then runs `opencode --prompt "Read AGENTS.md and start on <model>"` in it. Without the flag it runs `claude`. Either way, init stops the server again once that session exits, unless the server was already running when init started.

To keep the server up across sessions, start it yourself and run `opencode` by hand: `jscad-work <model>` in a second terminal, or `nohup jscad-work <model> > .jscad-work.log 2>&1 &`, then wait for `.jscad-studio` to appear.

## Skills

OpenCode looks for `<name>/SKILL.md` in `.opencode/skills/`, `.claude/skills/` and `.agents/skills/` (walking up from the working directory to the git root), and in `~/.config/opencode/skills/`, `~/.claude/skills/` and `~/.agents/skills/`. It has no setting for extra skill paths. Link each skill from the repo's `skills/` directory into the OpenCode global directory, so every workspace sees it:

```bash
mkdir -p ~/.config/opencode/skills
ln -s /path/to/jscad-ai-studio/skills/jscad-modeling ~/.config/opencode/skills/jscad-modeling
ln -s /path/to/jscad-ai-studio/skills/jscad-assembly ~/.config/opencode/skills/jscad-assembly
ln -s /path/to/jscad-ai-studio/skills/jscad-library ~/.config/opencode/skills/jscad-library
```

The directory name must match the skill's `name`. Copy the directories instead if your OpenCode build does not follow symlinks; re-copy after pulling.
