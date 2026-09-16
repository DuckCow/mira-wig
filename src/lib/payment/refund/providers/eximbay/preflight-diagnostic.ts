import type { EximbayRefundRetrieveFailureCode } from "./preflight-retrieve";
// The diagnostic vocabulary must not import its authorizer consumer.
// Its runtime grammar below remains narrower than the authorization result codes.
type EximbayPreflightAuthorizationCode =
  | "INVALID_INPUT"
  | "COMMAND_NOT_FOUND_OR_INELIGIBLE"
  | "LEASE_FENCE_MISMATCH"
  | "LEASE_EXPIRED"
  | "CONTACT_RECOVERY_REQUIRED"
  | "BINDING_MISMATCH"
  | "REFUND_LEDGER_INCONSISTENT"
  | "PREFLIGHT_NOT_ADMITTED"
  | "PREFLIGHT_CONFLICT"
  | "REFUND_NOT_LAWFUL"
  | "PERSISTENCE_CONFLICT";

export type EximbayPreflightStage = "RETRIEVE" | "OBSERVATION_TRANSACTION" | "DISPATCH_AUTHORIZATION";
export type EximbayPreflightDiagnostic = Readonly<{
  stage: EximbayPreflightStage | "LEASE_CONTINUATION";
  kind: "REJECTION" | "EXCEPTION";
  code: EximbayRefundRetrieveFailureCode | EximbayPreflightAuthorizationCode | null;
  responseReceived: boolean | null;
  httpStatus: number | null;
}>;

// Preserve the exception path without retaining the thrown value or its message.
export class EximbayPreflightException extends Error {
  constructor(readonly diagnostic: EximbayPreflightDiagnostic) {
    super("EXIMBAY_PREFLIGHT_EXCEPTION");
  }
}

export function preflightException(stage: "OBSERVATION_TRANSACTION" | "DISPATCH_AUTHORIZATION"): EximbayPreflightException {
  return new EximbayPreflightException(Object.freeze({
    stage, kind: "EXCEPTION", code: stage === "DISPATCH_AUTHORIZATION" ? "PERSISTENCE_CONFLICT" : null,
    responseReceived: stage === "OBSERVATION_TRANSACTION" ? true : null, httpStatus: null,
  }));
}

// These codes are deliberate returns after a 2xx response boundary.
const RETRIEVE_RESPONSE_CODES: ReadonlySet<string> = new Set<EximbayRefundRetrieveFailureCode>([
  "INVALID_CONTENT_TYPE", "BODY_TOO_LARGE", "TOO_MANY_RESPONSE_CHUNKS",
  "INVALID_RESPONSE_CHUNK", "INVALID_UTF8", "INVALID_JSON", "DUPLICATE_JSON_KEY",
  "UNKNOWN_SHAPE", "PROVIDER_NON_SUCCESS", "IDENTITY_MISMATCH", "MONEY_MISMATCH",
  "INVALID_BALANCE", "UNSUPPORTED_STATUS",
]);

// admitObservation and authorizeR1Transaction share these revalidation returns.
const REVALIDATION_CODES: ReadonlySet<string> = new Set<EximbayPreflightAuthorizationCode>([
  "COMMAND_NOT_FOUND_OR_INELIGIBLE", "LEASE_FENCE_MISMATCH", "LEASE_EXPIRED",
  "BINDING_MISMATCH", "REFUND_LEDGER_INCONSISTENT",
]);

export function isEximbayPreflightDiagnostic(value: unknown): value is EximbayPreflightDiagnostic {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(",") !== "code,httpStatus,kind,responseReceived,stage") return false;
  return validProducerTuple(Object.fromEntries(Object.entries(value)));
}

function validProducerTuple(fields: Record<string, unknown>): boolean {
  if (fields.stage === "RETRIEVE") return validRetrieve(fields);
  if (fields.stage === "OBSERVATION_TRANSACTION") return validObservation(fields);
  if (fields.stage === "DISPATCH_AUTHORIZATION") return validDispatch(fields);
  return fields.stage === "LEASE_CONTINUATION" && validContinuation(fields);
}

function validRetrieve(fields: Record<string, unknown>): boolean {
  if (fields.kind === "EXCEPTION") {
    return fields.code === "TRANSPORT_FAILURE" && validRetrieveExceptionResponse(fields);
  }
  return fields.kind === "REJECTION" && validRetrieveRejection(fields);
}

function validRetrieveRejection(fields: Record<string, unknown>): boolean {
  if (fields.responseReceived !== true) return false;
  // Response.error()/opaque responses have status 0: no representable HTTP status.
  if (fields.code === null) return fields.httpStatus === null;
  if (!isHttpStatus(fields.httpStatus)) return false;
  if (fields.code === "NON_2XX") return !isSuccessStatus(fields.httpStatus);
  return typeof fields.code === "string" && RETRIEVE_RESPONSE_CODES.has(fields.code)
    && isSuccessStatus(fields.httpStatus);
}

function validRetrieveExceptionResponse(fields: Record<string, unknown>): boolean {
  if (fields.responseReceived === false) return fields.httpStatus === null;
  return fields.responseReceived === true
    && (fields.httpStatus === null || isHttpStatus(fields.httpStatus));
}

function validObservation(fields: Record<string, unknown>): boolean {
  if (fields.responseReceived !== true || fields.httpStatus !== null) return false;
  if (fields.kind === "EXCEPTION") return fields.code === null;
  return fields.kind === "REJECTION" && typeof fields.code === "string"
    && (REVALIDATION_CODES.has(fields.code) || fields.code === "PREFLIGHT_CONFLICT");
}

function validDispatch(fields: Record<string, unknown>): boolean {
  if (fields.httpStatus !== null) return false;
  if (fields.kind === "EXCEPTION") {
    // Reused observations do not establish response receipt in this invocation.
    return fields.code === "PERSISTENCE_CONFLICT"
      && (fields.responseReceived === true || fields.responseReceived === null);
  }
  return fields.kind === "REJECTION" && validDispatchRejection(fields);
}

function validDispatchRejection(fields: Record<string, unknown>): boolean {
  return fields.responseReceived === true && typeof fields.code === "string"
    && (REVALIDATION_CODES.has(fields.code) || fields.code === "REFUND_NOT_LAWFUL");
}

function validContinuation(fields: Record<string, unknown>): boolean {
  return fields.kind === "EXCEPTION" && fields.code === null
    && fields.responseReceived === null && fields.httpStatus === null;
}

function isHttpStatus(status: unknown): status is number {
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599;
}

function isSuccessStatus(status: number): boolean {
  return status >= 200 && status < 300;
}

export function diagnosticFields(value: unknown): Readonly<{ diagnostic?: EximbayPreflightDiagnostic }> {
  return isEximbayPreflightDiagnostic(value) ? { diagnostic: value } : {};
}
