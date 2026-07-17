import { describe, expect, it } from "vitest";
import {
  normalizeTossRefundRecoveryInput,
  recoveryFailure,
} from "../refund-recovery-contract";

describe("pure Toss refund recovery public contract", () => {
  it("normalizes and freezes exactly two data fields", () => {
    const result = normalizeTossRefundRecoveryInput({
      commandId: " command-1 ", recoveryOwner: " worker-1 ",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && Object.isFrozen(result) && Object.isFrozen(result.input)).toBe(true);
    expect(result.ok && Object.keys(result.input)).toEqual(["commandId", "recoveryOwner"]);
  });

  it.each([
    null,
    [],
    { commandId: "command-1" },
    { commandId: "command-1", recoveryOwner: "worker-1", extra: true },
    Object.assign(Object.create({ inherited: true }), {
      commandId: "command-1", recoveryOwner: "worker-1",
    }),
    { commandId: "\n", recoveryOwner: "worker-1" },
    { commandId: "c".repeat(129), recoveryOwner: "worker-1" },
  ])("rejects malformed command authority", (value) => {
    const result = normalizeTossRefundRecoveryInput(value);
    expect(!result.ok && result.code === "INVALID_COMMAND_ID").toBe(true);
  });

  it("rejects accessors and symbols without invoking the accessor", () => {
    let reads = 0;
    const value = Object.defineProperty({ recoveryOwner: "worker-1" }, "commandId", {
      enumerable: true,
      get() { reads += 1; return "command-1"; },
    });
    Object.defineProperty(value, Symbol("authority"), { enumerable: true, value: true });

    const result = normalizeTossRefundRecoveryInput(value);
    expect(!result.ok && result.code === "INVALID_COMMAND_ID").toBe(true);
    expect(reads).toBe(0);
  });

  it.each(["", "\n", "o".repeat(256)])("rejects an invalid recovery owner", (owner) => {
    const result = normalizeTossRefundRecoveryInput({
      commandId: "command-1", recoveryOwner: owner,
    });
    expect(!result.ok && result.code === "INVALID_RECOVERY_OWNER").toBe(true);
  });

  it("returns only frozen static recovery failures", () => {
    const failure = recoveryFailure("RECOVERY_LOOKUP_UNAVAILABLE", "Recovery lookup is unavailable.");
    expect(Object.isFrozen(failure)).toBe(true);
    expect(Object.keys(failure)).toEqual(["ok", "code", "message"]);
  });
});
