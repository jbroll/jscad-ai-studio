import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { get, request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
  injectBridge,
  readLocalPackages,
  shouldReload,
  startViewerServer,
} from "../lib/viewer-server.js";

test("injectBridge inserts the EventSource bridge before </body>", () => {
  const out = injectBridge("<html><body><div>x</div></body></html>");
  expect(out).toMatch(/EventSource\('\/__studio\/events'\)/);
  expect(out.indexOf("__studio/events")).toBeLessThan(out.indexOf("</body>"));
});

let srv;
beforeAll(async () => {
  const dir = new URL("./fixtures/", import.meta.url).pathname;
  srv = await startViewerServer(dir, { localPackages: "" });
});
afterAll(() => srv.server.close());

test("serves a local model file", async () => {
  const res = await fetch(`http://127.0.0.1:${srv.port}/cube.js`);
  const body = await res.text();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/javascript/);
  expect(body).toMatch(/module.exports/);
});

test("viewerRoot serves the local viewer with the bridge and falls back to its files", async () => {
  const models = mkdtempSync(join(tmpdir(), "vr-models-"));
  const viewerRoot = mkdtempSync(join(tmpdir(), "vr-build-"));
  writeFileSync(join(models, "m.js"), "module.exports = {}");
  writeFileSync(join(viewerRoot, "index.html"), "<html><body>viewer</body></html>");
  writeFileSync(join(viewerRoot, "main.js"), "// bundle");
  const local = await startViewerServer(models, { viewerRoot, localPackages: "" });
  try {
    const page = await (await fetch(`http://127.0.0.1:${local.port}/`)).text();
    expect(page).toMatch(/viewer<script>.*__studio\/events/);
    const bundle = await fetch(`http://127.0.0.1:${local.port}/main.js`);
    expect(await bundle.text()).toBe("// bundle");
    expect((await fetch(`http://127.0.0.1:${local.port}/m.js`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${local.port}/missing.js`)).status).toBe(404);
  } finally {
    local.server.close();
    rmSync(models, { recursive: true, force: true });
    rmSync(viewerRoot, { recursive: true, force: true });
  }
});

test("viewerRoot without index.html names the build step", async () => {
  await expect(startViewerServer(tmpdir(), { viewerRoot: "/nonexistent" })).rejects.toThrow(
    /no viewer build at \/nonexistent: run `node build.js/,
  );
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
  const srv = await startViewerServer(dir, { localPackages: "" });
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

const makePackage = (pkg, files) => {
  const dir = mkdtempSync(join(tmpdir(), "lp-"));
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), body);
  }
  return dir;
};

test("injectBridge prepends the module override map when given", () => {
  const out = injectBridge("<body></body>", {
    "@x/y": "http://127.0.0.1:1/__studio/packages/@x/y/d.cjs",
  });
  expect(out).toMatch(
    /<script>window\.jscadModuleOverrides = \{"@x\/y":"http:\/\/127\.0\.0\.1:1\/__studio\/packages\/@x\/y\/d\.cjs"\};/,
  );
  expect(injectBridge("<body></body>", {})).not.toMatch(/jscadModuleOverrides/);
});

test("readLocalPackages prefers jsdelivr, then a string browser, then main", async () => {
  const a = makePackage(
    { name: "@t/a", jsdelivr: "dist/a.cjs", browser: "b.js", main: "m.js" },
    { "dist/a.cjs": "a" },
  );
  const b = makePackage({ name: "@t/b", browser: "./b.js", main: "m.js" }, { "b.js": "b" });
  const c = makePackage(
    { name: "@t/c", browser: { x: false }, main: "./dist/c.cjs" },
    { "dist/c.cjs": "c" },
  );
  try {
    const pkgs = await readLocalPackages([a, b, c].join(","));
    expect(pkgs).toEqual([
      { name: "@t/a", dir: a, file: "dist/a.cjs" },
      { name: "@t/b", dir: b, file: "b.js" },
      { name: "@t/c", dir: c, file: "dist/c.cjs" },
    ]);
    expect(await readLocalPackages(undefined)).toEqual([]);
    expect(await readLocalPackages("")).toEqual([]);
  } finally {
    for (const d of [a, b, c]) rmSync(d, { recursive: true, force: true });
  }
});

test("readLocalPackages resolves relative directories against cwd", async () => {
  const a = makePackage({ name: "@t/a", main: "a.js" }, { "a.js": "a" });
  try {
    const pkgs = await readLocalPackages(a.split("/").pop(), join(a, ".."));
    expect(pkgs[0].dir).toBe(a);
  } finally {
    rmSync(a, { recursive: true, force: true });
  }
});

test("a missing build file or package.json rejects startViewerServer with the directory", async () => {
  const noBuild = makePackage({ name: "@t/a", jsdelivr: "dist/a.cjs" }, {});
  const empty = mkdtempSync(join(tmpdir(), "lp-empty-"));
  const viewerRoot = mkdtempSync(join(tmpdir(), "lp-vr-"));
  writeFileSync(join(viewerRoot, "index.html"), "<html><body>viewer</body></html>");
  try {
    await expect(
      startViewerServer(tmpdir(), { viewerRoot, localPackages: noBuild }),
    ).rejects.toThrow(`no dist/a.cjs in ${noBuild}; run npm run build there`);
    await expect(startViewerServer(tmpdir(), { viewerRoot, localPackages: empty })).rejects.toThrow(
      `no package.json in ${empty}`,
    );
  } finally {
    rmSync(noBuild, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
    rmSync(viewerRoot, { recursive: true, force: true });
  }
});

test("a package.json without a name rejects startViewerServer with the entry", async () => {
  const noName = makePackage({ jsdelivr: "dist/a.cjs" }, { "dist/a.cjs": "a" });
  const viewerRoot = mkdtempSync(join(tmpdir(), "lp-vr-"));
  writeFileSync(join(viewerRoot, "index.html"), "<html><body>viewer</body></html>");
  try {
    await expect(
      startViewerServer(tmpdir(), { viewerRoot, localPackages: noName }),
    ).rejects.toThrow(`no name in ${noName}/package.json`);
  } finally {
    rmSync(noName, { recursive: true, force: true });
    rmSync(viewerRoot, { recursive: true, force: true });
  }
});

test("an unparsable package.json rejects startViewerServer with the entry", async () => {
  const bad = mkdtempSync(join(tmpdir(), "lp-bad-"));
  writeFileSync(join(bad, "package.json"), "{ not json");
  const viewerRoot = mkdtempSync(join(tmpdir(), "lp-vr-"));
  writeFileSync(join(viewerRoot, "index.html"), "<html><body>viewer</body></html>");
  try {
    await expect(startViewerServer(tmpdir(), { viewerRoot, localPackages: bad })).rejects.toThrow(
      `invalid package.json in ${bad}`,
    );
  } finally {
    rmSync(bad, { recursive: true, force: true });
    rmSync(viewerRoot, { recursive: true, force: true });
  }
});

const writeFile = (path, content = "") => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
};

const makeSiblingRoot = ({ viewer = true, anchors = true, fluent = true } = {}) => {
  const root = mkdtempSync(join(tmpdir(), "vs-sib-"));
  if (viewer)
    writeFile(
      join(root, "jscadui/apps/jscad-web/build/index.html"),
      "<html><body>sibling viewer</body></html>",
    );
  if (anchors) {
    writeFile(join(root, "jscad-anchors/dist/jscad-anchors.cjs"), "// anchors");
    writeFile(
      join(root, "jscad-anchors/package.json"),
      JSON.stringify({ name: "@jbroll/jscad-anchors", main: "dist/jscad-anchors.cjs" }),
    );
  }
  if (fluent) {
    writeFile(join(root, "jscad-fluent/dist/jscad-fluent.umd.cjs"), "// fluent");
    writeFile(
      join(root, "jscad-fluent/package.json"),
      JSON.stringify({ name: "@jbroll/jscad-fluent", main: "dist/jscad-fluent.umd.cjs" }),
    );
  }
  return root;
};

const withoutSiblingEnv = async (fn) => {
  const saved = {
    JSCAD_VIEWER_ROOT: process.env.JSCAD_VIEWER_ROOT,
    JSCAD_LOCAL_PACKAGES: process.env.JSCAD_LOCAL_PACKAGES,
  };
  delete process.env.JSCAD_VIEWER_ROOT;
  delete process.env.JSCAD_LOCAL_PACKAGES;
  try {
    await fn();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

test("defaults viewerRoot and localPackages to sibling builds when both env vars are unset", async () => {
  await withoutSiblingEnv(async () => {
    const siblingRoot = makeSiblingRoot();
    const models = mkdtempSync(join(tmpdir(), "vs-models-"));
    const local = await startViewerServer(models, { siblingRoot });
    try {
      expect(local.localPackages.map((p) => p.name).sort()).toEqual([
        "@jbroll/jscad-anchors",
        "@jbroll/jscad-fluent",
      ]);
      const page = await (await fetch(`http://127.0.0.1:${local.port}/`)).text();
      expect(page).toMatch(/sibling viewer<script>/);
    } finally {
      local.server.close();
      rmSync(models, { recursive: true, force: true });
      rmSync(siblingRoot, { recursive: true, force: true });
    }
  });
});

test("a missing sibling build leaves its default unset", async () => {
  await withoutSiblingEnv(async () => {
    const siblingRoot = makeSiblingRoot({ fluent: false });
    const models = mkdtempSync(join(tmpdir(), "vs-models-"));
    const local = await startViewerServer(models, { siblingRoot });
    try {
      expect(local.localPackages).toEqual([]);
      const page = await (await fetch(`http://127.0.0.1:${local.port}/`)).text();
      expect(page).toMatch(/sibling viewer<script>/); // viewerRoot default still applies
    } finally {
      local.server.close();
      rmSync(models, { recursive: true, force: true });
      rmSync(siblingRoot, { recursive: true, force: true });
    }
  });
});

test("an env var set to the empty string opts out of the sibling default", async () => {
  const siblingRoot = makeSiblingRoot();
  const models = mkdtempSync(join(tmpdir(), "vs-models-"));
  const savedViewer = process.env.JSCAD_VIEWER_ROOT;
  const savedPackages = process.env.JSCAD_LOCAL_PACKAGES;
  process.env.JSCAD_VIEWER_ROOT = "";
  process.env.JSCAD_LOCAL_PACKAGES = "";
  try {
    const local = await startViewerServer(models, { siblingRoot });
    expect(local.localPackages).toEqual([]); // no viewerRoot fetch: opting out proxies to jscad.rkroll.com
  } finally {
    if (savedViewer === undefined) delete process.env.JSCAD_VIEWER_ROOT;
    else process.env.JSCAD_VIEWER_ROOT = savedViewer;
    if (savedPackages === undefined) delete process.env.JSCAD_LOCAL_PACKAGES;
    else process.env.JSCAD_LOCAL_PACKAGES = savedPackages;
    rmSync(models, { recursive: true, force: true });
    rmSync(siblingRoot, { recursive: true, force: true });
  }
});

test("local packages are served uncached and named in the page's override map", async () => {
  const pkg = makePackage({ name: "@t/a", jsdelivr: "dist/a.cjs" }, { "dist/a.cjs": "// v1" });
  const models = mkdtempSync(join(tmpdir(), "lp-models-"));
  const viewerRoot = mkdtempSync(join(tmpdir(), "lp-build-"));
  writeFileSync(join(viewerRoot, "index.html"), "<html><body>viewer</body></html>");
  const local = await startViewerServer(models, { viewerRoot, localPackages: pkg });
  const base = `http://127.0.0.1:${local.port}`;
  try {
    expect(local.localPackages).toEqual([{ name: "@t/a", dir: pkg, file: "dist/a.cjs" }]);
    const url = `${base}/__studio/packages/@t/a/dist/a.cjs`;
    const first = await fetch(url);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("content-type")).toMatch(/javascript/);
    expect(await first.text()).toBe("// v1");
    writeFileSync(join(pkg, "dist/a.cjs"), "// v2");
    expect(await (await fetch(url)).text()).toBe("// v2");
    expect((await fetch(`${base}/__studio/packages/@t/a/package.json`)).status).toBe(404);
    const page = await (await fetch(`${base}/`)).text();
    expect(page).toContain(`window.jscadModuleOverrides = {"@t/a":"${url}"}`);
  } finally {
    local.server.close();
    rmSync(pkg, { recursive: true, force: true });
    rmSync(models, { recursive: true, force: true });
    rmSync(viewerRoot, { recursive: true, force: true });
  }
});
