# jscad-studio MCP server (deprecated)

The `jscad-work` CLI replaces this server. The Claude Code plugin no longer starts it, and the generated prompts and skills call the CLI. It stays for one release for OpenCode setups and existing configurations, then is deleted (see [`docs/backlog.md`](../docs/backlog.md)).

Run it over stdio as `node <repo>/mcp/server.js`. Its tools are `eval`, `params`, `measure`, `check`, `export`, `render`, `parts`, `library_search`, `library_get`, and `live_params`, with the inputs and results of the CLI subcommands in [`docs/user-manual.md`](../docs/user-manual.md), except:

- Tools take `modelPath` instead of a positional model, `params` as an object, and `timeoutMs` instead of `--timeout`.
- `export` returns the file as base64 in `export.base64` instead of writing it.
- `render` takes one `view` and `size` as `[width, height]` and returns `{ path, width, height }`.
- `library_search` takes `query`, `tags` (array), `source`, `lang`, `runnableOnly` (default `true`), `limit`, and has no size or `parametric` filters. `library_get` always includes `source`.
- `live_params` takes `params` and reads `.jscad-studio` from the server's working directory.
