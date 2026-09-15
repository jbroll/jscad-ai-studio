# Architecture

## Viewer server

`lib/viewer-server.js` starts an HTTP server on a random port for `jscad-work <model.js>` and `render`. It serves the model directory's files, and serves the jscadui viewer app either by proxying jscad.rkroll.com or, when `JSCAD_VIEWER_ROOT` is set, from a local build. It injects an SSE bridge script before `</body>` so open tabs reload on file changes and receive live parameter updates.

The viewer resolves bare package names such as `@jbroll/jscad-anchors` to jsdelivr. When `JSCAD_LOCAL_PACKAGES` names local package directories, the server serves their browser files at `/__studio/packages/<name>/<file>`, uncached, and injects `window.jscadModuleOverrides` (a `{ packageName: url }` map) before `main.js` runs. jscadui's `getBundles` adds those URLs as bundle aliases, so the tab loads the local builds instead of jsdelivr.
