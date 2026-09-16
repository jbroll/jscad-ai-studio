# Hosted JSCAD studio

A browser product where a user describes a part in chat, an agent writes the
model, and the model renders in the page. The server never runs model code and
never holds a model provider's key. Rendering, measuring and checking all happen
in the user's browser, which is where the existing viewer already does that work.

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
- Model files stored per user, with version history.
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
- checklist deploys as an Apache-served Vite bundle plus an Express service under
  systemd, configured by `deploy.conf` and `deploy-full.sh`, with BetterAuth
  (Google and Apple) issuing JWTs.
- rowboat holds per-tenant SQLite databases and an S3-compatible object store,
  with metering and quota plugins.
- OpenCode Zen's terms allow "your own internal use, and not on behalf of or for
  the benefit of any third party", so a server key shared across paying users
  does not fit. A key the user supplies does.

## Architecture

Two web origins, one server, and no model code on the server.

```
app.example.com  (Vite bundle + Express API)
  chat panel, editor, model list, auth, key custody
        |  postMessage
        v
run.example.com  (static execution page, sandboxed iframe)
  jscadui viewer + worker: evaluate, render, measure, check, export
```

- **The app origin** holds the session, the model files, and the key. It talks to
  the model provider and to the database.
- **The run origin** holds the viewer and runs model code. It has no session, no
  cookies from the app, and no access to the app's storage.
- The iframe is `<iframe sandbox="allow-scripts">` without `allow-same-origin`,
  so the frame gets an opaque origin even against its own host.
- Everything between them crosses by `postMessage`, in the shape the worker
  protocol already uses.

### Why the boundary exists

Model code is JavaScript with the privileges of the origin that serves it. On a
single origin, a model a user opened from someone else could call the app's API
with that user's cookie, read their models, read a key held in IndexedDB, scan
the local network, and exfiltrate all of it. The browser protects the server from
the model; it does not protect the user. The separate origin makes those calls
cross-origin, where CORS refuses them, and leaves the model with a tab's CPU and
nothing else.

The boundary costs little now and is expensive to retrofit, so the first release
builds it even though the first release has no sharing.

## Components

### Execution page (run origin)

A static page: the jscadui build, the worker, and a message handler. Commands in,
results out, no storage of its own.

Commands from the app:

| Command | Payload | Result |
|---|---|---|
| `load` | model source, file name, sibling files | parameter definitions, geometry summary, or a model error |
| `params` | parameter values | geometry summary, or a model error |
| `measure` | options (`parts`, `between`, `anchors`, `section`) | the same JSON `jscad-work measure` returns |
| `check` | bed size, options | the same JSON `jscad-work check` returns |
| `view` | view name, size, section | a PNG data URL captured from the canvas |
| `export` | format | the exported bytes |

Rules:

- Every command carries an id, and every result echoes it.
- A model error is a result, never an exception that stops the page.
- A model that does not finish inside a timeout is cancelled by terminating the
  worker, and the page reports the timeout.
- The page accepts messages only from the app origin, checked against
  `event.origin`.
- Its CSP allows scripts from itself and the package CDN, `connect-src` the
  package CDN only, and `frame-ancestors` the app origin. A
  `Permissions-Policy` header turns off camera, microphone, geolocation, USB and
  serial.

The measure and check code moves out of `jscad-ai-studio/lib` into a package both
the CLI and this page use, so the browser and the CLI report the same numbers.

### Chat and agent loop (app server)

The server owns the conversation and the tool loop:

1. Take the user's message, the model source, and the conversation so far.
2. Call the provider with the tool definitions.
3. When the provider asks for a tool, forward the request to the browser, which
   relays it to the run frame and returns the result.
4. Feed the result back to the provider, and repeat until it answers.
5. Stream assistant text to the browser as it arrives.

Tools exposed to the model: the execution commands above, plus `writeModel`,
which replaces the model source and creates a version.

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
   never sent to the server and never enters the run frame. Workers cannot read
   `localStorage`, and the run frame cannot read the app origin's storage at all.
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

### Storage

Per user:

- **Models.** Files as blobs in rowboat's object store, with metadata (name,
  model file, created, updated) in the user's database.
- **Versions.** Every `writeModel` and every editor save writes a version row and
  a blob. The UI shows the list and a diff.
- **Conversations.** Messages per model, so a session resumes where it stopped.
- **Settings.** Provider choice, model id, and the encrypted key blob when mode 3
  is used.

Identity, sharing and billing tables stay in the app's own SQLite, as checklist
does. Model data lives in rowboat.

### Authentication

BetterAuth with Google and Apple, as checklist wires it, issuing a JWT the API
checks on every request. Every query is scoped by user id at the data layer, not
by the caller passing one.

## Deployment

Following checklist's split, with one addition, the second origin:

- `app.example.com`: Apache serves the Vite bundle and proxies `/api` to the
  Express service under systemd.
- `run.example.com`: Apache serves the static execution page. No proxy, no API.
- `deploy.conf` with `DEPLOY_TYPES="letsencrypt apache_proxy node_app"` for the
  app host, and a static entry for the run host.
- The run bundle is built from jscadui, as `jscad-work` builds it today.

Operational requirements: a health endpoint the deploy checks, structured logs,
and a backup of the identity database alongside rowboat's own backups.

## Testing

- **Unit.** Provider clients against recorded responses. The agent loop against a
  fake provider that asks for each tool in turn. Key encryption round-trip,
  including a wrong passphrase.
- **Execution page.** Headless browser tests driving the page by `postMessage`:
  each command, a model error, a timeout, and a message from a wrong origin being
  ignored.
- **Parity.** The same fixture models measured through the page and through
  `jscad-work measure`, asserting identical JSON. This is what keeps the browser
  and CLI honest as the shared package changes.
- **Security.** A test model that tries to `fetch` the app API from the frame and
  must fail, and a check that the frame cannot read app-origin storage.
- **End to end.** Sign in, create a model, one chat turn that writes geometry,
  render a view, export an STL.

## Risks

- **An open tab is required for any agent turn.** A user who closes the tab
  mid-turn loses it. Mitigation: the conversation is server-side, so the turn can
  be retried, not resumed.
- **The package CDN is a supply chain.** A model that requires a package runs
  whatever that package currently is. The origin boundary limits the damage to
  the frame.
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
