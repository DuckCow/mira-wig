import { describe, expect, it } from "vitest";
import {
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
} from "@/lib/payment/providers/credentials";
import {
  EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING,
  EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING,
  parseEximbayRefundWorkerConfig,
} from "../refund-worker-config";

const CONFIGURED = Object.freeze({
  [EXIMBAY_SANDBOX_API_KEY]: "synthetic-api-key-never-log",
  [EXIMBAY_SANDBOX_MID]: "synthetic-mid",
  [EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING]: "merchant-test-1",
  [EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING]: "generation-test-1",
});

describe("Eximbay refund worker configuration", () => {
  it.each([{}, {
    [EXIMBAY_SANDBOX_MID]: " ",
    [EXIMBAY_SANDBOX_API_KEY]: "",
    [EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING]: "",
    [EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING]: undefined,
  }])("keeps entirely absent configuration distinct", (env) => {
    expect(parseEximbayRefundWorkerConfig(env)).toEqual({ status: "ABSENT" });
  });

  it("constructs only the installed SANDBOX preflight fields", () => {
    const result = parseEximbayRefundWorkerConfig(CONFIGURED);
    expect(result).toMatchObject({
      status: "CONFIGURED",
      config: {
        mode: "SANDBOX",
        mid: "synthetic-mid",
        merchantAccountBindingId: "merchant-test-1",
        credentialGenerationBindingId: "generation-test-1",
      },
    });
    expect(result.status === "CONFIGURED" && Object.keys(result.credentials)).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("synthetic-api-key-never-log");
    expect(result.status === "CONFIGURED" && Object.keys(result.config).sort()).toEqual([
      "credentialGenerationBindingId", "merchantAccountBindingId", "mid", "mode",
    ]);
  });

  it.each([
    { ...CONFIGURED, [EXIMBAY_SANDBOX_MID]: undefined },
    { ...CONFIGURED, [EXIMBAY_SANDBOX_API_KEY]: undefined },
    { ...CONFIGURED, [EXIMBAY_SANDBOX_API_KEY]: " padded-secret " },
    { ...CONFIGURED, [EXIMBAY_REFUND_SANDBOX_MERCHANT_ACCOUNT_BINDING]: "invalid binding" },
    { ...CONFIGURED, [EXIMBAY_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING]: "" },
  ])("fails closed for partial or malformed configuration without returning values", (env) => {
    const result = parseEximbayRefundWorkerConfig(env);
    expect(result).toEqual({ status: "CONFIG_INVALID" });
    expect(JSON.stringify(result)).not.toContain("synthetic-mid");
    expect(JSON.stringify(result)).not.toContain("synthetic-api-key-never-log");
  });
});
