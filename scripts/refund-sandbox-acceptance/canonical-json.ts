export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON number is invalid.");
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object") throw new Error("Canonical JSON value is invalid.");
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry: unknown = Reflect.get(value, key);
    if (entry === undefined) throw new Error("Canonical JSON cannot contain undefined.");
    output[key] = canonicalValue(entry);
  }
  return output;
}
