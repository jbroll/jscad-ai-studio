# jscad-ai-studio

Tools and agent skills for 3D modeling with [jscad-fluent](https://github.com/jbroll/jscad-fluent) and OpenSCAD. An agent such as Claude Code or OpenCode edits a model file, checks it with the `jscad-work` CLI (evaluate, measure, check printability, render PNGs, export STL), and you watch the model update in a browser viewer.

## Example

```console
$ jscad-work measure examples/motor-fun/bearing.js
{"ok":true,"geomType":"array","measure":{"boundingBox":[[-11,-11,0],[11,11,7]],"dimensions":[22,22,7],"center":[0,0,3.5],"volume":1357.8286412322507,"polygonCount":528,"entityCount":4}}
```

In a model directory, `jscad-work init my-part.js` writes the agent instructions, then `claude` or `opencode` starts work.

## Install

```bash
git clone https://github.com/jbroll/jscad-ai-studio && cd jscad-ai-studio && npm install && npm link
claude plugin marketplace add "$PWD" && claude plugin install jscad-ai-studio@jscad-ai-studio
```

Requires `../jscad-fluent` and `../jscadui` next to the clone. Details: [docs/install.md](docs/install.md).

## Documentation

- [Install](docs/install.md): requirements, the Claude Code plugin, permissions, upgrade
- [User manual](docs/user-manual.md): every `jscad-work` command and option, catalog and session-analysis scripts
- [Interactive workflow](docs/interactive-workflow.md): how the agent's CLI loop and the browser tab work together
- [OpenCode setup](docs/opencode-setup.md)
- [Development](docs/development.md): repo layout, tests, lint
- [Architecture](docs/architecture.md): viewer server, local package builds, rendering pipeline
- [Backlog](docs/backlog.md)
- Skills: [`jscad-modeling`](skills/jscad-modeling/SKILL.md) (hardware dimensions and fits), [`jscad-assembly`](skills/jscad-assembly/SKILL.md) (multi-part layouts), [`jscad-library`](skills/jscad-library/SKILL.md) (catalog reuse)
- jscad-fluent API: [llm.txt](https://github.com/jbroll/jscad-fluent/blob/main/llm.txt), offline copy in [docs/reference/jscad-fluent-llm.txt](docs/reference/jscad-fluent-llm.txt)

## License

[MIT](LICENSE)
