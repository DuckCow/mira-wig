export type EximbayStatusParserErrorCode =
  | "RAW_QUERY_TOO_LARGE"
  | "TOO_MANY_PAIRS"
  | "EMPTY_PAIR"
  | "MISSING_EQUALS"
  | "EMPTY_KEY"
  | "UNESCAPED_PLUS"
  | "MALFORMED_PERCENT_ESCAPE"
  | "INVALID_UTF8"
  | "KEY_TOO_LARGE"
  | "VALUE_TOO_LARGE"
  | "PROHIBITED_CHARACTER"
  | "DUPLICATE_KEY"
  | "MISSING_REQUIRED_FIELD"
  | "BLANK_REQUIRED_FIELD"
  | "MISSING_SUCCESS_TRANSACTION_ID";

export interface EximbaySafeStatusDiagnostics {
  readonly code: EximbayStatusParserErrorCode;
  readonly rawByteLength: number;
  readonly pairCount: number;
  readonly duplicateCount: number;
  readonly requiredFieldsComplete: boolean;
  readonly transactionIdPresent: boolean;
}

export class EximbayStatusParseError extends Error {
  constructor(readonly diagnostics: EximbaySafeStatusDiagnostics) {
    super(diagnostics.code);
    this.name = "EximbayStatusParseError";
  }
}

export function safeStatusDiagnostics(
  code: EximbayStatusParserErrorCode,
  rawByteLength: number,
  pairCount: number,
  duplicateCount: number,
  requiredFieldsComplete: boolean,
  transactionIdPresent: boolean,
): EximbaySafeStatusDiagnostics {
  return Object.freeze({
    code,
    rawByteLength,
    pairCount,
    duplicateCount,
    requiredFieldsComplete,
    transactionIdPresent,
  });
}
