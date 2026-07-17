import { describe, expect, it } from "vitest";
import {
  contactFailure,
  contactSuccess,
  normalizeExecuteTossRefundContactInput,
} from "../refund-contact-contract";

const VALID = {
  commandId: " command-1 ",
  leaseGeneration: 1,
  leaseToken: ` ${"a".repeat(64)} `,
};

describe("Toss refund contact contract", () => {
  it("normalizes, freezes, and accepts Object/null prototypes only", () => {
    const plain = normalizeExecuteTossRefundContactInput(VALID);
    const normalizedNull = normalizeExecuteTossRefundContactInput(
      Object.assign(Object.create(null), VALID),
    );
    expect(plain).toEqual({ ok: true, input: {
      commandId: "command-1", leaseGeneration: 1, leaseToken: "a".repeat(64),
    } });
    expect(normalizedNull.ok).toBe(true);
    expect(Object.isFrozen(plain)).toBe(true);
    if (plain.ok) expect(Object.isFrozen(plain.input)).toBe(true);
  });

  it.each([
    Object.assign(Object.create({ commandId: "inherited" }), VALID),
    { ...VALID, extra: true },
    Object.defineProperty({ ...VALID }, "commandId", { get: () => "command-1", enumerable: true }),
    Object.assign({ ...VALID }, { [Symbol("authority")]: true }),
    [],
  ])("rejects non-exact authority objects", (input) => {
    expect(normalizeExecuteTossRefundContactInput(input)).toMatchObject({
      ok: false, code: "INVALID_COMMAND_ID",
    });
  });

  it.each([
    [{ ...VALID, commandId: "\u0000bad" }, "INVALID_COMMAND_ID"],
    [{ ...VALID, commandId: "x".repeat(129) }, "INVALID_COMMAND_ID"],
    [{ ...VALID, leaseGeneration: 0 }, "INVALID_LEASE_GENERATION"],
    [{ ...VALID, leaseGeneration: 2_147_483_648 }, "INVALID_LEASE_GENERATION"],
    [{ ...VALID, leaseToken: "A".repeat(64) }, "INVALID_LEASE_TOKEN"],
  ] as const)("rejects invalid scalar authority", (input, code) => {
    expect(normalizeExecuteTossRefundContactInput(input)).toMatchObject({ ok: false, code });
  });

  it("freezes exact non-sensitive success and failure results", () => {
    const success = contactSuccess("command-1", false);
    const failure = contactFailure("FEATURE_DISABLED", "Toss refund contact is disabled.");
    expect(success).toEqual({
      ok: true, replayed: false, commandId: "command-1",
      dispatchAttempt: 1, outcome: "REFUND_SUCCEEDED",
    });
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(failure)).toBe(true);
  });
});
