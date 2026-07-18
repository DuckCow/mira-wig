import { describe, expect, it, vi } from "vitest";
import {
  generateRunId,
  parseH1Command,
  parseRunId,
  requireCleanupAcknowledgement,
  requirePurgeAcknowledgement,
  requireRunAcknowledgement,
} from "../../../scripts/refund-sandbox-acceptance/contracts";
import {
  H1_FIXTURE_FORMAT_VERSION,
  H1_PROVIDER_TRUTH_NOTE,
  parseFixtureManifest,
} from "../../../scripts/refund-sandbox-acceptance/fixture-manifest";
import { requireSandboxCredential } from "../../../scripts/refund-sandbox-acceptance/credential-guard";
import { planResume } from "../../../scripts/refund-sandbox-acceptance/resume-planner";

const RUN_ID = "sbx-20260718T010203Z-0123456789abcdef";
const DETERMINISTIC_BYTES = Buffer.from("0123456789abcdef", "hex");

describe("refund SANDBOX acceptance command contracts", () => {
  it.each([
    "2026-07-18T01:02:03.000Z",
    "2026-07-18T01:02:03.001Z",
    "2026-07-18T01:02:03.123Z",
    "2026-07-18T01:02:03.999Z",
  ])("generates and parses the seconds-precision run id for %s", (iso) => {
    const generated = generateRunId(new Date(iso), () => DETERMINISTIC_BYTES);
    expect(generated).toBe(RUN_ID);
    expect(parseRunId(generated)).toBe(generated);
    expect(() => parseRunId(`${generated} `)).toThrow("Run id is invalid");
  });

  it("generates a parseable default-time run id without fractional seconds or path syntax", () => {
    const generated = generateRunId();
    expect(parseRunId(generated)).toBe(generated);
    expect(generated).toMatch(/^sbx-\d{8}T\d{6}Z-[0-9a-f]{16}$/);
    expect(generated.includes(".")).toBe(false);
    expect(/[\s/\\]/u.test(generated)).toBe(false);
  });

  it("preserves invalid-clock rejection and uses exactly eight random bytes", () => {
    const date = new Date("2026-07-18T01:02:03.123Z");
    const first = generateRunId(date, () => Buffer.alloc(8, 0));
    const second = generateRunId(date, () => Buffer.alloc(8, 255));
    expect(parseRunId(first)).toBe(first);
    expect(parseRunId(second)).toBe(second);
    expect(first).not.toBe(second);
    expect(first).toMatch(/-[0-9a-f]{16}$/);
    expect(second).toMatch(/-[0-9a-f]{16}$/);
    expect(() => generateRunId(new Date(Number.NaN))).toThrow("Run clock is invalid");
  });

  it("accepts only bounded command arguments", () => {
    expect(parseH1Command(["execute", "--run", RUN_ID, "--scenario", "S1"]))
      .toEqual({ command: "execute", runId: RUN_ID, scenarioId: "S1" });
    expect(() => parseH1Command(["execute", "--run", RUN_ID, "--scenario", "S7"]))
      .toThrow("Scenario id is invalid");
    expect(() => parseH1Command(["execute", "--run", RUN_ID, "--secret", "x"]))
      .toThrow("Command arguments are invalid");
    expect(() => parseH1Command(["plan", "--run", RUN_ID])).toThrow("Command arguments are invalid");
  });

  it("requires separate exact acknowledgements", () => {
    expect(() => requireRunAcknowledgement({}, RUN_ID)).toThrow("Run confirmation is required");
    expect(() => requireCleanupAcknowledgement({}, RUN_ID)).toThrow("Cleanup confirmation is required");
    expect(() => requirePurgeAcknowledgement({}, RUN_ID)).toThrow("Raw purge confirmation is required");
    expect(() => requireRunAcknowledgement({ MIRA_TOSS_SANDBOX_ACCEPTANCE_CONFIRM: `${RUN_ID} ` }, RUN_ID))
      .toThrow("Run confirmation is required");
  });

  it("keeps resume GET-only and resume-post explicitly human-gated", () => {
    expect(planResume("POST_INTENT_RECORDED", false)).toBe("GET_ONLY");
    expect(planResume("POST_INTENT_RECORDED", true)).toBe("HUMAN_POST_DECISION_REQUIRED");
    expect(planResume("POST_RESPONSE_RECORDED")).toBe("GET_ONLY");
    expect(planResume("LOCAL_COMMIT_COMPLETE")).toBe("REPORT_ONLY");
    expect(planResume("REVIEW_REQUIRED")).toBe("STOP_REVIEW_REQUIRED");
  });
});

describe("refund SANDBOX acceptance manifest and credential contracts", () => {
  it("requires S1-S5, KRW, unique protected identities, and matching scenario keys", () => {
    const manifest = fixtureManifest();
    expect(parseFixtureManifest(manifest, RUN_ID).fixtures.S5?.amount).toBe(1_005);
    expect(() => parseFixtureManifest({
      ...manifest,
      fixtures: { ...manifest.fixtures, S5: null },
    }, RUN_ID)).toThrow("FIXTURE_REQUIRED");
    expect(() => parseFixtureManifest({
      ...manifest,
      fixtures: { ...manifest.fixtures, S5: { ...manifest.fixtures.S5, paymentKey: "payment-S1" } },
    }, RUN_ID)).toThrow("FIXTURE_PAYMENT_DUPLICATE");
  });

  it("reuses the committed parser and rejects LIVE, malformed, or label-mismatched secrets", () => {
    const configured = credentialEnv("test_sk_acceptance-only");
    const credential = requireSandboxCredential(configured, { merchant: "merchant-a", generation: "generation-a" });
    expect(credential.readSecretKey()).toBe("test_sk_acceptance-only");
    expect(() => requireSandboxCredential(credentialEnv("live_sk_forbidden"), {
      merchant: "merchant-a", generation: "generation-a",
    })).toThrow("SANDBOX_CREDENTIAL_SHAPE_INVALID");
    expect(() => requireSandboxCredential(configured, { merchant: "merchant-b", generation: "generation-a" }))
      .toThrow("SANDBOX_CREDENTIAL_BINDING_MISMATCH");
  });

  it("does not leak configured secret material through thrown errors", () => {
    const secret = "test_sk_never-persist-this";
    let message = "";
    try {
      requireSandboxCredential(credentialEnv(secret), { merchant: "wrong", generation: "generation-a" });
    } catch (error) {
      message = error instanceof Error ? error.message : "non-error";
    }
    expect(message).not.toContain(secret);
    expect(vi.isMockFunction(requireSandboxCredential)).toBe(false);
  });
});

function credentialEnv(secret: string): Readonly<Record<string, string>> {
  return Object.freeze({
    TOSS_SANDBOX_SECRET_KEY: secret,
    TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING: "merchant-a",
    TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING: "generation-a",
  });
}

function fixtureManifest() {
  return {
    formatVersion: H1_FIXTURE_FORMAT_VERSION,
    runId: RUN_ID,
    expectedMerchantAccountBinding: "merchant-a",
    expectedCredentialGenerationBinding: "generation-a",
    providerTruthNote: H1_PROVIDER_TRUTH_NOTE,
    fixtures: {
      S1: fixture("S1", 1_001),
      S2: fixture("S2", 1_002),
      S3: fixture("S3", 1_003),
      S4: fixture("S4", 1_004),
      S5: fixture("S5", 1_005),
      S6: null,
    },
  };
}

function fixture(scenarioId: "S1" | "S2" | "S3" | "S4" | "S5", amount: number) {
  return {
    scenarioId,
    paymentKey: `payment-${scenarioId}`,
    providerOrderId: `order-${scenarioId}`,
    amount,
    currency: "KRW",
    reference: `reference-${scenarioId}`,
  };
}
