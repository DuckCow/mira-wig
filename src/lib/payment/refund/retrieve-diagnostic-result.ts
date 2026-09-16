import { isRetrieveShapeDiagnostic, type RetrieveShapeDiagnostic } from "./providers/eximbay/retrieve-shape-diagnostic";
import type { EximbayRefundRetrieveFailureCode } from "./providers/eximbay/preflight-retrieve";
const SCHEMA = "mira-eximbay-retrieve-shape-diagnostic/v1";
const CODES = ["CONFIG_INVALID", "DATABASE_UNAVAILABLE", "DATABASE_READ_FAILED", "PAYMENT_NOT_FOUND",
  "PAYMENT_INVALID", "CREDENTIAL_UNAVAILABLE", "DIAGNOSTIC_COMPLETE", "DIAGNOSTIC_FAILED"] as const;
type Code = typeof CODES[number];
const PARSER_CODES = ["ADMITTED", "TRANSPORT_FAILURE", "NON_2XX", "INVALID_CONTENT_TYPE", "BODY_TOO_LARGE",
  "TOO_MANY_RESPONSE_CHUNKS", "INVALID_RESPONSE_CHUNK", "INVALID_UTF8", "INVALID_JSON", "DUPLICATE_JSON_KEY",
  "UNKNOWN_SHAPE", "PROVIDER_NON_SUCCESS", "IDENTITY_MISMATCH", "MONEY_MISMATCH", "INVALID_BALANCE", "UNSUPPORTED_STATUS"] as const;
export type RetrieveDiagnosticResult = Readonly<{
  schema: typeof SCHEMA;
  ok: boolean;
  code: Code;
  terminalClass: "READ_ONLY_DIAGNOSTIC";
  inquiryCount: 0 | 1;
  cancellationCount: 0;
  reconciliationCount: 0;
  databaseDisconnected: boolean;
  parserResult: "ADMITTED" | EximbayRefundRetrieveFailureCode | null;
  shape: RetrieveShapeDiagnostic | null;
}>;
export function diagnosticResult(code: Code): RetrieveDiagnosticResult {
  return { schema: SCHEMA, ok: code === "DIAGNOSTIC_COMPLETE", code,
    terminalClass: "READ_ONLY_DIAGNOSTIC", inquiryCount: 0, cancellationCount: 0,
    reconciliationCount: 0, databaseDisconnected: true, parserResult: null, shape: null };
}
export function isRetrieveDiagnosticResult(value: unknown): value is RetrieveDiagnosticResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  const expected = Object.keys(diagnosticResult("CONFIG_INVALID"));
  if (keys.length !== expected.length || !keys.every((key) => expected.includes(key))) return false;
  return validResultFields(value);
}
function record(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value));
}
function validResultFields(input: object): input is RetrieveDiagnosticResult {
  const value = record(input);
  if (![value.schema === SCHEMA, value.terminalClass === "READ_ONLY_DIAGNOSTIC",
    CODES.some((code) => code === value.code), value.inquiryCount === 0 || value.inquiryCount === 1,
    value.cancellationCount === 0, value.reconciliationCount === 0,
    typeof value.databaseDisconnected === "boolean",
    value.ok === (value.code === "DIAGNOSTIC_COMPLETE" && value.databaseDisconnected === true)].every(Boolean)) return false;
  return validObservation(value);
}
function validObservation(value: Record<string, unknown>): boolean {
  if (value.code === "DIAGNOSTIC_COMPLETE") return value.inquiryCount === 1
    && PARSER_CODES.some((code) => code === value.parserResult) && isRetrieveShapeDiagnostic(value.shape)
    && parserObservationConsistent(value.parserResult, value.shape);
  return value.parserResult === null && value.shape === null
    && (value.code === "DIAGNOSTIC_FAILED" || value.inquiryCount === 0);
}

function parserObservationConsistent(parser: unknown, shape: RetrieveShapeDiagnostic): boolean {
  if (parser === "UNKNOWN_SHAPE") return shape.jsonParseSuccess && shape.firstFailure !== "UNESTABLISHED";
  if (parser === "INVALID_BALANCE") return shape.jsonParseSuccess;
  if (shape.firstFailure !== "UNESTABLISHED") return false;
  if (parser === "ADMITTED") return shape.jsonParseSuccess && shape.root.type === "object" && shape.payment.type === "object";
  return true;
}
