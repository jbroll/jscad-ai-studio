import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { injectBridge, shouldReload, startViewerServer } from "../mcp/lib/viewer-server.js";

test("injectBridge inserts the EventSource bridge before </body>", () => {
  const out = injectBridge("<html><body><div>x</div></body></html>");
  expect(out).toMatch(/EventSource\('\/__studio\/events'\)/);
  expect(out.indexOf("__studio/events")).toBeLessThan(out.indexOf("</body>"));
});

let srv;
beforeAll(async () => {
  const dir = new URL("./fixtures/", import.meta.url).pathname;
  srv = await startViewerServer(dir);
});
afterAll(() => srv.server.close());

test("serves a local model file", async () => {
  const res = await fetch(`http://127.0.0.1:${srv.port}/cube.js`);
  const body = await res.text();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/javascript/);
  expect(body).toMatch(/module.exports/);
});

test("viewerUrl formats the hash", () => {
  expect(srv.viewerUrl("cube.js")).toBe(`http://127.0.0.1:${srv.port}/#cube.js`);
});

test("shouldReload: true for js/scad, false for dotfiles/JSCAD.md/null", () => {
  expect(shouldReload("model.js")).toBe(true);
  expect(shouldReload("parts/bearing.scad")).toBe(true);
  expect(shouldReload(".jscad-studio")).toBe(false);
  expect(shouldReload("JSCAD.md")).toBe(false);
  expect(shouldReload(".hidden.js")).toBe(false);
  expect(shouldReload(null)).toBe(false);
});

// Collect SSE frames containing a substring, for `ms`, then resolve the matches.
const collectFrames = (port, match, ms) =>
  new Promise((resolve) => {
    const hits = [];
    const req = get({ host: "127.0.0.1", port, path: "/__studio/events" }, (res) => {
      res.setEncoding("utf8");
      res.on("data", (c) => {
        if (c.includes(match)) hits.push(c);
      });
    });
    setTimeout(() => {
      req.destroy();
      resolve(hits);
    }, ms);
  });

test("editing a served .js file broadcasts a reload; editing .jscad-studio does not", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lr-"));
  const srv = await startViewerServer(dir);
  try {
    // .js change → exactly one reload (debounced) within the window
    const jsHits = collectFrames(srv.port, '"reload":true', 1200);
    await new Promise((r) => setTimeout(r, 150)); // let the SSE client connect
    writeFileSync(join(dir, "model.js"), "// v1");
    writeFileSync(join(dir, "model.js"), "// v2");
    writeFileSync(join(dir, "model.js"), "// v3");
    expect((await jsHits).length).toBe(1);

    // .jscad-studio change → no reload
    const cfgHits = collectFrames(srv.port, '"reload":true', 800);
    await new Promise((r) => setTimeout(r, 150));
    writeFileSync(join(dir, ".jscad-studio"), '{"pid":1}');
    expect((await cfgHits).length).toBe(0);
  } finally {
    srv.server.close();
    rmSync(dir, { recursive: true, force: true });
  }
}, 15000);

test("SSE: a /__studio/params POST is delivered to connected /__studio/events clients", async () => {
  const received = await new Promise((resolve, reject) => {
    const req = get({ host: "127.0.0.1", port: srv.port, path: "/__studio/events" }, (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        if (chunk.includes("data:")) resolve(chunk);
      });
    });
    req.on("error", reject);
    // once connected, POST a param command
    setTimeout(() => {
      const post = request(
        {
          host: "127.0.0.1",
          port: srv.port,
          path: "/__studio/params",
          method: "POST",
          headers: { "content-type": "application/json" },
        },
        () => {},
      );
      post.end(JSON.stringify({ params: { size: 42 } }));
    }, 100);
  });
  expect(received).toContain('"size":42');
});
