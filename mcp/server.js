#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handlers } from "./lib/tools.js";

const server = new McpServer({ name: "jscad-studio", version: "0.1.0" });
const modelPath = z.string().describe("path to the model .js file (relative to cwd or absolute)");
const params = z.record(z.number()).optional().describe("parameter name -> value overrides");

server.registerTool(
  "eval",
  {
    description: "Run a model headlessly; report errors, geometry type, entity count.",
    inputSchema: { modelPath, params },
  },
  handlers.eval,
);
server.registerTool(
  "params",
  { description: "List a model's declared parameters.", inputSchema: { modelPath } },
  handlers.params,
);
server.registerTool(
  "measure",
  {
    description: "Measure bounding box, dimensions, volume/area, polygon count.",
    inputSchema: { modelPath, params },
  },
  handlers.measure,
);
server.registerTool(
  "export",
  {
    description: "Export STL/3MF/OBJ/SVG (base64).",
    inputSchema: { modelPath, params, format: z.enum(["stl", "3mf", "obj", "svg"]).optional() },
  },
  handlers.export,
);
server.registerTool(
  "check",
  {
    description: "Manifold/watertight/empty/bed-fit check.",
    inputSchema: { modelPath, params, bed: z.array(z.number()).length(3).optional() },
  },
  handlers.check,
);
server.registerTool(
  "render",
  {
    description:
      "Offscreen PNG of the model from the local headless viewer (default camera; view/params injection is a future enhancement).",
    inputSchema: { modelPath, size: z.array(z.number()).length(2).optional() },
  },
  handlers.render,
);

server.registerTool(
  "parts",
  {
    description: "List the sibling part files of a multi-file model and their exported names.",
    inputSchema: { modelPath },
  },
  handlers.parts,
);

server.registerTool(
  "library_search",
  {
    description: "Search the curated jscadui model library (keyword/tag).",
    inputSchema: {
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      source: z.string().optional(),
      lang: z.enum(["scad", "js"]).optional(),
      runnableOnly: z.boolean().optional(),
      limit: z.number().optional(),
    },
  },
  handlers.library_search,
);
server.registerTool(
  "library_get",
  {
    description: "Get a library model's catalog entry + source by id.",
    inputSchema: { id: z.string() },
  },
  handlers.library_get,
);

await server.connect(new StdioServerTransport());
