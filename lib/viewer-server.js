import { existsSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { dirname, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";

const UPSTREAM_HOST = "jscad.rkroll.com";
const UPSTREAM_PORT = 443;

const BRIDGE_SCRIPT = `(()=>{try{const es=new EventSource('/__studio/events');es.onmessage=(e)=>{try{const d=JSON.parse(e.data);if(d.reload){location.reload();return;}if(window.jscadStudio&&d.params)window.jscadStudio.setParams(d.params);}catch{}};}catch{}})()`;

export const shouldReload = (filename) => {
  if (!filename) return false;
  const base = filename.split("/").pop();
  if (base.startsWith(".") || base === "JSCAD.md") return false;
  return base.endsWith(".js") || base.endsWith(".scad");
};

export const injectBridge = (html, overrides = {}) => {
  const prefix = Object.keys(overrides).length
    ? `window.jscadModuleOverrides = ${JSON.stringify(overrides)};`
    : "";
  const bridge = `<script>${prefix}${BRIDGE_SCRIPT}</script>`;
  return html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : html + bridge;
};

const sseClients = new Set();

const handleSse = (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
};

const handleParamsPost = (req, res) => {
  let body = "";
  req.on("data", (c) => {
    body += c;
  });
  req.on("end", () => {
    let payload = {};
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      /* ignore malformed */
    }
    const frame = `data: ${JSON.stringify({ params: payload.params ?? {} })}\n\n`;
    for (const client of sseClients) client.write(frame);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: sseClients.size }));
  });
};

const MIME_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
  ".manifest": "application/manifest+json",
  ".html": "text/html",
  ".css": "text/css",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".stl": "model/stl",
  ".scad": "text/plain",
  ".obj": "text/plain",
  ".mtl": "text/plain",
  ".3mf": "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
  ".amf": "application/x-amf",
  ".dxf": "application/dxf",
  ".x3d": "model/x3d+xml",
};

const PACKAGES_PREFIX = "/__studio/packages/";

export const readLocalPackages = async (list, cwd = process.cwd()) => {
  const entries = (list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return Promise.all(
    entries.map(async (entry) => {
      const dir = pathResolve(cwd, entry);
      let raw;
      try {
        raw = await readFile(pathResolve(dir, "package.json"), "utf8");
      } catch {
        throw new Error(`no package.json in ${entry}`);
      }
      let pkg;
      try {
        pkg = JSON.parse(raw);
      } catch {
        throw new Error(`invalid package.json in ${entry}`);
      }
      if (!pkg.name) throw new Error(`no name in ${entry}/package.json`);
      const browser = typeof pkg.browser === "string" ? pkg.browser : undefined;
      const file = (pkg.jsdelivr ?? browser ?? pkg.main ?? "index.js").replace(/^\.\//, "");
      if (!existsSync(pathResolve(dir, file)))
        throw new Error(`no ${file} in ${entry}; run npm run build there`);
      return { name: pkg.name, dir, file };
    }),
  );
};

const packageUrls = (packages, port) =>
  Object.fromEntries(
    packages.map(({ name, file }) => [
      name,
      `http://127.0.0.1:${port}${PACKAGES_PREFIX}${name}/${file}`,
    ]),
  );

const servePackage = async (res, packages, pathname) => {
  const pkg = packages.find(({ name, file }) => pathname === `${PACKAGES_PREFIX}${name}/${file}`);
  if (!pkg) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const content = await readFile(pathResolve(pkg.dir, pkg.file));
  res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-store" });
  res.end(content);
};

const proxyToUpstream = (req, res, pathname) => {
  const proxyReq = httpsRequest(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: pathname,
      method: req.method,
      headers: { ...req.headers, host: UPSTREAM_HOST },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502);
    res.end("Proxy error");
  });
  req.pipe(proxyReq);
};

const proxyHtmlWithInjection = (req, res, overrides) => {
  const proxyReq = httpsRequest(
    {
      hostname: UPSTREAM_HOST,
      port: UPSTREAM_PORT,
      path: "/",
      method: req.method,
      headers: { ...req.headers, host: UPSTREAM_HOST, "accept-encoding": "identity" },
    },
    (proxyRes) => {
      const chunks = [];
      proxyRes.on("data", (c) => chunks.push(c));
      proxyRes.on("end", () => {
        const html = injectBridge(Buffer.concat(chunks).toString("utf8"), overrides);
        const headers = { ...proxyRes.headers };
        delete headers["content-length"];
        delete headers["content-encoding"];
        res.writeHead(proxyRes.statusCode, headers);
        res.end(html);
      });
    },
  );
  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err.message);
    res.writeHead(502);
    res.end("Proxy error");
  });
  req.pipe(proxyReq);
};

const serveFile = async (res, root, pathname) => {
  const localPath = pathResolve(root, `.${pathname}`);
  const content = await readFile(localPath);
  const ext = localPath.substring(localPath.lastIndexOf("."));
  res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
  res.end(content);
};

const serveLocalHtml = async (res, viewerRoot, overrides) => {
  const html = await readFile(pathResolve(viewerRoot, "index.html"), "utf8");
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(injectBridge(html, overrides));
};

const REPO_ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..");

const defaultViewerRoot = (siblingRoot) => {
  const dir = pathResolve(siblingRoot, "jscadui/apps/jscad-web/build");
  return existsSync(pathResolve(dir, "index.html")) ? dir : undefined;
};

const defaultLocalPackages = (siblingRoot) => {
  const anchors = pathResolve(siblingRoot, "jscad-anchors");
  const fluent = pathResolve(siblingRoot, "jscad-fluent");
  const hasAnchors = existsSync(pathResolve(anchors, "dist/jscad-anchors.cjs"));
  const hasFluent = existsSync(pathResolve(fluent, "dist/jscad-fluent.umd.cjs"));
  return hasAnchors && hasFluent ? `${anchors},${fluent}` : undefined;
};

// `viewerRoot` is a built jscadui viewer served in place of jscad.rkroll.com; unset
// JSCAD_VIEWER_ROOT/JSCAD_LOCAL_PACKAGES default to the sibling builds next to this repo.
export const startViewerServer = async (
  directory,
  {
    siblingRoot = pathResolve(REPO_ROOT, ".."),
    viewerRoot = process.env.JSCAD_VIEWER_ROOT ?? defaultViewerRoot(siblingRoot),
    localPackages = process.env.JSCAD_LOCAL_PACKAGES ?? defaultLocalPackages(siblingRoot),
  } = {},
) => {
  if (viewerRoot && !existsSync(pathResolve(viewerRoot, "index.html")))
    throw new Error(
      `no viewer build at ${viewerRoot}: run \`node build.js --skipDocs\` in ../jscadui/apps/jscad-web`,
    );
  const packages = await readLocalPackages(localPackages);
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const { pathname } = new URL(req.url, `http://${req.headers.host}`);
      if (pathname === "/__studio/events") return handleSse(req, res);
      if (pathname === "/__studio/params" && req.method === "POST")
        return handleParamsPost(req, res);
      try {
        if (pathname.startsWith(PACKAGES_PREFIX))
          return await servePackage(res, packages, pathname);
        if (pathname === "/") {
          const overrides = packageUrls(packages, server.address().port);
          if (viewerRoot) return await serveLocalHtml(res, viewerRoot, overrides);
          return proxyHtmlWithInjection(req, res, overrides);
        }
        try {
          return await serveFile(res, directory, pathname);
        } catch (err) {
          if (err.code !== "ENOENT") throw err;
          if (!viewerRoot) return proxyToUpstream(req, res, pathname);
          return await serveFile(res, viewerRoot, pathname);
        }
      } catch (err) {
        res.writeHead(err.code === "ENOENT" ? 404 : 500);
        res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();

      let reloadTimer = null;
      const scheduleReload = () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          const frame = `data: ${JSON.stringify({ reload: true })}\n\n`;
          for (const client of sseClients) client.write(frame);
        }, 150);
      };
      let watcher = null;
      try {
        watcher = watch(directory, { recursive: true }, (_event, filename) => {
          if (shouldReload(filename)) scheduleReload();
        });
        watcher.on("error", (err) => console.error("file watch error:", err.message));
      } catch (err) {
        console.error("file watch unavailable, auto-reload disabled:", err.message);
      }
      server.on("close", () => {
        if (watcher) watcher.close();
        clearTimeout(reloadTimer);
      });

      resolve({
        server,
        port,
        viewerUrl: (model) => `http://127.0.0.1:${port}/#${model}`,
        localPackages: packages,
      });
    });
    server.on("error", reject);
  });
};
