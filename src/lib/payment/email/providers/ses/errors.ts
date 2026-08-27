import { TransactionalEmailDeliveryError } from "../../delivery-error";

export type SesDeliverySafeCode =
  | "SES_THROTTLED"
  | "SES_SERVICE_UNAVAILABLE"
  | "SES_NETWORK_AMBIGUOUS"
  | "SES_TIMEOUT_AMBIGUOUS"
  | "SES_SUCCESS_RESPONSE_INVALID"
  | "SES_REQUEST_INVALID"
  | "SES_IDENTITY_NOT_VERIFIED"
  | "SES_MESSAGE_REJECTED"
  | "SES_CONFIGURATION_NOT_FOUND"
  | "SES_ACCOUNT_SUSPENDED"
  | "SES_SENDING_PAUSED"
  | "SES_AUTHORIZATION_FAILED"
  | "SES_QUOTA_EXCEEDED"
  | "SES_CLIENT_ERROR";

const PERMANENT_BY_NAME: Readonly<Record<string, SesDeliverySafeCode>> = Object.freeze({
  AccountSuspendedException: "SES_ACCOUNT_SUSPENDED",
  BadRequestException: "SES_REQUEST_INVALID",
  LimitExceededException: "SES_QUOTA_EXCEEDED",
  MailFromDomainNotVerifiedException: "SES_IDENTITY_NOT_VERIFIED",
  MessageRejected: "SES_MESSAGE_REJECTED",
  NotFoundException: "SES_CONFIGURATION_NOT_FOUND",
  SendingPausedException: "SES_SENDING_PAUSED",
  AccessDeniedException: "SES_AUTHORIZATION_FAILED",
  ForbiddenException: "SES_AUTHORIZATION_FAILED",
  InvalidClientTokenId: "SES_AUTHORIZATION_FAILED",
  UnrecognizedClientException: "SES_AUTHORIZATION_FAILED",
  ExpiredTokenException: "SES_AUTHORIZATION_FAILED",
  SignatureDoesNotMatch: "SES_AUTHORIZATION_FAILED",
});

const TRANSIENT_BY_NAME: Readonly<Record<string, SesDeliverySafeCode>> = Object.freeze({
  AbortError: "SES_TIMEOUT_AMBIGUOUS",
  TimeoutError: "SES_TIMEOUT_AMBIGUOUS",
  TooManyRequestsException: "SES_THROTTLED",
  InternalServiceErrorException: "SES_SERVICE_UNAVAILABLE",
});

export function classifySesSendError(
  error: unknown,
  requestTimedOut: boolean,
): TransactionalEmailDeliveryError {
  const facts = errorFacts(error);
  const transientCode = transientSafeCode(facts, requestTimedOut);
  if (transientCode) return transient(transientCode);
  const permanentCode = permanentSafeCode(facts);
  if (permanentCode) return permanent(permanentCode);
  return transient("SES_NETWORK_AMBIGUOUS");
}

export function invalidSesRequest(): TransactionalEmailDeliveryError {
  return permanent("SES_REQUEST_INVALID");
}

export function invalidSesSuccessResponse(): TransactionalEmailDeliveryError {
  return transient("SES_SUCCESS_RESPONSE_INVALID");
}

function transient(safeCode: SesDeliverySafeCode): TransactionalEmailDeliveryError {
  return new TransactionalEmailDeliveryError("TRANSIENT", safeCode);
}

function permanent(safeCode: SesDeliverySafeCode): TransactionalEmailDeliveryError {
  return new TransactionalEmailDeliveryError("PERMANENT", safeCode);
}

type SesErrorFacts = Readonly<{
  name: string;
  status: number | undefined;
  fault: string | undefined;
}>;

function transientSafeCode(
  facts: SesErrorFacts,
  requestTimedOut: boolean,
): SesDeliverySafeCode | null {
  if (requestTimedOut) return "SES_TIMEOUT_AMBIGUOUS";
  const named = TRANSIENT_BY_NAME[facts.name];
  if (named) return named;
  if (facts.status === 429) return "SES_THROTTLED";
  if (facts.fault === "server" || isServerStatus(facts.status)) {
    return "SES_SERVICE_UNAVAILABLE";
  }
  return null;
}

function permanentSafeCode(facts: SesErrorFacts): SesDeliverySafeCode | null {
  const named = PERMANENT_BY_NAME[facts.name];
  if (named) return named;
  if (facts.status === 401 || facts.status === 403) return "SES_AUTHORIZATION_FAILED";
  if (isClientStatus(facts.status)) return "SES_CLIENT_ERROR";
  return null;
}

function errorFacts(error: unknown): SesErrorFacts {
  if (!isRecord(error)) {
    return Object.freeze({ name: "UnknownError", status: undefined, fault: undefined });
  }
  return Object.freeze({
    name: stringField(error.name) ?? "UnknownError",
    status: metadataStatus(error.$metadata),
    fault: stringField(error.$fault),
  });
}

function metadataStatus(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.httpStatusCode === "number" ? value.httpStatusCode : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isServerStatus(value: number | undefined): boolean {
  return value !== undefined && value >= 500;
}

function isClientStatus(value: number | undefined): boolean {
  return value !== undefined && value >= 400 && value < 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
