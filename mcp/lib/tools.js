import { resolve } from "node:path";
import { getEntry, loadCatalog, searchResults } from "./catalog.js";
import { liveParams } from "./live-params.js";
import { listParts } from "./parts.js";
import { renderModel } from "./render.js";
import { runModel } from "./runner.js";

const wrap = (result) => ({ content: [{ type: "text", text: JSON.stringify(result) }] });
const abs = (modelPath) => resolve(process.cwd(), modelPath);

export const handlers = {
  eval: async ({ modelPath, params, timeoutMs }) =>
    wrap(await runModel(abs(modelPath), { params, timeoutMs, outputs: ["eval"] })),
  params: async ({ modelPath, timeoutMs }) =>
    wrap(await runModel(abs(modelPath), { timeoutMs, outputs: ["params"] })),
  measure: async ({ modelPath, params, timeoutMs }) =>
    wrap(await runModel(abs(modelPath), { params, timeoutMs, outputs: ["measure"] })),
  export: async ({ modelPath, params, format, timeoutMs }) =>
    wrap(
      await runModel(abs(modelPath), {
        params,
        timeoutMs,
        outputs: ["export"],
        format: format ?? "stl",
      }),
    ),
  check: async ({ modelPath, params, bed, timeoutMs }) =>
    wrap(await runModel(abs(modelPath), { params, timeoutMs, outputs: ["check"], bed })),
  render: async ({ modelPath, size, view, params }) =>
    wrap(await renderModel(abs(modelPath), { size, view, params })),
  parts: async ({ modelPath }) => wrap({ parts: listParts(abs(modelPath)) }),
  live_params: async ({ params, modelPath }) => wrap(await liveParams(params, { modelPath })),
};

export const makeLibraryHandlers = (entries) => ({
  library_search: async ({ query = "", tags, source, lang, runnableOnly, limit }) => {
    const results = searchResults(
      query,
      { tags, source, lang, runnableOnly, limit },
      entries ?? loadCatalog(),
    );
    return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
  },
  library_get: async ({ id }) => {
    const got = getEntry(id, entries ?? loadCatalog());
    return {
      content: [
        { type: "text", text: JSON.stringify(got ?? { entry: null, path: null, source: null }) },
      ],
    };
  },
});

Object.assign(handlers, makeLibraryHandlers());
