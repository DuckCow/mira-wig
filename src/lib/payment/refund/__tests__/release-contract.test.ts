import { describe, expect, it } from "vitest";
import {
  normalizeReleaseRefundExecutionLeaseInput,
  type NormalizeReleaseRefundExecutionLeaseInputResult,
} from "../release-contract";

const VALID_TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const POSTGRES_INT_MAX = 2_147_483_647;

describe("normalizeReleaseRefundExecutionLeaseInput", () => {
  it("accepts and freezes the canonical exact input", () => {
    const result = normalizeReleaseRefundExecutionLeaseInput({
      commandId: "command_123",
      leaseGeneration: 1,
      leaseToken: VALID_TOKEN,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected canonical release input to normalize.");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(result.input.commandId).toBe("command_123");
    expect(result.input.leaseGeneration).toBe(1);
    expect(result.input.leaseToken === VALID_TOKEN).toBe(true);
    expect(Object.keys(result.input).sort()).toEqual(["commandId", "leaseGeneration", "leaseToken"]);
  });

  it("trims command id and lease token", () => {
    const result = normalizeReleaseRefundExecutionLeaseInput({
      commandId: "  command_123  ",
      leaseGeneration: 1,
      leaseToken: `  ${VALID_TOKEN}  `,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected padded release input to normalize.");
    expect(result.input.commandId).toBe("command_123");
    expect(result.input.leaseToken === VALID_TOKEN).toBe(true);
  });

  it.each([
    { label: "missing command id", input: { leaseGeneration: 1, leaseToken: VALID_TOKEN } },
    { label: "blank command id", input: { commandId: "   ", leaseGeneration: 1, leaseToken: VALID_TOKEN } },
    { label: "non-string command id", input: { commandId: 1, leaseGeneration: 1, leaseToken: VALID_TOKEN } },
  ])("rejects $label", ({ input }) => {
    expect(failureCode(normalizeReleaseRefundExecutionLeaseInput(input))).toBe("INVALID_COMMAND_ID");
  });

  it.each([1, POSTGRES_INT_MAX])("accepts lease generation %s", (leaseGeneration) => {
    const result = normalizeReleaseRefundExecutionLeaseInput({
      commandId: "command_123",
      leaseGeneration,
      leaseToken: VALID_TOKEN,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected lease generation to normalize.");
    expect(result.input.leaseGeneration).toBe(leaseGeneration);
  });

  it.each([0, -1, 1.5, 2_147_483_648, "1", null])(
    "rejects invalid lease generation %j",
    (leaseGeneration) => {
      expect(failureCode(normalizeReleaseRefundExecutionLeaseInput({
        commandId: "command_123",
        leaseGeneration,
        leaseToken: VALID_TOKEN,
      }))).toBe("INVALID_LEASE_GENERATION");
    },
  );

  it("accepts exactly 64 lowercase hexadecimal token characters", () => {
    const result = normalizeReleaseRefundExecutionLeaseInput({
      commandId: "command_123",
      leaseGeneration: 1,
      leaseToken: VALID_TOKEN,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected canonical lease token to normalize.");
    expect(result.input.leaseToken.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(result.input.leaseToken)).toBe(true);
  });

  it.each([
    { label: "blank", leaseToken: "   " },
    { label: "uppercase", leaseToken: "A123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde" },
    { label: "non-hex", leaseToken: "g123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde" },
    { label: "short", leaseToken: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcde" },
    { label: "long", leaseToken: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0" },
    { label: "non-string", leaseToken: 64 },
  ])("rejects $label lease token", ({ leaseToken }) => {
    expect(failureCode(normalizeReleaseRefundExecutionLeaseInput({
      commandId: "command_123",
      leaseGeneration: 1,
      leaseToken,
    }))).toBe("INVALID_LEASE_TOKEN");
  });

  it.each([
    { label: "missing field", input: { commandId: "command_123", leaseGeneration: 1 } },
    {
      label: "extra string field",
      input: { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN, reason: "none" },
    },
    {
      label: "lease owner",
      input: { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN, leaseOwner: "worker" },
    },
    {
      label: "caller time",
      input: { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN, now: new Date() },
    },
    {
      label: "deadline",
      input: { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN, leaseUntil: new Date() },
    },
    {
      label: "operation identity",
      input: { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN, operationId: "operation" },
    },
    {
      label: "provider field",
      input: { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN, provider: "MOCK" },
    },
    { label: "null", input: null },
    { label: "array", input: ["command_123", 1, VALID_TOKEN] },
  ])("rejects $label input", ({ input }) => {
    expect(normalizeReleaseRefundExecutionLeaseInput(input).ok).toBe(false);
  });

  it("rejects an extra enumerable symbol field", () => {
    const extra = Symbol("extra");
    const input = { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN, [extra]: true };

    expect(normalizeReleaseRefundExecutionLeaseInput(input).ok).toBe(false);
  });

  it("rejects inherited-field-only objects", () => {
    const input = {};
    Object.setPrototypeOf(input, { commandId: "command_123", leaseGeneration: 1, leaseToken: VALID_TOKEN });

    expect(normalizeReleaseRefundExecutionLeaseInput(input).ok).toBe(false);
  });
});

function failureCode(result: NormalizeReleaseRefundExecutionLeaseInputResult): string {
  return result.ok ? "<unexpected-release-input-success>" : result.code;
}
