import { describe, expect, it } from "vitest";
import {
  normalizeAuthorizeTossRefundExecutionDispatchInput,
  tossRefundAuthorizationFailure,
  tossRefundAuthorizationSuccess,
} from "../refund-authorization-contract";
import { isConservativeTossLookupTimeValid } from "../refund-authorization-state";

const VALID = Object.freeze({
  commandId: "command_한글",
  leaseGeneration: 1,
  leaseToken: "a".repeat(64),
});

describe("Toss refund authorization public contract", () => {
  it("accepts the exact plain and null-prototype three-field values", () => {
    expect(normalizeAuthorizeTossRefundExecutionDispatchInput(VALID).ok).toBe(true);
    const nullPrototype = { ...VALID };
    Reflect.setPrototypeOf(nullPrototype, null);
    expect(normalizeAuthorizeTossRefundExecutionDispatchInput(nullPrototype).ok).toBe(true);
  });

  it("rejects accessors, symbols, extras, arrays, and inherited values", () => {
    const accessor = { leaseGeneration: 1, leaseToken: VALID.leaseToken };
    Object.defineProperty(accessor, "commandId", { enumerable: true, get: () => "command" });
    const symbol = { ...VALID, [Symbol("hidden")]: true };
    const inherited = { leaseGeneration: 1, leaseToken: VALID.leaseToken };
    Reflect.setPrototypeOf(inherited, { commandId: VALID.commandId });
    for (const value of [accessor, symbol, { ...VALID, extra: true }, inherited, [], null]) {
      expect(normalizeAuthorizeTossRefundExecutionDispatchInput(value).ok).toBe(false);
    }
  });

  it("enforces command code-point/control, generation, and token bounds", () => {
    const invalid = [
      { ...VALID, commandId: "x".repeat(129) },
      { ...VALID, commandId: "bad\ncommand" },
      { ...VALID, leaseGeneration: 0 },
      { ...VALID, leaseGeneration: 2_147_483_648 },
      { ...VALID, leaseGeneration: 1.5 },
      { ...VALID, leaseToken: "A".repeat(64) },
      { ...VALID, leaseToken: "a".repeat(63) },
    ];
    for (const value of invalid) expect(normalizeAuthorizeTossRefundExecutionDispatchInput(value).ok).toBe(false);
    expect(normalizeAuthorizeTossRefundExecutionDispatchInput({
      ...VALID,
      commandId: "가".repeat(128),
      leaseGeneration: 2_147_483_647,
    }).ok).toBe(true);
  });

  it("returns frozen, exact, secret-free result shapes", () => {
    const failure = tossRefundAuthorizationFailure("FEATURE_DISABLED", "disabled");
    const success = tossRefundAuthorizationSuccess({
      commandId: "command",
      dispatchAttempt: 1,
      leaseGeneration: 7,
      authorizedAt: "2026-07-17T00:00:00.000Z",
    }, false);
    expect(Object.keys(failure)).toEqual(["ok", "code", "message"]);
    expect(Object.keys(success)).toEqual(["ok", "replayed", "authorization"]);
    expect(Object.keys(success.authorization)).toEqual([
      "commandId", "dispatchAttempt", "leaseGeneration", "authorizedAt",
    ]);
    expect([failure, success, success.authorization].every(Object.isFrozen)).toBe(true);
    expect(JSON.stringify([failure, success])).not.toContain(VALID.leaseToken);
  });

  it("rejects a conservative lookup timestamp that is even 1 ms after Phase 4", () => {
    const authority = {
      orderId: "order",
      refundAttemptId: "attempt",
      commandId: "command",
      paymentKey: "payment",
      conservativeNoLaterThanLookupTimestamp: 1_000,
    };
    expect(isConservativeTossLookupTimeValid(authority, new Date(1_000))).toBe(true);
    expect(isConservativeTossLookupTimeValid(authority, new Date(999))).toBe(false);
  });
});
