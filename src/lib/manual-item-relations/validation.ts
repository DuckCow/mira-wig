import {
  MANUAL_STYLE_RELATION_PURPOSES,
  ManualStyleRelationException,
  type ManualStyleRelationPurpose,
} from "./types";

export const MIN_PRIORITY = 0;
export const MAX_PRIORITY = 10000;
export const MAX_RATIONALE_CODE_POINTS = 500;

const CONTROL_CHARACTER = /\p{Cc}/u;

export function assertManualRelationPurpose(
  value: unknown,
): asserts value is ManualStyleRelationPurpose {
  if (
    typeof value !== "string"
    || !MANUAL_STYLE_RELATION_PURPOSES.some((purpose) => purpose === value)
  ) {
    throw new ManualStyleRelationException(
      "INVALID_RELATION_PURPOSE",
      "Manual style relation purpose is invalid.",
    );
  }
}

export function assertManualRelationPriority(value: unknown): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || !Number.isSafeInteger(value)
    || value < MIN_PRIORITY
    || value > MAX_PRIORITY
  ) {
    throw new ManualStyleRelationException(
      "INVALID_PRIORITY",
      "Manual style relation priority must be a safe integer from 0 through 10000.",
    );
  }
}

export function assertManualRelationActiveState(
  value: unknown,
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new ManualStyleRelationException(
      "INVALID_ACTIVE_STATE",
      "Manual style relation active state must be an exact boolean.",
    );
  }
}

export function normalizeManualRelationRationale(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new ManualStyleRelationException(
      "RATIONALE_INVALID",
      "Manual style relation rationale must be text when present.",
    );
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (CONTROL_CHARACTER.test(normalized)) {
    throw new ManualStyleRelationException(
      "RATIONALE_INVALID",
      "Manual style relation rationale contains a control character.",
    );
  }
  if (Array.from(normalized).length > MAX_RATIONALE_CODE_POINTS) {
    throw new ManualStyleRelationException(
      "RATIONALE_TOO_LONG",
      "Manual style relation rationale exceeds 500 Unicode code points.",
    );
  }
  return normalized;
}

export function assertActiveRationale(value: string | null): asserts value is string {
  if (value === null) {
    throw new ManualStyleRelationException(
      "RATIONALE_REQUIRED",
      "An active manual style relation requires an internal rationale.",
    );
  }
}

export function compareUtf16CodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
