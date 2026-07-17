import { isDeepStrictEqual } from "util";
import { describe, expect, it } from "vitest";
import {
  ConfiguredTossRefundCredential,
  parseTossRefundCredentialConfig,
  type TossRefundCredentialConfigState,
  type TossRefundCredentialRawValues,
} from "../refund-credential-config";

const SECRET = " test_secret_material ";
const MERCHANT = "merchant.sandbox-1";
const GENERATION = "generation_2026.07";

describe("Toss refund credential configuration", () => {
  it("returns a frozen ABSENT state when every raw value is absent", () => {
    const result = parseTossRefundCredentialConfig(raw());

    expect(result.status).toBe("ABSENT");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    [SECRET, undefined, undefined],
    [undefined, MERCHANT, undefined],
    [undefined, undefined, GENERATION],
    [SECRET, MERCHANT, undefined],
    [SECRET, undefined, GENERATION],
    [undefined, MERCHANT, GENERATION],
  ])("rejects every partial-presence combination", (secretKey, merchant, generation) => {
    const result = parseTossRefundCredentialConfig(raw(secretKey, merchant, generation));

    expect(result.status).toBe("CONFIG_INVALID");
    expect(JSON.stringify(result).includes("secret_material")).toBe(false);
  });

  it("trims labels once, preserves secret bytes, and returns frozen configured state", () => {
    const result = configured(parseTossRefundCredentialConfig(raw(
      SECRET,
      ` ${MERCHANT} `,
      ` ${GENERATION} `,
    )));

    expect(result.configuration.merchantAccountBinding === MERCHANT).toBe(true);
    expect(result.configuration.credentialGenerationBinding === GENERATION).toBe(true);
    expect(result.configuration.readSecretKey() === SECRET).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.configuration)).toBe(true);
    expect(JSON.stringify(result).includes("secret_material")).toBe(false);
  });

  it("permits equal merchant and credential-generation labels", () => {
    const result = configured(parseTossRefundCredentialConfig(raw(SECRET, MERCHANT, MERCHANT)));

    expect(result.configuration.merchantAccountBinding
      === result.configuration.credentialGenerationBinding).toBe(true);
  });

  it.each([
    "contains:colon",
    "contains space",
    "slash/value",
    "한글",
    "a".repeat(65),
  ])("rejects invalid binding-label grammar without disclosing values", (invalidLabel) => {
    const result = parseTossRefundCredentialConfig(raw(SECRET, invalidLabel, GENERATION));

    expect(result.status).toBe("CONFIG_INVALID");
    expect(JSON.stringify(result).includes(invalidLabel)).toBe(false);
    expect(JSON.stringify(result).includes("secret_material")).toBe(false);
  });

  it("accepts the 1 and 64 character label boundaries", () => {
    const first = parseTossRefundCredentialConfig(raw(SECRET, "a", "b"));
    const second = parseTossRefundCredentialConfig(raw(SECRET, "a".repeat(64), "b".repeat(64)));

    expect(isDeepStrictEqual([first.status, second.status], ["CONFIGURED", "CONFIGURED"]))
      .toBe(true);
  });

  it("treats blank values as absent rather than partial secrets", () => {
    const result = parseTossRefundCredentialConfig(raw(" \t ", "", undefined));

    expect(result.status).toBe("ABSENT");
  });
});

function raw(
  secretKey?: string,
  merchantAccountBinding?: string,
  credentialGenerationBinding?: string,
): TossRefundCredentialRawValues {
  return { secretKey, merchantAccountBinding, credentialGenerationBinding };
}

function configured(
  state: TossRefundCredentialConfigState,
): Extract<TossRefundCredentialConfigState, { status: "CONFIGURED" }> {
  if (state.status !== "CONFIGURED") throw new Error("Expected configured Toss refund credential.");
  if (!(state.configuration instanceof ConfiguredTossRefundCredential)) {
    throw new Error("Expected opaque Toss refund credential configuration.");
  }
  return state;
}
