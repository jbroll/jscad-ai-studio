import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { liveParams } from "../mcp/lib/live-params.js";

let srv;
let port;
let received;
beforeAll(async () => {
  srv = createServer((req, res) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
    });
    req.on("end", () => {
      received = JSON.parse(b);
      res.end(JSON.stringify({ ok: true, clients: 1 }));
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  port = srv.address().port;
});
afterAll(() => srv.close());

test("posts params to the server named in .jscad-studio", async () => {
  const dir = mkdtempSync(join(tmpdir(), "live-"));
  writeFileSync(join(dir, ".jscad-studio"), JSON.stringify({ serverPort: port }));
  const res = await liveParams({ size: 7 }, { cwd: dir });
  expect(received).toEqual({ params: { size: 7 } });
  expect(res).toEqual({ ok: true, clients: 1 });
  rmSync(dir, { recursive: true, force: true });
});

test("throws a clear error when no .jscad-studio is present", async () => {
  const dir = mkdtempSync(join(tmpdir(), "live-none-"));
  await expect(liveParams({ size: 1 }, { cwd: dir })).rejects.toThrow(/jscad-work/);
  rmSync(dir, { recursive: true, force: true });
});
