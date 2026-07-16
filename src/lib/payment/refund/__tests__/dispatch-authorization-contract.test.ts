import { PaymentMode, PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  dispatchAuthorizationFailure,
  dispatchAuthorizationSuccess,
  normalizeAuthorizeRefundExecutionDispatchInput,
  type RefundDispatchAuthorizationHandle,
} from "../dispatch-authorization-contract";

const TOKEN = "a".repeat(64);

describe("dispatch authorization contract", () => {
  it("normalizes exactly three own enumerable input keys", () => {
    const result = normalizeAuthorizeRefundExecutionDispatchInput({
      commandId: "  command_1  ",
      leaseGeneration: 1,
      leaseToken: `  ${TOKEN}  `,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected valid authorization input.");
    expect(Object.keys(result.input).sort()).toEqual([
      "commandId",
      "leaseGeneration",
      "leaseToken",
    ]);
    expect(result.input.commandId).toBe("command_1");
    expect(result.input.leaseGeneration).toBe(1);
    expect(result.input.leaseToken.length).toBe(64);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.input)).toBe(true);
  });

  it.each([
    { label: "missing", input: { commandId: "command_1", leaseGeneration: 1 } },
    {
      label: "extra",
      input: { commandId: "command_1", leaseGeneration: 1, leaseToken: TOKEN, ordinal: 1 },
    },
    {
      label: "enumerable symbol",
      input: Object.assign(
        { commandId: "command_1", leaseGeneration: 1, leaseToken: TOKEN },
        { [Symbol("authority")]: true },
      ),
    },
    {
      label: "inherited-only authority",
      input: inheritedAuthority(),
    },
  ])("rejects $label input authority", ({ input }) => {
    const result = normalizeAuthorizeRefundExecutionDispatchInput(input);

    expect(result.ok).toBe(false);
    expect(result.ok ? "unexpected" : result.code).toBe("INVALID_COMMAND_ID");
  });

  it.each([0, -1, 1.5, Number.NaN, 2_147_483_648])(
    "rejects invalid lease generation %j",
    (leaseGeneration) => {
      const result = normalizeAuthorizeRefundExecutionDispatchInput({
        commandId: "command_1",
        leaseGeneration,
        leaseToken: TOKEN,
      });

      expect(result.ok).toBe(false);
      expect(result.ok ? "unexpected" : result.code).toBe("INVALID_LEASE_GENERATION");
    },
  );

  it.each(["", "   ", 1, null])("rejects invalid command id %j", (commandId) => {
    const result = normalizeAuthorizeRefundExecutionDispatchInput({
      commandId,
      leaseGeneration: 1,
      leaseToken: TOKEN,
    });

    expect(result.ok).toBe(false);
    expect(result.ok ? "unexpected" : result.code).toBe("INVALID_COMMAND_ID");
  });

  it.each(["", "a".repeat(63), "A".repeat(64), `${"a".repeat(63)}g`])(
    "rejects an invalid lease token without echoing it",
    (leaseToken) => {
      const result = normalizeAuthorizeRefundExecutionDispatchInput({
        commandId: "command_1",
        leaseGeneration: 1,
        leaseToken,
      });

      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("Expected invalid token failure.");
      expect(result.code).toBe("INVALID_LEASE_TOKEN");
      expect(leaseToken.length > 0 && result.message.includes(leaseToken)).toBe(false);
    },
  );

  it("creates exact frozen success and nested handle shapes", () => {
    const result = dispatchAuthorizationSuccess(handle(), false);
    const keys = Object.keys(result.authorization).sort();

    expect(Object.keys(result).sort()).toEqual(["authorization", "ok", "replayed"]);
    expect(keys).toEqual([
      "amountMinor",
      "authorizedAt",
      "commandId",
      "currency",
      "dispatchAttempt",
      "leaseGeneration",
      "mode",
      "provider",
      "providerOperationKey",
      "providerPaymentReference",
      "refundAttemptId",
      "requestFingerprint",
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.authorization)).toBe(true);
    expect(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      result.authorization.authorizedAt,
    )).toBe(true);
    expect(keys.includes("leaseToken")).toBe(false);
    expect(keys.includes("orderId")).toBe(false);
    expect(Object.values(result.authorization).every((value) => (
      value === null || typeof value !== "object"
    ))).toBe(true);
  });

  it("creates an exact frozen failure shape", () => {
    const result = dispatchAuthorizationFailure("PERSISTENCE_CONFLICT", "Static message.");

    expect(Object.keys(result).sort()).toEqual(["code", "message", "ok"]);
    expect(Object.isFrozen(result)).toBe(true);
  });
});

function handle(): RefundDispatchAuthorizationHandle {
  return {
    commandId: "command_1",
    refundAttemptId: "attempt_1",
    dispatchAttempt: 1,
    leaseGeneration: 1,
    authorizedAt: "2026-07-16T10:00:00.123Z",
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerPaymentReference: "mock:payment_1",
    amountMinor: 400,
    currency: "KRW",
    providerOperationKey: "refund:payment_1:attempt_1",
    requestFingerprint: "b".repeat(64),
  };
}

function inheritedAuthority(): object {
  const input = {};
  Reflect.setPrototypeOf(input, {
    commandId: "command_1",
    leaseGeneration: 1,
    leaseToken: TOKEN,
  });
  return input;
}
