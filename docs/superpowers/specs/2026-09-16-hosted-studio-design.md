# Hosted JSCAD studio

A browser product where a user describes a part in chat, an agent writes the
model, and the model renders in the page. The server never runs model code and
never holds a model provider's key. Evaluating a model, measuring it and
checking it all happen in the user's browser, which is where the existing viewer
already does that work.

Comparable product: modelrift.com, which generates OpenSCAD from chat, renders in
the browser, and bills credits for tokens. This design keeps JSCAD and OpenSCAD
both, adds the verification loop `jscad-work` already has, and does not resell
tokens.

## Scope

In scope for the first release:

- Sign in, and per-user private models.
- A chat panel that drives an agent loop against the user's own provider key.
- The jscadui viewer rendering the current model, with parameter controls.
- A code editor on the model file, with the agent and the user editing the same file.
- The agent's tools: evaluate, measure, check, render a view, export.
- Model files stored per user, with version history, in one of three modes: cloud
  storage, a linked local folder, or a connected git repository.
- Export of STL, 3MF, OBJ and SVG.

Out of scope for the first release, and shaped for later:

- Public model links and a gallery.
- Teams, comments, and anything multi-writer.
- Server-side model execution and background jobs.
- Selling tokens, metering, and credits.
- STEP or any B-rep export.

## Findings this design rests on

- The jscadui viewer evaluates models in a web worker and renders with the
  Manifold kernel in the browser (`jscadui/packages/worker`,
  `jscadui/packages/manifold`). OpenSCAD models transpile to JavaScript and run
  the same way (`jscadui/packages/openscad`).
- The worker already serializes its result to the main thread as plain data
  (`jscadui/packages/format-common`, `format-jscad`, `format-threejs`), and the
  main thread draws it. The split this design needs already exists; it gains one
  hop across an origin.
- `jscad-work`'s model tools (`eval`, `params`, `measure`, `check`, `dfm`,
  `interference`, `export`) are Node code today, but they compute from geometry
  the worker already produces.
- `jscad-work render` drives a headless browser to screenshot the viewer. In a
  page that is already open, the same picture comes from the live canvas.
- Model code can `require` packages, which the viewer's loader fetches from
  jsdelivr (`jscadui/packages/require/src/resolveUrl.js`). Model code therefore
  performs network requests as the page's origin.
- A dedicated worker has `fetch`, `importScripts`, IndexedDB, WebSocket and the
  Cache API. It has no DOM and no `localStorage`.
- `postMessage` to an iframe takes a transfer list, so geometry buffers cross
  origins without being copied.
- checklist deploys as an Apache-served Vite bundle plus an Express service under
  systemd, configured by `deploy.conf` and `deploy-full.sh`, with BetterAuth
  (Google and Apple) issuing JWTs.
- rowboat holds per-tenant SQLite databases and an S3-compatible object store,
  with metering and quota plugins.
- OpenCode Zen's terms allow "your own internal use, and not on behalf of or for
  the benefit of any third party", so a server key shared across paying users
  does not fit. A key the user supplies does.

## Architecture

Two web origins, one server, and no model code on the server or on the origin the
user browses.

```
app.example.com  (Vite bundle + Express API)
  chat, editor, model list, auth, key custody
  viewer canvas, camera, parameter controls, view capture
        |  postMessage: source and parameters down, geometry and results up
        v
run.example.com  (invisible sandboxed iframe, no UI)
  worker: evaluate the model, compute measurements, export
```

- **The app origin** holds the session, the model files, the key, and everything
  the user sees, including the canvas. It talks to the model provider and the
  database.
- **The run origin** is a headless compute frame. It evaluates model code and
  returns data. It has no session, no cookies from the app, no access to the
  app's storage, and nothing to display.
- The iframe is `<iframe sandbox="allow-scripts">` without `allow-same-origin`,
  so the frame gets an opaque origin even against its own host. It is hidden.
- Everything between them crosses by `postMessage`, in the shape the worker
  protocol already uses.

### Why the boundary exists, and where it falls

Model code is JavaScript with the privileges of the origin that serves it. On a
single origin, a model a user opened from someone else could call the app's API
with that user's cookie, read their models, read a key held in IndexedDB, scan
the local network, and exfiltrate all of it. The browser protects the server from
the model; it does not protect the user. The separate origin makes those calls
cross-origin, where CORS refuses them, and leaves the model with a hidden frame's
CPU and nothing else.

The boundary falls between evaluating and drawing, not between the user and the
picture. Evaluating a model runs arbitrary code, including `require` from a CDN
and transpiled OpenSCAD, so it belongs in the frame. What comes back is plain
data, vertex and normal arrays, colors, transforms and JSON, which cannot execute
anything. Drawing that data, and every control around it, stays on the app
origin. Any feature that would evaluate model code on the app origin removes the
boundary, however convenient it looks.

The boundary costs little now and is expensive to retrofit, so the first release
builds it even though the first release has no sharing.

## Components

### Compute frame (run origin)

A static page with no UI: the jscadui worker, the module loader, and a message
handler. Commands in, data out, no storage of its own.

| Command | Payload | Result |
|---|---|---|
| `load` | model source, file name, sibling files | parameter definitions and geometry, or a model error |
| `params` | parameter values | geometry, or a model error |
| `measure` | options (`parts`, `between`, `anchors`, `section`) | the same JSON `jscad-work measure` returns |
| `check` | bed size, options | the same JSON `jscad-work check` returns |
| `export` | format | the exported bytes |

Geometry is the serialized form the worker already produces, with the buffers in
the transfer list.

Rules:

- Every command carries an id, and every result echoes it.
- A model error is a result, never an exception that stops the frame.
- A model that does not finish inside a timeout is cancelled by terminating the
  worker, and the frame reports the timeout.
- The frame accepts messages only from the app origin, checked against
  `event.origin`.
- Its CSP allows scripts from itself and the package CDN, `connect-src` the
  package CDN only, and `frame-ancestors` the app origin. A
  `Permissions-Policy` header turns off camera, microphone, geolocation, USB and
  serial.

The measure and check code moves out of `jscad-ai-studio/lib` into a package both
the CLI and this frame use, so the browser and the CLI report the same numbers.

### Viewer (app origin)

The jscadui renderer, camera, gizmo and parameter controls, drawing the geometry
the frame returns. It owns the canvas, so view presets, sections and captures are
local operations:

- A view is a camera position plus a canvas capture, which is how the agent's
  `view` tool is served. The canvas is never tainted, because data crossed the
  boundary, not an image.
- Parameter edits go to the frame as a `params` command and come back as
  geometry.

Because geometry is untrusted input, the viewer caps what it will accept before
drawing: a maximum vertex count and total buffer size per result, and a maximum
number of entities. Over the cap, it reports a model error instead of allocating.

### Chat and agent loop (app server)

The server owns the conversation and the tool loop:

1. Take the user's message, the model source, and the conversation so far.
2. Call the provider with the tool definitions.
3. When the provider asks for a tool, forward the request to the browser. The
   browser answers from the viewer (`view`) or relays to the compute frame
   (everything else) and returns the result.
4. Feed the result back to the provider, and repeat until it answers.
5. Stream assistant text to the browser as it arrives.

Tools exposed to the model: `eval`, `params`, `measure`, `check`, `view`,
`export`, and `writeModel`, which replaces the model source and creates a
version.

The loop runs on the server so the prompt, the tool definitions and the
conversation stay under the product's control, and so a reload does not lose an
in-flight turn. Tool execution stays in the browser. A turn therefore needs an
open tab, which is acceptable for interactive design and rules out background
jobs until a server runner exists.

Streaming uses SSE from the app server to the page. Tool traffic rides the same
channel, with the browser POSTing results back.

### Provider abstraction

One interface, shaped like the Anthropic SDK's `messages.create`, matching the
clients already in `scripts/lib/` (`claude-cli-client.js`, `ollama-client.js`).
Implementations at first release:

- Anthropic.
- Any OpenAI-compatible endpoint, which covers OpenCode Zen, OpenAI itself, and
  most gateways.

The key belongs to the user in every case. A later hosted-key tier would need a
provider whose terms allow serving end users, and is not part of this design.

### Key custody

Three modes, in the order a user meets them:

1. **Session only.** The key lives in memory, and the user pastes it each
   session. Nothing is stored.
2. **This device.** The key is stored in `localStorage` on the app origin. It is
   never sent to the server and never enters the compute frame. Workers cannot
   read `localStorage`, and the frame cannot read the app origin's storage at
   all.
3. **Synced.** The key is encrypted in the browser with WebCrypto, AES-GCM under
   a key derived from a passphrase with PBKDF2, and the ciphertext is stored as a
   per-user blob. The passphrase never leaves the browser, and the server cannot
   decrypt. Losing the passphrase means re-entering the key.

GPG is not used in the browser: there is no GPG there, shipping OpenPGP.js
reintroduces the same question of where the private key lives, and WebCrypto
gives the same property with less to carry. The CLI may read a key from the
user's GPG setup, which is a separate path.

The key reaches the provider from the app server, which holds it only for the
duration of a request.

### Projects

A model is a project: a map of path to file, plus one entry path. The type of
each file is its extension, as both sides already decide it today, the CLI at
`jscad-ai-studio/lib/model-loader.js:42` and the viewer's loader at
`jscadui/apps/jscad-web/src_bundle/bundle.worker.js:78` with
`jscadui/packages/require/src/require.js:90`. A `.js` entry may require a `.scad`
part; the entry's extension only decides which pipeline starts. Content is never
sniffed. A `kind` field is stored for listing and filtering, derived from the
entry name and recomputed whenever the entry is renamed or replaced.

References resolve inside the project's file map, which is what replaces the
served directory the CLI relies on. Bare package names go to the package CDN.
OpenSCAD `include <...>` and `use <...>` resolve against a hosted library set,
kept separate from the project so a user's file cannot shadow a library.

### Storage modes

A project uses one of three modes, chosen when it is created and changeable
later. In every mode the stored artifact is plain text files, and a project can
be exported or imported as a zip. There is no proprietary document format.

1. **Cloud (default).** Files as blobs in rowboat's object store, with metadata
   in the user's database. Every `writeModel` and every editor save writes a
   version row and a blob, and the UI shows the list and a diff.
2. **Linked local folder.** `showDirectoryPicker()` gives the app a handle to a
   real directory, stored in IndexedDB so it reconnects on later visits, with the
   permission re-granted per session. The app reads and writes the user's own
   files, and their git works as it does with the CLI today. Available on
   Chromium desktop only: Firefox and Safari expose the origin private file
   system, which git cannot see, and mobile browsers have no directory picker.
   Those users get the cloud or git modes.
3. **Connected git repository.** Opt-in, through a GitHub App the user installs
   on the repositories they choose, which yields a short-lived installation token
   scoped to those repositories. A classic personal access token is not used. The
   app reads and writes files through the Contents API, one commit per finished
   agent turn or explicit save, with a message the agent writes from what it
   changed and measured. Writes are confined to the project's paths, carry the
   file SHA so a concurrent edit fails rather than overwrites, and never force
   push. Disconnecting deletes the token. GitLab, Gitea and plain git hosts can
   follow behind the same interface.

When a folder or a repository is linked, that is the source of truth and the
app's version rows are a cache. Files never reach the compute frame in any mode;
it receives source text and returns data.

Also stored per user, in every mode: conversations per project, so a session
resumes where it stopped, and settings, meaning provider choice, model id, and
the encrypted key blob when key mode 3 is used.

Identity, sharing and billing tables stay in the app's own SQLite, as checklist
does. Cloud project data lives in rowboat.

### Authentication

BetterAuth with Google and Apple, as checklist wires it, issuing a JWT the API
checks on every request. Every query is scoped by user id at the data layer, not
by the caller passing one.

## Deployment

Following checklist's split, with one addition, the second origin:

- `app.example.com`: Apache serves the Vite bundle and proxies `/api` to the
  Express service under systemd.
- `run.example.com`: Apache serves the static compute frame. No proxy, no API.
- `deploy.conf` with `DEPLOY_TYPES="letsencrypt apache_proxy node_app"` for the
  app host, and a static entry for the run host.
- Both bundles are built from jscadui, as `jscad-work` builds it today: the
  renderer into the app bundle, the worker and loader into the frame.

Operational requirements: a health endpoint the deploy checks, structured logs,
and a backup of the identity database alongside rowboat's own backups.

## Testing

- **Unit.** Provider clients against recorded responses. The agent loop against a
  fake provider that asks for each tool in turn. Key encryption round-trip,
  including a wrong passphrase.
- **Compute frame.** Headless browser tests driving the frame by `postMessage`:
  each command, a model error, a timeout, a message from a wrong origin being
  ignored, and geometry arriving as transferred buffers.
- **Viewer caps.** A result over the vertex and buffer caps is refused as a model
  error rather than allocated.
- **Parity.** The same fixture models measured through the frame and through
  `jscad-work measure`, asserting identical JSON. This is what keeps the browser
  and CLI honest as the shared package changes.
- **Security.** A test model that tries to `fetch` the app API from the frame and
  must fail, and a check that the frame cannot read app-origin storage.
- **Storage modes.** Reads and writes through each mode against the same project
  fixture: cloud blobs, a folder handle faked in the test, and a git adapter
  against a recorded API. The git adapter must fail the write when the file SHA
  has moved, and must not touch paths outside the project.
- **End to end.** Sign in, create a model, one chat turn that writes geometry,
  render a view, export an STL.

## Risks

- **An open tab is required for any agent turn.** A user who closes the tab
  mid-turn loses it. Mitigation: the conversation is server-side, so the turn can
  be retried, not resumed.
- **The package CDN is a supply chain.** A model that requires a package runs
  whatever that package currently is. The origin boundary limits the damage to
  the frame.
- **Oversized geometry.** A model can return buffers large enough to exhaust the
  tab. The viewer's caps are the defense, and they must be enforced before the
  first allocation.
- **Write access to a user's repository.** The git mode makes the app a writer on
  a real repository. Confining writes to the project's paths, requiring the file
  SHA, never force pushing, and showing the diff before the first commit of a
  session are what keep a bad turn from costing someone their history.
- **A directory handle can go stale.** A moved or deleted folder, or a denied
  permission on a later visit, leaves a project pointing at nothing. The app has
  to detect that and offer to relink or switch modes rather than silently writing
  to the cloud copy.
- **Parity drift.** If the browser's measure and the CLI's measure diverge, the
  agent's checks stop meaning what the docs say. The parity tests exist for this.
- **Provider variance.** Tool-calling differs between providers. The loop should
  treat a provider that cannot call tools as unsupported rather than degrade
  silently.

## Open questions

1. The product's name and domains, which the two origins need.
2. Whether the first release includes the code editor, or ships chat and viewer
   only and adds editing next.
3. Whether OpenSCAD models are offered at first release. The viewer supports
   them, and the corpus pass rates are known per library, so this is a question
   of which libraries to claim.
4. Whether model storage uses rowboat as a service, as checklist does, or a
   local database with rowboat's object store package.
