import { describe, expect, it } from "vitest";
import {
  normalizeReclaimUncontactedRefundExecutionInput,
  reclaimFailure,
  type ReclaimUncontactedRefundExecutionFailureCode,
} from "../uncontacted-recovery-contract";

const FAILURE_CODES = [
  "FEATURE_DISABLED",
  "CONFIG_INVALID",
  "INVALID_COMMAND_ID",
  "INVALID_RECOVERY_OWNER",
  "COMMAND_NOT_FOUND_OR_INELIGIBLE",
  "LEASE_NOT_EXPIRED",
  "LEASE_CONFLICT",
  "AUTHORIZED_RECOVERY_UNSUPPORTED",
  "CONTACTED_RECOVERY_REQUIRED",
  "LEDGER_INCONSISTENT",
  "PERSISTENCE_CONFLICT",
] as const satisfies readonly ReclaimUncontactedRefundExecutionFailureCode[];

describe("uncontacted recovery contract", () => {
  it("accepts, trims, and freezes the exact authority input", () => {
    const input = { commandId: "", recoveryOwner: "" };
    Object.setPrototypeOf(input, null);
    input.commandId = "  command_123  ";
    input.recoveryOwner = "  recovery-worker  ";

    const result = normalizeReclaimUncontactedRefundExecutionInput(input);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected input normalization success.");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.input)).toBe(true);
    expect(Object.keys(result.input).sort()).toEqual(["commandId", "recoveryOwner"]);
    expect(result.input.commandId).toBe("command_123");
    expect(result.input.recoveryOwner).toBe("recovery-worker");
  });

  it.each([
    null,
    [],
    Object.create({ commandId: "command_123", recoveryOwner: "worker" }),
    new (class { commandId = "command_123"; recoveryOwner = "worker"; })(),
    { commandId: "command_123" },
    { commandId: "command_123", recoveryOwner: "worker", extra: true },
    { commandId: "command_123", recoveryOwner: "worker", [Symbol("extra")]: true },
  ])("rejects non-exact authority input", (input) => {
    expect(normalizeReclaimUncontactedRefundExecutionInput(input).ok).toBe(false);
  });

  it("rejects accessors and non-enumerable extras without invoking an accessor", () => {
    let accessed = false;
    const accessor = { recoveryOwner: "worker" };
    Object.defineProperty(accessor, "commandId", {
      enumerable: true,
      get: () => {
        accessed = true;
        return "command_123";
      },
    });
    const hidden = { commandId: "command_123", recoveryOwner: "worker" };
    Object.defineProperty(hidden, "extra", { enumerable: false, value: true });

    expect(normalizeReclaimUncontactedRefundExecutionInput(accessor).ok).toBe(false);
    expect(accessed).toBe(false);
    expect(normalizeReclaimUncontactedRefundExecutionInput(hidden).ok).toBe(false);
  });

  it.each(["", " ", "bad\u0000id", "bad\u0085id", "x".repeat(129), 1, null])(
    "rejects invalid command id",
    (commandId) => {
      const result = normalizeReclaimUncontactedRefundExecutionInput({
        commandId,
        recoveryOwner: "worker",
      });
      expect(result).toMatchObject({ ok: false, code: "INVALID_COMMAND_ID" });
    },
  );

  it.each(["", " ", "bad\u0000owner", "bad\u0085owner", "한".repeat(256), 1, null])(
    "rejects invalid recovery owner",
    (recoveryOwner) => {
      const result = normalizeReclaimUncontactedRefundExecutionInput({
        commandId: "command_123",
        recoveryOwner,
      });
      expect(result).toMatchObject({ ok: false, code: "INVALID_RECOVERY_OWNER" });
    },
  );

  it("counts astral text by Unicode code point", () => {
    const accepted = normalizeReclaimUncontactedRefundExecutionInput({
      commandId: "😀".repeat(128),
      recoveryOwner: "😀".repeat(255),
    });
    expect(accepted.ok).toBe(true);
  });

  it("pins the complete frozen static failure union", () => {
    const failures = FAILURE_CODES.map((code) => reclaimFailure(code));
    expect(failures.map((failure) => failure.code)).toEqual(FAILURE_CODES);
    expect(failures.every(Object.isFrozen)).toBe(true);
    expect(failures.every((failure) => Object.keys(failure).sort().join(",") === "code,message,ok"))
      .toBe(true);
  });
});
