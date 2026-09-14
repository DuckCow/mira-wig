/** Closed, value-free observation. Unknown key names can themselves contain PII. */
export const RETRIEVE_SHAPE_FAILURES = [
  "ROOT_NOT_OBJECT", "ROOT_KEY_SET_MISMATCH", "ROOT_REQUIRED_TEXT_INVALID",
  "PAYMENT_NOT_OBJECT", "OPTIONAL_ROOT_ENVELOPE_INVALID", "PAYMENT_KEY_SET_MISMATCH",
  "OPTIONAL_PAYMENT_ENVELOPE_INVALID", "IDENTITY_SHAPE_INVALID",
  "TRANSACTION_DATE_SHAPE_INVALID", "BALANCE_SHAPE_INVALID",
  "OTHER_EXACT_STRUCTURAL_FAILURE", "UNESTABLISHED",
] as const;
export type RetrieveShapeFailure = typeof RETRIEVE_SHAPE_FAILURES[number];
const TYPES = ["unobserved", "null", "array", "object", "string", "number", "boolean"] as const;
type JsonType = typeof TYPES[number];
export const ROOT_FIELDS = ["rescode", "resmsg", "mid", "payment", "card_info", "other_param"] as const;
export const CARD_FIELDS = ["card_number1", "card_number4", "cardno1", "cardno4"] as const;
export const OTHER_FIELDS = ["param1", "param2"] as const;
export const PAYMENT_FIELDS = ["order_id", "currency", "amount", "transaction_id", "status", "transaction_date", "balance", "auth_code", "payment_method"] as const;
export type ShapeSummary = Readonly<{
  type: JsonType;
  fields: readonly Readonly<{ name: string; type: JsonType }>[];
  extraKeyCount: number;
}>;
export interface RetrieveShapeDiagnostic {
  httpStatus: number | null;
  contentTypeClass: "UNOBSERVED" | "JSON" | "OTHER";
  bodyByteLength: number | null;
  jsonParseSuccess: boolean;
  root: ShapeSummary;
  payment: ShapeSummary;
  cardInfo: ShapeSummary;
  otherParam: ShapeSummary;
  firstFailure: RetrieveShapeFailure;
}
export function emptyRetrieveShapeDiagnostic(): RetrieveShapeDiagnostic {
  return { httpStatus: null, contentTypeClass: "UNOBSERVED", bodyByteLength: null,
    jsonParseSuccess: false, root: unobserved(), payment: unobserved(), cardInfo: unobserved(), otherParam: unobserved(), firstFailure: "UNESTABLISHED" };
}
function unobserved(): ShapeSummary { return { type: "unobserved", fields: [], extraKeyCount: 0 }; }
function jsonType(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  return "boolean";
}
export function summarizeShape(value: unknown, allowed: readonly string[]): ShapeSummary {
  const type = jsonType(value);
  if (!record(value)) return { type, fields: [], extraKeyCount: 0 };
  return { type, fields: allowed.filter((key) => Object.hasOwn(value, key))
    .map((name) => ({ name, type: jsonType(value[name]) })),
  extraKeyCount: Object.keys(value).filter((key) => !allowed.includes(key)).length };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function integer(value: unknown, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}
function isType(value: unknown): value is JsonType { return TYPES.some((type) => type === value); }
function validField(value: unknown, allowed: readonly string[]): boolean {
  return record(value) && exact(value, ["name", "type"])
    && typeof value.name === "string" && allowed.includes(value.name) && isType(value.type);
}
function validSummary(value: unknown, allowed: readonly string[]): boolean {
  if (!record(value) || !exact(value, ["type", "fields", "extraKeyCount"])) return false;
  if (!isType(value.type) || !Array.isArray(value.fields)) return false;
  return value.fields.length <= allowed.length && integer(value.extraKeyCount, 65_536)
    && value.fields.every((field: unknown) => validField(field, allowed))
    && new Set(value.fields.map((field: unknown) => record(field) ? field.name : null)).size === value.fields.length;
}
export function isRetrieveShapeDiagnostic(value: unknown): value is RetrieveShapeDiagnostic {
  if (!record(value) || !exact(value, ["httpStatus", "contentTypeClass", "bodyByteLength",
    "jsonParseSuccess", "root", "payment", "cardInfo", "otherParam", "firstFailure"])) return false;
  return [validHttpStatus(value.httpStatus),
    ["UNOBSERVED", "JSON", "OTHER"].some((kind) => kind === value.contentTypeClass),
    value.bodyByteLength === null || integer(value.bodyByteLength, 65_536),
    typeof value.jsonParseSuccess === "boolean", validSummary(value.root, ROOT_FIELDS),
    validSummary(value.payment, PAYMENT_FIELDS), validSummary(value.cardInfo, CARD_FIELDS),
    validSummary(value.otherParam, OTHER_FIELDS),
    RETRIEVE_SHAPE_FAILURES.some((failure) => failure === value.firstFailure)].every(Boolean);
}

function validHttpStatus(value: unknown): boolean {
  return value === null || (typeof value === "number" && value >= 100 && integer(value, 599));
}
