import { afterAll, expect, test } from "vitest";
import { startViewerServer } from "../mcp/lib/viewer-server.js";

let handle;
afterAll(() => handle?.server.close());

test("serves a local model file", async () => {
  const dir = new URL("./fixtures/", import.meta.url).pathname;
  handle = await startViewerServer(dir);
  const res = await fetch(`http://127.0.0.1:${handle.port}/cube.js`);
  const body = await res.text();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/javascript/);
  expect(body).toMatch(/module.exports/);
});

test("viewerUrl formats the hash", () => {
  expect(handle.viewerUrl("cube.js")).toBe(`http://127.0.0.1:${handle.port}/#cube.js`);
});
