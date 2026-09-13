import { UP_AXES } from "./dfm.js";

export class UsageError extends Error {}

export const parseParams = (json) => {
  if (json === undefined) return undefined;
  let value;
  try {
    value = JSON.parse(json);
  } catch {
    throw new UsageError(`--params is not valid JSON: ${json}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UsageError("--params must be a JSON object");
  }
  return value;
};

const SELECTOR = /^(\d+)(?:-(\d+))?$/;

export const parseSelectors = (flag, texts, count) => {
  const ok = texts.every((t) => {
    const m = t.match(SELECTOR);
    return m && (m[2] === undefined || Number(m[2]) >= Number(m[1]));
  });
  if (!ok || texts.length !== (count ?? texts.length)) {
    const form =
      count === 2 ? "two item indexes or ranges, e.g. 0,4-7" : "an item index N or range N-M";
    throw new UsageError(`${flag} takes ${form}`);
  }
  return texts;
};

export const interferenceOptions = ({ values }) => {
  const tolerance = values.tolerance === undefined ? undefined : Number(values.tolerance);
  if (tolerance !== undefined && (values.tolerance.trim() === "" || !(tolerance >= 0))) {
    throw new UsageError("--tolerance takes a distance in mm, 0 or more");
  }
  const allow = (values.allow ?? []).map((text) => {
    const [a, b] = parseSelectors("--allow", text.split(","), 2);
    return { a, b };
  });
  return { interference: { tolerance, allow } };
};

const numberIn = (flag, text, ok, form) => {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (text.trim() === "" || !ok(n)) throw new UsageError(`${flag} takes ${form}`);
  return n;
};

export const dfmOptions = ({ values }) => {
  if (values.up !== undefined && !(values.up in UP_AXES)) {
    throw new UsageError(`--up takes one of ${Object.keys(UP_AXES).join(", ")}`);
  }
  const dfm = {
    wall: numberIn("--wall", values.wall, (n) => n > 0, "a thickness in mm above 0"),
    overhang: numberIn("--overhang", values.overhang, (n) => n >= 0 && n <= 90, "degrees, 0 to 90"),
    up: values.up,
  };
  return { dfm: Object.fromEntries(Object.entries(dfm).filter(([, v]) => v !== undefined)) };
};

export const parsePositiveInt = (flag, text) => {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`${flag} must be a positive integer`);
  return n;
};
