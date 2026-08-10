import {
  EximbayStatusParseError,
  safeStatusDiagnostics,
  type EximbayStatusParserErrorCode,
} from "./redaction";
import { hasProhibitedDecodedCharacter, hasUnpairedSurrogate } from "./validation";

export const EXIMBAY_RAW_QUERY_MAX_BYTES = 16_384;
export const EXIMBAY_STATUS_MAX_PAIRS = 64;
export const EXIMBAY_STATUS_KEY_MAX_BYTES = 128;
export const EXIMBAY_STATUS_VALUE_MAX_BYTES = 4_096;

const REQUIRED_STATUS_FIELDS: readonly string[] = [
  "transaction_type",
  "mid",
  "order_id",
  "currency",
  "amount",
  "rescode",
  "resmsg",
  "fgkey",
];
const VALID_PERCENT_ESCAPE = /^[0-9a-fA-F]{2}$/u;

export interface EximbayUntrustedStatusPair {
  readonly key: string;
  readonly value: string;
}

export interface UnverifiedEximbayStatus {
  readonly authority: "UNVERIFIED_STATUS";
  readonly exactRawQuery: string;
  readonly pairs: readonly EximbayUntrustedStatusPair[];
  readonly fields: Readonly<Record<string, string>>;
}

interface ParserProgress {
  rawByteLength: number;
  pairCount: number;
  duplicateCount: number;
  requiredFieldsComplete: boolean;
  transactionIdPresent: boolean;
}

export function parseUnverifiedEximbayStatus(rawQuery: string): UnverifiedEximbayStatus {
  const progress: ParserProgress = {
    rawByteLength: utf8Length(rawQuery),
    pairCount: 0,
    duplicateCount: 0,
    requiredFieldsComplete: false,
    transactionIdPresent: false,
  };
  if (hasUnpairedSurrogate(rawQuery)) fail("INVALID_UTF8", progress);
  if (progress.rawByteLength > EXIMBAY_RAW_QUERY_MAX_BYTES) {
    fail("RAW_QUERY_TOO_LARGE", progress);
  }

  const rawPairs = rawQuery.split("&");
  progress.pairCount = rawPairs.length;
  if (rawPairs.length > EXIMBAY_STATUS_MAX_PAIRS) fail("TOO_MANY_PAIRS", progress);

  const decodedFields = new Map<string, string>();
  const pairs: EximbayUntrustedStatusPair[] = [];
  for (const rawPair of rawPairs) {
    const pair = parsePair(rawPair, progress);
    if (decodedFields.has(pair.key)) {
      progress.duplicateCount += 1;
      fail("DUPLICATE_KEY", progress);
    }
    decodedFields.set(pair.key, pair.value);
    pairs.push(Object.freeze(pair));
  }

  progress.transactionIdPresent = decodedFields.has("transaction_id");
  validateRequiredFields(decodedFields, progress);
  progress.requiredFieldsComplete = true;
  const rescode = decodedFields.get("rescode");
  if (rescode === "0000" && !nonblank(decodedFields.get("transaction_id"))) {
    fail("MISSING_SUCCESS_TRANSACTION_ID", progress);
  }

  const fields = Object.freeze(Object.fromEntries(decodedFields));
  return Object.freeze({
    authority: "UNVERIFIED_STATUS",
    exactRawQuery: rawQuery,
    pairs: Object.freeze(pairs),
    fields,
  });
}

function parsePair(rawPair: string, progress: ParserProgress): EximbayUntrustedStatusPair {
  const [rawKey, rawValue] = splitRawPair(rawPair, progress);
  if (rawKey.includes("+") || rawValue.includes("+")) fail("UNESCAPED_PLUS", progress);

  const key = strictPercentDecode(rawKey, progress);
  const value = strictPercentDecode(rawValue, progress);
  validateDecodedPair(key, value, progress);
  return { key, value };
}

function splitRawPair(rawPair: string, progress: ParserProgress): readonly [string, string] {
  if (rawPair.length === 0) fail("EMPTY_PAIR", progress);
  const equalsIndex = rawPair.indexOf("=");
  if (equalsIndex < 0) fail("MISSING_EQUALS", progress);
  const rawKey = rawPair.slice(0, equalsIndex);
  if (rawKey.length === 0) fail("EMPTY_KEY", progress);
  return [rawKey, rawPair.slice(equalsIndex + 1)];
}

function validateDecodedPair(key: string, value: string, progress: ParserProgress): void {
  if (utf8Length(key) > EXIMBAY_STATUS_KEY_MAX_BYTES) fail("KEY_TOO_LARGE", progress);
  if (utf8Length(value) > EXIMBAY_STATUS_VALUE_MAX_BYTES) fail("VALUE_TOO_LARGE", progress);
  if (hasProhibitedDecodedCharacter(key) || hasProhibitedDecodedCharacter(value)) {
    fail("PROHIBITED_CHARACTER", progress);
  }
}

function strictPercentDecode(value: string, progress: ParserProgress): string {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "%") continue;
    if (!VALID_PERCENT_ESCAPE.test(value.slice(index + 1, index + 3))) {
      fail("MALFORMED_PERCENT_ESCAPE", progress);
    }
    index += 2;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    fail("INVALID_UTF8", progress);
  }
}

function validateRequiredFields(fields: ReadonlyMap<string, string>, progress: ParserProgress): void {
  for (const key of REQUIRED_STATUS_FIELDS) {
    if (!fields.has(key)) fail("MISSING_REQUIRED_FIELD", progress);
    if (!nonblank(fields.get(key))) fail("BLANK_REQUIRED_FIELD", progress);
  }
}

function nonblank(value: string | undefined): boolean {
  return value !== undefined && value.trim().length > 0;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function fail(code: EximbayStatusParserErrorCode, progress: ParserProgress): never {
  throw new EximbayStatusParseError(safeStatusDiagnostics(
    code,
    progress.rawByteLength,
    progress.pairCount,
    progress.duplicateCount,
    progress.requiredFieldsComplete,
    progress.transactionIdPresent,
  ));
}
