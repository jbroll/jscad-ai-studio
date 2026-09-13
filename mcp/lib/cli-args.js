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

export const parsePositiveInt = (flag, text) => {
  if (text === undefined) return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n <= 0) throw new UsageError(`${flag} must be a positive integer`);
  return n;
};
