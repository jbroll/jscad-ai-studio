import { resolve } from "node:path";
import { getEntry, loadCatalog, searchCatalog } from "./catalog.js";
import { liveParams } from "./live-params.js";
import { listParts } from "./parts.js";
import { renderModel } from "./render.js";
import { runModel } from "./runner.js";

const wrap = (result) => ({ content: [{ type: "text", text: JSON.stringify(result) }] });
const abs = (modelPath) => resolve(process.cwd(), modelPath);

export const handlers = {
  eval: async ({ modelPath, params }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["eval"] })),
  params: async ({ modelPath }) => wrap(await runModel(abs(modelPath), { outputs: ["params"] })),
  measure: async ({ modelPath, params }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["measure"] })),
  export: async ({ modelPath, params, format }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["export"], format: format ?? "stl" })),
  check: async ({ modelPath, params, bed }) =>
    wrap(await runModel(abs(modelPath), { params, outputs: ["check"], bed })),
  render: async ({ modelPath, size }) => wrap(await renderModel(abs(modelPath), { size })),
  parts: async ({ modelPath }) => wrap({ parts: listParts(abs(modelPath)) }),
  live_params: async ({ params }) => wrap(await liveParams(params)),
};

export const makeLibraryHandlers = (entries) => ({
  library_search: async ({ query = "", tags, source, lang, runnableOnly, limit }) => {
    const hits = searchCatalog(
      query,
      { tags, source, lang, runnableOnly, limit },
      entries ?? loadCatalog(),
    );
    const results = hits.map((e) => ({
      id: e.id,
      name: e.name,
      source: e.source,
      lang: e.lang,
      tags: e.tags,
      runs: e.runs,
      dimensions: e.dimensions,
      description: e.description,
    }));
    return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
  },
  library_get: async ({ id }) => {
    const got = getEntry(id, entries ?? loadCatalog());
    return {
      content: [{ type: "text", text: JSON.stringify(got ?? { entry: null, source: null }) }],
    };
  },
});

Object.assign(handlers, makeLibraryHandlers());
