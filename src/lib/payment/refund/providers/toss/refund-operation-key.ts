import { createHash } from "crypto";

export const TOSS_REFUND_OPERATION_KEY_VERSION = "toss-refund-v1";
const TOSS_REFUND_OPERATION_KEY = /^toss-refund-v1-[0-9a-f]{64}$/;

export class TossRefundOperationKeyInputError extends Error {
  constructor() {
    super("Toss refund operation-key input is invalid.");
    this.name = "TossRefundOperationKeyInputError";
  }
}

export function deriveTossRefundOperationKey(storedLogicalKey: unknown): string {
  if (!isRepositoryLogicalKey(storedLogicalKey)) {
    throw new TossRefundOperationKeyInputError();
  }
  const digest = createHash("sha256").update(storedLogicalKey, "utf8").digest("hex");
  return `${TOSS_REFUND_OPERATION_KEY_VERSION}-${digest}`;
}

export function isTossRefundProviderOperationKey(value: unknown): value is string {
  return typeof value === "string" && TOSS_REFUND_OPERATION_KEY.test(value);
}

function isRepositoryLogicalKey(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && !/\p{Cc}/u.test(value);
}
