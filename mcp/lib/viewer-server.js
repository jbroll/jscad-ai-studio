import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolve as pathResolve } from "node:path";

const UPSTREAM_HOST = "jscad.rkroll.com";
const UPSTREAM_PORT = 443;

const MIME_TYPES = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
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

export const startViewerServer = (directory) =>
  new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const { pathname } = new URL(req.url, `http://${req.headers.host}`);
      if (pathname === "/") return proxyToUpstream(req, res, "/");
      try {
        const localPath = pathResolve(directory, `.${pathname}`);
        const content = await readFile(localPath);
        const ext = localPath.substring(localPath.lastIndexOf("."));
        res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
        res.end(content);
      } catch (err) {
        if (err.code === "ENOENT") return proxyToUpstream(req, res, pathname);
        res.writeHead(500);
        res.end("Server error");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, viewerUrl: (model) => `http://127.0.0.1:${port}/#${model}` });
    });
    server.on("error", reject);
  });
