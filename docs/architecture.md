# Architecture

## Viewer server

`lib/viewer-server.js` starts an HTTP server on a random port for `jscad-work <model.js>` and `render`. It serves the model directory's files, and serves the jscadui viewer app either by proxying jscad.rkroll.com or, when `JSCAD_VIEWER_ROOT` is set, from a local build. It injects an SSE bridge script before `</body>` so open tabs reload on file changes and receive live parameter updates.

The viewer resolves bare package names such as `@jbroll/jscad-anchors` to jsdelivr. When `JSCAD_LOCAL_PACKAGES` names local package directories, the server serves their browser files at `/__studio/packages/<name>/<file>`, uncached, and injects `window.jscadModuleOverrides` (a `{ packageName: url }` map) before `main.js` runs. jscadui's `getBundles` adds those URLs as bundle aliases, so the tab loads the local builds instead of jsdelivr.

`JSCAD_VIEWER_ROOT` and `JSCAD_LOCAL_PACKAGES` default to the sibling builds next to this repo (`../jscadui/apps/jscad-web/build`, `../jscad-anchors`, `../jscad-fluent`) when the matching build files exist and the variable is unset, so an unpublished `@jbroll/jscad-anchors` and jscad-fluent's unpublished anchor methods work without configuration. An explicit empty string turns a default off. The repo root for these defaults comes from the module's own location, not the working directory.

## `init` orchestration

`lib/init.js` gives `jscad-work init` its one-command behavior: `resolveWorkspace` turns the argument into a workspace directory and model name, `scaffoldWorkspace` writes the prompt files, and `runInit` then starts the work server in the background (reusing one already running), waits for `.jscad-studio`, opens the viewer URL in a browser, and runs `claude` in the workspace. Each step is an injected function, so `bin/jscad-work.js` wires the real server spawn, browser open, and `claude` invocation, and tests pass fakes to check the order without starting a real browser or agent.
