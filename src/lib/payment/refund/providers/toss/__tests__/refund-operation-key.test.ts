import { describe, expect, it } from "vitest";
import {
  deriveTossRefundOperationKey,
  isTossRefundProviderOperationKey,
  TossRefundOperationKeyInputError,
} from "../refund-operation-key";

const ASCII_EXPECTED =
  "toss-refund-v1-2d1c1179e42747d0f0b0abb3b7ddbd04d7127abd5a0886b1a47922fa46b05dba";
const UNICODE_EXPECTED =
  "toss-refund-v1-fada280c1dda36a79c1072afc30ac87234b7c46e439d74fbbc49fe664e719ba9";
const PADDED_EXPECTED =
  "toss-refund-v1-97c1ac89bfb398cc60c8a24b67cc1d079a7ebdd71590b7c441187f78c0911489";

describe("Toss refund operation key", () => {
  it.each([
    ["refund:payment_1:attempt_1", ASCII_EXPECTED],
    ["refund:결제_1:시도_1", UNICODE_EXPECTED],
    [" refund:payment_1:attempt_1 ", PADDED_EXPECTED],
  ])("matches an independently computed SHA-256 vector", (input, expected) => {
    const actual = deriveTossRefundOperationKey(input);

    expect(actual === expected).toBe(true);
    expect(actual.length).toBe(79);
    expect(isTossRefundProviderOperationKey(actual)).toBe(true);
  });

  it("does not trim, lowercase, or Unicode-normalize logical-key bytes", () => {
    const values = [
      deriveTossRefundOperationKey("refund:payment:attempt"),
      deriveTossRefundOperationKey(" refund:payment:attempt "),
      deriveTossRefundOperationKey("refund:Payment:attempt"),
      deriveTossRefundOperationKey("refund:é:attempt"),
      deriveTossRefundOperationKey("refund:é:attempt"),
    ];

    expect(new Set(values).size).toBe(values.length);
  });

  it.each([undefined, null, 1, "", "   ", "refund:payment:\n"])(
    "rejects invalid logical keys with a static failure",
    (input) => {
      let error: unknown;
      try {
        deriveTossRefundOperationKey(input);
      } catch (caught) {
        error = caught;
      }

      expect(error instanceof TossRefundOperationKeyInputError).toBe(true);
      expect(error instanceof Error && error.message === "Toss refund operation-key input is invalid.")
        .toBe(true);
    },
  );

  it.each([
    "toss-refund-v1-" + "A".repeat(64),
    "toss-refund-v1-" + "a".repeat(63),
    "toss-refund-v2-" + "a".repeat(64),
    "refund:payment:attempt",
  ])("rejects malformed persisted provider operation keys", (value) => {
    expect(isTossRefundProviderOperationKey(value)).toBe(false);
  });
});
