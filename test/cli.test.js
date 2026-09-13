import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, expect, test } from "vitest";
import { RENDER_DIR, runCli, SUBCOMMANDS, VIEWS } from "../mcp/lib/cli.js";

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const BIN = new URL("../bin/jscad-work.js", import.meta.url).pathname;
const catalog = JSON.parse(readFileSync(fx("catalog.fixture.json"), "utf8"));

const dirs = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "cli-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const run = async (argv, io = {}) => {
  const out = [];
  const err = [];
  const code = await runCli(argv, {
    catalog,
    ...io,
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
  });
  const stdout = out.join("\n");
  let json;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code, stdout, stderr: err.join("\n"), json };
};

test("eval reports ok, geometry type, and entity count", async () => {
  const r = await run(["eval", fx("cube.js")]);
  expect(r.code).toBe(0);
  expect(r.json).toEqual({ ok: true, geomType: "geom3", entityCount: 1 });
  expect(r.stderr).toBe("");
});

test("eval exits 1 with the model error and line on stderr", async () => {
  const r = await run(["eval", fx("broken.js")]);
  expect(r.code).toBe(1);
  expect(r.json.ok).toBe(false);
  expect(r.stderr).toMatch(/^error: .*nonExistentMethod.*\(line 4\)$/);
});

test("eval --timeout names the limit and the option", async () => {
  const r = await run(["eval", fx("infinite.js"), "--timeout", "500"]);
  expect(r.code).toBe(1);
  expect(r.json.error).toBe("eval timeout: model ran longer than 500 ms");
  expect(r.stderr).toMatch(/raise it with --timeout MS/);
});

test("params lists declared parameters", async () => {
  const r = await run(["params", fx("cube.js")]);
  expect(r.code).toBe(0);
  expect(r.json.params.find((p) => p.name === "size")).toMatchObject({ default: 10, min: 5 });
});

test("measure applies JSON params", async () => {
  const r = await run(["measure", fx("cube.js"), "-p", '{"size":18}']);
  expect(r.code).toBe(0);
  expect(r.json.measure.dimensions).toEqual([18, 18, 18]);
});

test("params accept non-numeric JSON values", async () => {
  const r = await run(["eval", fx("cube.js"), "--params", '{"size":12,"label":"x","on":true}']);
  expect(r.code).toBe(0);
});

test("check --bed sets fitsBed", async () => {
  const small = await run(["check", fx("cube.js"), "--bed", "5,5,5"]);
  expect(small.code).toBe(0);
  expect(small.json.check.fitsBed).toBe(false);
  const big = await run(["check", fx("cube.js"), "--bed", "220x220x250"]);
  expect(big.json.check.fitsBed).toBe(true);
});

test("export writes the file and prints its path, not the bytes", async () => {
  const dir = tmp();
  const r = await run(["export", fx("cube.js"), "-o", "out/cube.stl"], { cwd: dir });
  expect(r.code).toBe(0);
  const path = join(dir, "out/cube.stl");
  expect(r.json.export).toMatchObject({ path, mime: "model/stl", triangleCount: 12 });
  expect(r.json.export.base64).toBeUndefined();
  expect(statSync(path).size).toBe(r.json.export.bytes);
});

test("export takes the format from the -o extension, else stl beside the cwd", async () => {
  const dir = tmp();
  const obj = await run(["export", fx("cube.js"), "-o", "cube.obj"], { cwd: dir });
  expect(obj.json.export.mime).toMatch(/obj/);
  const dflt = await run(["export", fx("cube.js")], { cwd: dir });
  expect(dflt.json.export.path).toBe(join(dir, "cube.stl"));
  expect(existsSync(join(dir, "cube.stl"))).toBe(true);
});

test("export rejects an unknown format and a geometry mismatch", async () => {
  const dir = tmp();
  const bad = await run(["export", fx("cube.js"), "-o", "cube.png"], { cwd: dir });
  expect(bad.code).toBe(2);
  expect(bad.stderr).toMatch(/unknown format "png"/);
  const svg = await run(["export", fx("cube.js"), "-f", "svg"], { cwd: dir });
  expect(svg.code).toBe(1);
  expect(svg.stderr).toMatch(/requires geomType geom2/);
});

const fakeRender = () => {
  const calls = { closed: 0 };
  return {
    calls,
    module: Promise.resolve({
      renderViews: async (model, opts) => {
        calls.model = model;
        calls.opts = opts;
        return opts.views.map((view, i) => ({ view, path: opts.paths[i] }));
      },
      closeRender: async () => {
        calls.closed++;
      },
    }),
  };
};

test("render defaults to iso and a PNG under the render directory", async () => {
  const dir = tmp();
  const fake = fakeRender();
  const r = await run(["render", fx("cube.js")], { cwd: dir, render: fake.module });
  expect(r.code).toBe(0);
  expect(r.json).toEqual({
    ok: true,
    width: 800,
    height: 600,
    renders: [{ view: "iso", path: join(dir, RENDER_DIR, "cube.js-iso.png") }],
  });
  expect(fake.calls.closed).toBe(1);
});

test("render all views names one PNG per view from -o, with size and params", async () => {
  const dir = tmp();
  const fake = fakeRender();
  const r = await run(
    ["render", fx("cube.js"), "--view", "all", "-o", "shots/cube.png", "--size", "400x300"],
    { cwd: dir, render: fake.module },
  );
  expect(r.code).toBe(0);
  expect(r.json.renders.map((x) => x.view)).toEqual(VIEWS);
  expect(r.json.renders[0].path).toBe(join(dir, "shots/cube-front.png"));
  expect(fake.calls.opts.size).toEqual([400, 300]);
  const one = await run(["render", fx("cube.js"), "--view", "top", "-p", '{"size":7}'], {
    cwd: dir,
    render: fake.module,
  });
  expect(one.json.params).toEqual({ size: 7 });
  expect(fake.calls.opts.params).toEqual({ size: 7 });
});

test("render rejects a bad view or size before starting a browser", async () => {
  const fake = fakeRender();
  const view = await run(["render", fx("cube.js"), "--view", "sideways"], { render: fake.module });
  expect(view.code).toBe(2);
  expect(view.stderr).toMatch(/unknown view "sideways"/);
  const size = await run(["render", fx("cube.js"), "--size", "big"], { render: fake.module });
  expect(size.code).toBe(2);
  expect(fake.calls.closed).toBe(0);
});

test("render failure exits 1 and still closes the browser", async () => {
  let closed = 0;
  const render = Promise.resolve({
    renderViews: async () => {
      throw new Error("model error in viewer: boom");
    },
    closeRender: async () => {
      closed++;
    },
  });
  const r = await run(["render", fx("cube.js")], { cwd: tmp(), render });
  expect(r.code).toBe(1);
  expect(r.stderr).toBe("error: model error in viewer: boom");
  expect(closed).toBe(1);
});

test.skipIf(process.env.JSCAD_RENDER_TEST !== "1")(
  "render writes real PNGs for two views",
  async () => {
    const dir = tmp();
    const r = await run(["render", fx("cube.js"), "--view", "front,iso", "--size", "400x300"], {
      cwd: dir,
    });
    expect(r.code).toBe(0);
    for (const { path } of r.json.renders) expect(statSync(path).size).toBeGreaterThan(1000);
  },
  90000,
);

test("parts lists sibling files and exports", async () => {
  const r = await run(["parts", fx("assembly/top.js")]);
  expect(r.code).toBe(0);
  expect(r.json.parts.map((p) => p.file)).toEqual(["partA.js", "partB.js", "top.js"]);
});

test("library search joins the query words and applies filters", async () => {
  const r = await run(["library", "search", "bearing"]);
  expect(r.code).toBe(0);
  expect(r.json.results[0]).toMatchObject({ id: "mcad/bearing", runs: true });
  const filtered = await run(["library", "search", "--source", "bosl2", "--limit", "1"]);
  expect(filtered.json.results.map((e) => e.id)).toEqual(["bosl2/gear"]);
});

test("library get omits the source text unless asked", async () => {
  const r = await run(["library", "get", "bosl2/gear"]);
  expect(r.code).toBe(0);
  expect(r.json.entry.name).toBe("Spur Gear");
  expect(r.json.path.endsWith("test/fixtures/cube.js")).toBe(true);
  expect(r.json.source).toBeUndefined();
  const full = await run(["library", "get", "bosl2/gear", "--with-source"]);
  expect(full.json.source).toMatch(/jscad-fluent/);
});

test("library get exits 1 for an unknown id; unknown library subcommand exits 2", async () => {
  const missing = await run(["library", "get", "nope"]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toMatch(/no catalog entry "nope"/);
  const bad = await run(["library", "find"]);
  expect(bad.code).toBe(2);
});

let srv;
let port;
let received;
beforeAll(async () => {
  srv = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      received = JSON.parse(body);
      res.end(JSON.stringify({ ok: true, clients: 2 }));
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  port = srv.address().port;
});
afterAll(() => srv.close());

test("live-params posts JSON to the server named in .jscad-studio", async () => {
  const dir = tmp();
  writeFileSync(join(dir, ".jscad-studio"), JSON.stringify({ serverPort: port }));
  const r = await run(["live-params", '{"size":33,"color":"#ff0000"}'], { cwd: dir });
  expect(r.code).toBe(0);
  expect(received).toEqual({ params: { size: 33, color: "#ff0000" } });
  expect(r.json).toEqual({ ok: true, clients: 2 });
});

test("live-params without a server exits 1", async () => {
  const r = await run(["live-params", '{"size":1}'], { cwd: tmp() });
  expect(r.code).toBe(1);
  expect(r.stderr).toMatch(/jscad-work/);
});

test.each([
  [["eval"], /model path required/],
  [["eval", "missing.js"], /no such model file: missing\.js/],
  [["eval", fx("cube.js"), "--params", "{size:1}"], /not valid JSON/],
  [["eval", fx("cube.js"), "--params", "[1]"], /must be a JSON object/],
  [["eval", fx("cube.js"), "--timeout", "0"], /--timeout must be a positive integer/],
  [["measure", fx("cube.js"), "--bogus"], /Unknown option '--bogus'/],
  [["check", fx("cube.js"), "--bed", "1,2"], /--bed takes three positive numbers/],
  [["live-params"], /params JSON required/],
  [["library", "get"], /catalog id required/],
])("usage error exits 2: %j", async (argv, message) => {
  const r = await run(argv);
  expect(r.code).toBe(2);
  expect(r.stderr).toMatch(message);
  expect(r.stderr).toMatch(/usage: jscad-work /);
});

test("every subcommand prints help and exits 0", async () => {
  for (const argv of [
    ["eval"],
    ["params"],
    ["measure"],
    ["check"],
    ["export"],
    ["render"],
    ["parts"],
    ["library", "search"],
    ["library", "get"],
    ["live-params"],
  ]) {
    const r = await run([...argv, "--help"]);
    expect(r.code, argv.join(" ")).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`^jscad-work ${argv.join(" ")}`));
  }
  expect((await run(["library"])).stdout).toMatch(/library search/);
});

test("subcommand names cannot be mistaken for model files", () => {
  for (const name of SUBCOMMANDS) expect(name).not.toMatch(/\.(js|scad)$/);
  expect([...SUBCOMMANDS].sort()).toEqual([
    "check",
    "eval",
    "export",
    "library",
    "live-params",
    "measure",
    "params",
    "parts",
    "render",
  ]);
});

const execBin = promisify(execFile);

test("the jscad-work binary dispatches subcommands with exit codes", async () => {
  const ok = await execBin(process.execPath, [BIN, "measure", fx("cube.js")]);
  expect(JSON.parse(ok.stdout).measure.dimensions).toEqual([10, 10, 10]);
  const failed = await execBin(process.execPath, [BIN, "eval", fx("broken.js")]).catch((e) => e);
  expect(failed.code).toBe(1);
  expect(failed.stderr).toMatch(/nonExistentMethod/);
  const usage = await execBin(process.execPath, [
    BIN,
    "render",
    fx("cube.js"),
    "--view",
    "x",
  ]).catch((e) => e);
  expect(usage.code).toBe(2);
});
