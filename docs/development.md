# Development

## Repo layout

| Path | Contents |
|---|---|
| `bin/` | `jscad-work` entry point and the plugin's bare `jscad-work` symlink |
| `lib/` | CLI subcommands, model loading and worker runner, geometry analysis, render and viewer server |
| `scripts/` | Catalog build, session analysis, `sync-llm`; shared code in `scripts/lib/` |
| `skills/` | Claude Code plugin skills |
| `catalog/` | `catalog.json`, the model library index |
| `examples/` | Example models |
| `test/` | Vitest suites; `test/fixtures/` holds models and data they load |
| `docs/` | User and developer documentation |

## Setup

```bash
npm install
npx playwright install chromium
(cd ../jscadui/apps/jscad-web && node build.js --skipDocs)
```

`npm install` also installs the Lefthook git hooks.

## Test

`npm test` runs every suite with Vitest. All tests run by default; none are skipped. It needs:

- `../jscad-fluent` and `../jscadui` beside this repo, as for any use.
- Chromium from `npx playwright install chromium`, or a system Chromium named by `JSCAD_CHROMIUM`. Without it the render tests fail with Playwright's `Executable doesn't exist` error and the install command.
- A built viewer at `../jscadui/apps/jscad-web/build`. `vitest.config.js` sets `JSCAD_VIEWER_ROOT` to it, so the render tests load the viewer locally and need no network. Without the build they fail with `no viewer build at ...` and the build command. Rebuild after changing the viewer in jscadui.

`test/llm-sync.test.js` fails when `docs/reference/jscad-fluent-llm.txt` differs from `../jscad-fluent/llm.txt`; `npm run sync-llm` fixes it.

## Lint and checks

The pre-commit hook comes from org-hooks (`lefthook.yml`): secret scan, Biome, type-check, knip, circular imports, and a file size cap. Its knip and dependency checks match TypeScript files only, so run knip by hand:

```bash
npm run knip
npm run type-check
```
