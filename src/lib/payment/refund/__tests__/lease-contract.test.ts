import { describe, expect, it } from "vitest";
import { normalizeAcquireRefundExecutionLeaseInput } from "../lease-contract";

describe("normalizeAcquireRefundExecutionLeaseInput", () => {
  it("accepts the exact canonical input", () => {
    expect(normalizeAcquireRefundExecutionLeaseInput({
      commandId: "command_123",
      leaseOwner: "worker-east-1",
    })).toEqual({
      ok: true,
      input: { commandId: "command_123", leaseOwner: "worker-east-1" },
    });
  });

  it("trims both required identifiers", () => {
    expect(normalizeAcquireRefundExecutionLeaseInput({
      commandId: "  command_123  ",
      leaseOwner: "  worker-east-1  ",
    })).toEqual({
      ok: true,
      input: { commandId: "command_123", leaseOwner: "worker-east-1" },
    });
  });

  it.each(["", " ", "\n", null, undefined, 1, {}, []])(
    "rejects malformed lease owner %j",
    (leaseOwner) => {
      expect(normalizeAcquireRefundExecutionLeaseInput({ commandId: "command_123", leaseOwner }))
        .toMatchObject({ ok: false, code: "INVALID_LEASE_OWNER" });
    },
  );

  it.each(["worker\u0000name", "worker\u0085name", "worker\nname"])(
    "rejects control characters in %j",
    (leaseOwner) => {
      expect(normalizeAcquireRefundExecutionLeaseInput({ commandId: "command_123", leaseOwner }))
        .toMatchObject({ ok: false, code: "INVALID_LEASE_OWNER" });
    },
  );

  it("accepts 255 Unicode code points", () => {
    const leaseOwner = "한".repeat(255);
    expect(normalizeAcquireRefundExecutionLeaseInput({ commandId: "command_123", leaseOwner }).ok).toBe(true);
  });

  it("rejects 256 Unicode code points", () => {
    const leaseOwner = "한".repeat(256);
    expect(normalizeAcquireRefundExecutionLeaseInput({ commandId: "command_123", leaseOwner }))
      .toMatchObject({ ok: false, code: "INVALID_LEASE_OWNER" });
  });

  it("counts astral Unicode as code points rather than UTF-16 code units", () => {
    const accepted = "😀".repeat(255);
    const rejected = "😀".repeat(256);
    expect(accepted.length).toBe(510);
    expect(normalizeAcquireRefundExecutionLeaseInput({ commandId: "command_123", leaseOwner: accepted }).ok)
      .toBe(true);
    expect(normalizeAcquireRefundExecutionLeaseInput({ commandId: "command_123", leaseOwner: rejected }))
      .toMatchObject({ ok: false, code: "INVALID_LEASE_OWNER" });
  });

  it.each(["", " ", null, undefined, 1, {}, []])("rejects malformed command id %j", (commandId) => {
    expect(normalizeAcquireRefundExecutionLeaseInput({ commandId, leaseOwner: "worker-east-1" }))
      .toMatchObject({ ok: false, code: "INVALID_COMMAND_ID" });
  });

  it.each([
    {},
    { commandId: "command_123" },
    { leaseOwner: "worker-east-1" },
  ])("rejects missing fields in %j", (input) => {
    expect(normalizeAcquireRefundExecutionLeaseInput(input))
      .toMatchObject({ ok: false, code: "INVALID_COMMAND_ID" });
  });

  it.each([
    { extra: true },
    { now: new Date("2026-07-16T00:00:00.000Z") },
    { leaseUntil: new Date("2026-07-16T00:05:00.000Z") },
    { duration: 300_000 },
    { leaseToken: "caller-token" },
    { leaseGeneration: 1 },
    { provider: "MOCK" },
    { providerPaymentKey: "provider-key" },
    { operationKey: "operation-key" },
  ])("rejects caller-supplied authority fields in %j", (extra) => {
    expect(normalizeAcquireRefundExecutionLeaseInput({
      commandId: "command_123",
      leaseOwner: "worker-east-1",
      ...extra,
    })).toMatchObject({ ok: false, code: "INVALID_COMMAND_ID" });
  });

  it("rejects an additional enumerable symbol field", () => {
    const authority = Symbol("authority");
    const input = {
      commandId: "command_123",
      leaseOwner: "worker-east-1",
      [authority]: true,
    };

    expect(normalizeAcquireRefundExecutionLeaseInput(input))
      .toMatchObject({ ok: false, code: "INVALID_COMMAND_ID" });
  });
});
