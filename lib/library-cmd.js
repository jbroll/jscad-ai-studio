import { getEntry, loadCatalog, searchResults } from "./catalog.js";
import { parsePositiveInt, UsageError } from "./cli-args.js";

const catalogOf = (ctx) => ctx.catalog ?? loadCatalog();
const listOpt = (text) => (text ? text.split(",").filter(Boolean) : undefined);

const sizeNumber = (flag, text) => {
  const n = Number(text);
  if (text.trim() === "" || !(n >= 0)) {
    throw new UsageError(`${flag} takes N or X,Y,Z in mm, with an empty or - axis for no bound`);
  }
  return n;
};

const parseSizeBound = (flag, text) => {
  if (text === undefined) return undefined;
  const axes = text.split(",");
  if (axes.length === 1) return sizeNumber(flag, text);
  if (axes.length !== 3) sizeNumber(flag, "");
  return axes.map((a) => (a === "" || a === "-" ? null : sizeNumber(flag, a)));
};

export const librarySearchResults = ({ positionals, values }, ctx) => {
  if (values.lang && !["scad", "js"].includes(values.lang)) {
    throw new UsageError("--lang must be scad or js");
  }
  const results = searchResults(
    positionals.join(" "),
    {
      tags: listOpt(values.tags),
      source: values.source,
      lang: values.lang,
      runnableOnly: !values["include-broken"],
      parametric: values.parametric || undefined,
      minSize: parseSizeBound("--min-size", values["min-size"]),
      maxSize: parseSizeBound("--max-size", values["max-size"]),
      limit: parsePositiveInt("--limit", values.limit),
    },
    catalogOf(ctx),
  );
  return { results };
};

export const libraryEntry = (id, ctx) => getEntry(id, catalogOf(ctx));
