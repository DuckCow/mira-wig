import { isLocale, type Locale } from "@/lib/market/locale";
import {
  APPROVAL_DECISIONS,
  CLAIM_DISPOSITIONS,
  LocalizedContentException,
  REVISION_SOURCE_KINDS,
  type ApprovalDecision,
  type ClaimDisposition,
  type RevisionSourceKind,
} from "./types";

export const AUTO_WITHDRAW_REQUEST_KEY_PREFIX = "lpc:auto-withdraw:";

function characterLength(value: string): number {
  return Array.from(value).length;
}

export function requiredString(value: unknown, label: string, maxLength?: number): string {
  if (typeof value !== "string") {
    throw new LocalizedContentException("INVALID_INPUT", `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new LocalizedContentException("INVALID_INPUT", `${label} must not be blank.`);
  }
  if (maxLength !== undefined && characterLength(normalized) > maxLength) {
    throw new LocalizedContentException(
      "INVALID_INPUT",
      `${label} must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
}

export function optionalString(value: unknown, label: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new LocalizedContentException("INVALID_INPUT", `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (characterLength(normalized) > maxLength) {
    throw new LocalizedContentException(
      "INVALID_INPUT",
      `${label} must be at most ${maxLength} characters.`,
    );
  }
  return normalized;
}

export function localeValue(value: unknown): Locale {
  const locale = requiredString(value, "locale");
  if (!isLocale(locale)) {
    throw new LocalizedContentException("INVALID_INPUT", "locale is not supported.");
  }
  return locale;
}

export function sourceKindValue(value: unknown): RevisionSourceKind {
  if (typeof value !== "string" || !isRevisionSourceKind(value)) {
    throw new LocalizedContentException("INVALID_INPUT", "sourceKind is invalid.");
  }
  return value;
}

export function claimDispositionValue(value: unknown): ClaimDisposition {
  if (typeof value !== "string" || !isClaimDisposition(value)) {
    throw new LocalizedContentException("INVALID_INPUT", "claimDisposition is required.");
  }
  return value;
}

export function approvalDecisionValue(value: unknown): ApprovalDecision {
  if (typeof value !== "string" || !isApprovalDecision(value)) {
    throw new LocalizedContentException("INVALID_INPUT", "decision is invalid.");
  }
  return value;
}

function isRevisionSourceKind(value: string): value is RevisionSourceKind {
  return REVISION_SOURCE_KINDS.some((candidate) => candidate === value);
}

function isClaimDisposition(value: string): value is ClaimDisposition {
  return CLAIM_DISPOSITIONS.some((candidate) => candidate === value);
}

function isApprovalDecision(value: string): value is ApprovalDecision {
  return APPROVAL_DECISIONS.some((candidate) => candidate === value);
}

export function expectedVersionValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new LocalizedContentException(
      "INVALID_INPUT",
      "expectedPublicationVersion must be a non-negative safe integer.",
    );
  }
  return value;
}

export function externalPublicationRequestKey(value: unknown): string {
  const requestKey = requiredString(value, "requestKey", 128);
  if (requestKey.startsWith(AUTO_WITHDRAW_REQUEST_KEY_PREFIX)) {
    throw new LocalizedContentException(
      "INVALID_INPUT",
      "requestKey uses a reserved namespace.",
    );
  }
  return requestKey;
}

export function dateTokenValue(value: unknown): Date {
  if (typeof value !== "string" && !(value instanceof Date)) {
    throw new LocalizedContentException("INVALID_INPUT", "legacyUpdatedAt is required.");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new LocalizedContentException("INVALID_INPUT", "legacyUpdatedAt is invalid.");
  }
  return date;
}
