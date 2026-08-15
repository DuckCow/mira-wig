import { describe, expect, it } from "vitest";
import {
  EXIMBAY_LIVE_API_KEY,
  EXIMBAY_LIVE_MID,
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
  PAYMENT_PUBLIC_ORIGIN,
  type ProviderEnv,
} from "@/lib/payment/providers/credentials";
import {
  requireEximbayReadyConfigFacts,
  resolveEximbayReadyConfig,
} from "../ready-config";

const SYNTHETIC_API_KEY = "SYNTHETIC_EXIMBAY_API_KEY_DO_NOT_LOG";

describe("EX2B2-S2 atomic ready configuration", () => {
  it.each([
    ["SANDBOX" as const, EXIMBAY_SANDBOX_API_KEY, EXIMBAY_SANDBOX_MID, "sandbox-mid"],
    ["LIVE" as const, EXIMBAY_LIVE_API_KEY, EXIMBAY_LIVE_MID, "live-mid"],
  ])("selects only the exact %s API-key/MID pair", (mode, apiKeyName, midName, expectedMid) => {
    const reads: string[] = [];
    const values: ProviderEnv = {
      [apiKeyName]: SYNTHETIC_API_KEY,
      [midName]: expectedMid,
      [PAYMENT_PUBLIC_ORIGIN]: "https://payments.example.test:8443/",
    };
    const env = new Proxy(values, {
      get: (target, property): string | undefined => {
        if (typeof property !== "string") return undefined;
        reads.push(property);
        return target[property];
      },
    });

    const config = resolveEximbayReadyConfig(mode, env);
    const facts = requireEximbayReadyConfigFacts(config);

    expect(facts).toMatchObject({
      mode,
      mid: expectedMid,
      paymentPublicOrigin: "https://payments.example.test:8443",
    });
    expect(reads).toEqual([apiKeyName, midName, PAYMENT_PUBLIC_ORIGIN]);
    expect(Object.keys(config)).toEqual([]);
    expect(JSON.stringify(config)).toBe("{}");
    expect(JSON.stringify(config)).not.toContain(SYNTHETIC_API_KEY);
    expect(Object.keys(facts.credentials)).toEqual([]);
    expect(JSON.stringify(facts.credentials)).toBe("{}");
    expect(JSON.stringify(facts.credentials)).not.toContain(SYNTHETIC_API_KEY);
  });

  it.each([undefined, "", " ", " leading", "trailing ", "control\u0000", "\ud800"])(
    "rejects unsafe API-key or missing pair member without exposing it: %s",
    (value) => {
      const env = sandboxEnv();
      env[EXIMBAY_SANDBOX_API_KEY] = value;
      expect(() => resolveEximbayReadyConfig("SANDBOX", env)).toThrowError("INVALID_API_KEY");
    },
  );

  it.each([undefined, "", " ", " leading", "trailing ", "control\u007f", "\udc00"])(
    "rejects unsafe MID or missing pair member without exposing it: %s",
    (value) => {
      const env = sandboxEnv();
      env[EXIMBAY_SANDBOX_MID] = value;
      expect(() => resolveEximbayReadyConfig("SANDBOX", env)).toThrowError("INVALID_MID");
    },
  );

  it.each([
    "http://payments.example.test/",
    "https:///",
    "https://user@payments.example.test/",
    "https://user:pass@payments.example.test/",
    "https://payments.example.test/path",
    "https://payments.example.test/?query=1",
    "https://payments.example.test/?",
    "https://payments.example.test/#fragment",
    "https://payments.example.test/#",
  ])("rejects non-root or non-HTTPS payment origins: %s", (origin) => {
    const env = sandboxEnv();
    env[PAYMENT_PUBLIC_ORIGIN] = origin;
    expect(() => resolveEximbayReadyConfig("SANDBOX", env))
      .toThrowError("INVALID_PAYMENT_PUBLIC_ORIGIN");
  });

  it("has no request-header, browser, or generic URL fallback", () => {
    const env = sandboxEnv();
    delete env[PAYMENT_PUBLIC_ORIGIN];
    env.NEXTAUTH_URL = "https://must-not-be-used.example.test/";
    env.HOST = "must-not-be-used.example.test";

    expect(() => resolveEximbayReadyConfig("SANDBOX", env))
      .toThrowError("INVALID_PAYMENT_PUBLIC_ORIGIN");
  });

  it("keeps synthetic secret and MID sentinels out of validation errors and stacks", () => {
    const env = sandboxEnv();
    env[EXIMBAY_SANDBOX_API_KEY] = ` ${SYNTHETIC_API_KEY}`;
    env[EXIMBAY_SANDBOX_MID] = "SYNTHETIC_MID_DO_NOT_LOG";

    let observed: unknown;
    try {
      resolveEximbayReadyConfig("SANDBOX", env);
    } catch (error) {
      observed = error;
    }
    expect(observed).toBeInstanceOf(Error);
    if (!(observed instanceof Error)) throw new Error("Expected safe config error");
    expect(observed.message).not.toContain(SYNTHETIC_API_KEY);
    expect(observed.stack).not.toContain(SYNTHETIC_API_KEY);
    expect(observed.message).not.toContain("SYNTHETIC_MID_DO_NOT_LOG");
  });
});

function sandboxEnv(): Record<string, string | undefined> {
  return {
    [EXIMBAY_SANDBOX_API_KEY]: SYNTHETIC_API_KEY,
    [EXIMBAY_SANDBOX_MID]: "synthetic-sandbox-mid",
    [PAYMENT_PUBLIC_ORIGIN]: "https://payments.example.test/",
  };
}
