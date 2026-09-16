import { describe, expect, it } from "vitest";
import {
  SES_REQUEST_TIMEOUT_MAX_MS,
  validateSesTransactionalEmailConfig,
  type SesTransactionalEmailConfig,
} from "../config";

describe("SES transactional email configuration", () => {
  it("accepts an exact trusted configuration and formats From once", () => {
    expect(validateSesTransactionalEmailConfig(validConfig())).toEqual({
      region: "ap-northeast-2",
      fromAddress: "orders@example.test",
      fromDisplayName: "Mira",
      replyToAddress: "support@example.test",
      configurationSetName: "mira-transactional-v1",
      requestTimeoutMs: 10_000,
      fromEmailAddress: "Mira <orders@example.test>",
      recipientRouting: { mode: "PRODUCTION" },
    });
  });

  it("requires one exact safe recipient in sandbox/prelaunch mode", () => {
    expect(validateSesTransactionalEmailConfig({
      ...validConfig(),
      recipientRouting: {
        mode: "SANDBOX_PRELAUNCH",
        safeRecipient: "authorized@example.test",
      },
    }).recipientRouting).toEqual({
      mode: "SANDBOX_PRELAUNCH",
      safeRecipient: "authorized@example.test",
    });

    expect(() => validateSesTransactionalEmailConfig({
      ...validConfig(),
      recipientRouting: { mode: "SANDBOX_PRELAUNCH" },
    })).toThrow("SES_CONFIGURATION_INVALID");
    expect(() => validateSesTransactionalEmailConfig({
      ...validConfig(),
      recipientRouting: { mode: "SANDBOX_PRELAUNCH", safeRecipient: " invalid" },
    })).toThrow("SES_CONFIGURATION_INVALID");
  });

  it.each([
    { region: "" },
    { region: " ap-northeast-2" },
    { region: "AP-NORTHEAST-2" },
    { fromAddress: "not-an-address" },
    { fromAddress: "orders@example.test\r\nBcc: attacker@example.test" },
    { fromDisplayName: "" },
    { fromDisplayName: "Mira\0Injected" },
    { fromDisplayName: "Mira\nInjected" },
    { replyToAddress: "reply@example.test\rInjected" },
    { configurationSetName: "" },
    { configurationSetName: "mira set" },
    { configurationSetName: "mira\nset" },
    { requestTimeoutMs: 0 },
    { requestTimeoutMs: SES_REQUEST_TIMEOUT_MAX_MS + 1 },
    { requestTimeoutMs: 1.5 },
  ])("rejects invalid trusted configuration %#", (change) => {
    expect(() => validateSesTransactionalEmailConfig({ ...validConfig(), ...change }))
      .toThrow("SES_CONFIGURATION_INVALID");
  });
});

function validConfig(): SesTransactionalEmailConfig {
  return {
    region: "ap-northeast-2",
    fromAddress: "orders@example.test",
    fromDisplayName: "Mira",
    replyToAddress: "support@example.test",
    configurationSetName: "mira-transactional-v1",
    requestTimeoutMs: 10_000,
  };
}
