export interface SesTransactionalEmailConfig {
  region: string;
  fromAddress: string;
  fromDisplayName: string;
  replyToAddress?: string;
  configurationSetName: string;
  requestTimeoutMs: number;
  recipientRouting?: SesRecipientRouting;
}

export interface ValidatedSesTransactionalEmailConfig extends SesTransactionalEmailConfig {
  fromEmailAddress: string;
  recipientRouting: ValidatedSesRecipientRouting;
}

export type SesRecipientRouting =
  | Readonly<{ mode: "PRODUCTION" }>
  | Readonly<{ mode: "SANDBOX_PRELAUNCH"; safeRecipient?: string }>;

export type ValidatedSesRecipientRouting =
  | Readonly<{ mode: "PRODUCTION" }>
  | Readonly<{ mode: "SANDBOX_PRELAUNCH"; safeRecipient: string }>;

export const SES_REQUEST_TIMEOUT_MAX_MS = 10_000;

const EMAIL_ADDRESS_MAX_LENGTH = 320;
const DISPLAY_NAME_MAX_LENGTH = 128;
const CONFIGURATION_SET_MAX_LENGTH = 64;
const REGION_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/u;
const CONFIGURATION_SET_PATTERN = /^[A-Za-z0-9_-]+$/u;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'’-]*$/u;
const EMAIL_ADDRESS_PATTERN = /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/u;

export function validateSesTransactionalEmailConfig(
  config: SesTransactionalEmailConfig,
): ValidatedSesTransactionalEmailConfig {
  const region = requireExact(config.region, isValidRegion);
  const fromAddress = requireExact(config.fromAddress, isValidEmailAddress);
  const fromDisplayName = requireExact(config.fromDisplayName, isValidDisplayName);
  const configurationSetName = requireExact(
    config.configurationSetName,
    isValidConfigurationSetName,
  );
  const replyToAddress = optionalAddress(config.replyToAddress);
  const requestTimeoutMs = requireTimeout(config.requestTimeoutMs);
  const recipientRouting = validateRecipientRouting(config.recipientRouting);
  return Object.freeze({
    region,
    fromAddress,
    fromDisplayName,
    ...(replyToAddress ? { replyToAddress } : {}),
    configurationSetName,
    requestTimeoutMs,
    fromEmailAddress: `${fromDisplayName} <${fromAddress}>`,
    recipientRouting,
  });
}

export function isValidEmailAddress(value: string): boolean {
  return value.length <= EMAIL_ADDRESS_MAX_LENGTH
    && !hasForbiddenControl(value)
    && EMAIL_ADDRESS_PATTERN.test(value);
}

function isValidRegion(value: string): boolean {
  return value.length <= 64 && REGION_PATTERN.test(value);
}

function isValidDisplayName(value: string): boolean {
  return value.length <= DISPLAY_NAME_MAX_LENGTH
    && !hasForbiddenControl(value)
    && DISPLAY_NAME_PATTERN.test(value);
}

function isValidConfigurationSetName(value: string): boolean {
  return value.length <= CONFIGURATION_SET_MAX_LENGTH
    && !hasForbiddenControl(value)
    && CONFIGURATION_SET_PATTERN.test(value);
}

function requireExact(value: string, predicate: (candidate: string) => boolean): string {
  if (value !== value.trim() || !predicate(value)) throw configInvalid();
  return value;
}

function optionalAddress(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return requireExact(value, isValidEmailAddress);
}

function requireTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > SES_REQUEST_TIMEOUT_MAX_MS) {
    throw configInvalid();
  }
  return value;
}

function validateRecipientRouting(
  routing: SesRecipientRouting | undefined,
): ValidatedSesRecipientRouting {
  if (routing === undefined || routing.mode === "PRODUCTION") {
    return Object.freeze({ mode: "PRODUCTION" });
  }
  const safeRecipient = routing.safeRecipient;
  if (safeRecipient === undefined) throw configInvalid();
  return Object.freeze({
    mode: "SANDBOX_PRELAUNCH",
    safeRecipient: requireExact(safeRecipient, isValidEmailAddress),
  });
}

function hasForbiddenControl(value: string): boolean {
  return /[\r\n\0]/u.test(value);
}

function configInvalid(): Error {
  return new Error("SES_CONFIGURATION_INVALID");
}
