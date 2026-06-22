import { get, request } from "node:http";
import { afterAll, beforeAll, expect, test } from "vitest";
import { injectBridge, startViewerServer } from "../mcp/lib/viewer-server.js";

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
