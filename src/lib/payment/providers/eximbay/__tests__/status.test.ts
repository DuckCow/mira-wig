import { describe, expect, it } from "vitest";
import {
  EXIMBAY_RAW_QUERY_MAX_BYTES,
  EXIMBAY_STATUS_KEY_MAX_BYTES,
  EXIMBAY_STATUS_MAX_PAIRS,
  EXIMBAY_STATUS_VALUE_MAX_BYTES,
  EximbayStatusParseError,
  parseUnverifiedEximbayStatus,
} from "../index";

const BASE_PAIRS: readonly string[] = [
  "transaction_type=PAYMENT",
  "mid=merchant-mid",
  "order_id=payment-1",
  "currency=USD",
  "amount=29.99",
  "rescode=0000",
  "resmsg=Success",
  "fgkey=secret-fgkey",
  "transaction_id=transaction-1",
];

function validRaw(extra: readonly string[] = []): string {
  return [...BASE_PAIRS, ...extra].join("&");
}

function rawAtByteLimit(): string {
  const base = validRaw();
  const headers: readonly string[] = ["&padding0=", "&padding1=", "&padding2=", "&padding3="];
  const headerBytes = headers.reduce((total, header) => total + header.length, 0);
  const valueBytes = EXIMBAY_RAW_QUERY_MAX_BYTES - base.length - headerBytes;
  const commonLength = Math.floor(valueBytes / headers.length);
  const remainder = valueBytes % headers.length;
  const padding = headers.map((header, index) => {
    const length = commonLength + (index < remainder ? 1 : 0);
    return `${header}${"a".repeat(length)}`;
  });
  return `${base}${padding.join("")}`;
}

function parserError(raw: string): EximbayStatusParseError {
  try {
    parseUnverifiedEximbayStatus(raw);
  } catch (error) {
    if (error instanceof EximbayStatusParseError) return error;
    throw error;
  }
  throw new Error("Expected EximbayStatusParseError");
}

describe("Eximbay exact raw status carrier", () => {
  it("preserves exact raw text, pair order, escaping, and the first embedded equals", () => {
    const raw = validRaw(["opaque=a=b=c", "plus=%2B", "space=%20", "legal_empty="]);
    const parsed = parseUnverifiedEximbayStatus(raw);

    expect(parsed.authority).toBe("UNVERIFIED_STATUS");
    expect(parsed.exactRawQuery).toBe(raw);
    expect(parsed.pairs.map((pair) => pair.key)).toEqual([
      ...BASE_PAIRS.map((pair) => pair.slice(0, pair.indexOf("="))),
      "opaque",
      "plus",
      "space",
      "legal_empty",
    ]);
    expect(parsed.fields.opaque).toBe("a=b=c");
    expect(parsed.fields.plus).toBe("+");
    expect(parsed.fields.space).toBe(" ");
    expect(parsed.fields.legal_empty).toBe("");
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.pairs)).toBe(true);
    expect(Object.isFrozen(parsed.fields)).toBe(true);
  });

  it("rejects raw plus without changing the caller-owned exact representation", () => {
    const raw = validRaw(["message=a+b"]);
    const before = raw;
    const error = parserError(raw);

    expect(raw).toBe(before);
    expect(error.diagnostics.code).toBe("UNESCAPED_PLUS");
  });
});

describe("Eximbay hostile-input parser bounds", () => {
  it("accepts the exact raw byte limit and rejects one byte over it", () => {
    const atLimit = rawAtByteLimit();
    expect(new TextEncoder().encode(atLimit)).toHaveLength(EXIMBAY_RAW_QUERY_MAX_BYTES);
    expect(parseUnverifiedEximbayStatus(atLimit).fields.padding0.length)
      .toBeLessThanOrEqual(EXIMBAY_STATUS_VALUE_MAX_BYTES);

    const error = parserError(`${atLimit}a`);
    expect(error.diagnostics.code).toBe("RAW_QUERY_TOO_LARGE");
    expect(error.diagnostics.rawByteLength).toBe(EXIMBAY_RAW_QUERY_MAX_BYTES + 1);
  });

  it("accepts 64 pairs and rejects 65 pairs", () => {
    const additions = Array.from(
      { length: EXIMBAY_STATUS_MAX_PAIRS - BASE_PAIRS.length },
      (_, index) => `extra${String(index)}=x`,
    );
    expect(parseUnverifiedEximbayStatus(validRaw(additions)).pairs)
      .toHaveLength(EXIMBAY_STATUS_MAX_PAIRS);
    const error = parserError(validRaw([...additions, "overflow=x"]));
    expect(error.diagnostics.code).toBe("TOO_MANY_PAIRS");
    expect(error.diagnostics.pairCount).toBe(EXIMBAY_STATUS_MAX_PAIRS + 1);
  });

  it("enforces decoded UTF-8 key and value byte limits", () => {
    const keyAtLimit = "k".repeat(EXIMBAY_STATUS_KEY_MAX_BYTES);
    const valueAtLimit = "v".repeat(EXIMBAY_STATUS_VALUE_MAX_BYTES);
    expect(parseUnverifiedEximbayStatus(validRaw([`${keyAtLimit}=${valueAtLimit}`])).fields[keyAtLimit])
      .toBe(valueAtLimit);
    expect(parserError(validRaw([`${keyAtLimit}k=x`])).diagnostics.code).toBe("KEY_TOO_LARGE");
    expect(parserError(validRaw([`large=${valueAtLimit}v`])).diagnostics.code).toBe("VALUE_TOO_LARGE");
  });
});

describe("Eximbay strict raw-query grammar", () => {
  it.each([
    ["", "EMPTY_PAIR"],
    [`${validRaw()}&`, "EMPTY_PAIR"],
    [`${validRaw()}&missing`, "MISSING_EQUALS"],
    [`${validRaw()}&=value`, "EMPTY_KEY"],
    [`${validRaw()}&bad=%`, "MALFORMED_PERCENT_ESCAPE"],
    [`${validRaw()}&bad=%2`, "MALFORMED_PERCENT_ESCAPE"],
    [`${validRaw()}&bad=%GG`, "MALFORMED_PERCENT_ESCAPE"],
    [`${validRaw()}&bad=%C3%28`, "INVALID_UTF8"],
    [`${validRaw()}&bad=%00`, "PROHIBITED_CHARACTER"],
    [`${validRaw()}&bad=%1F`, "PROHIBITED_CHARACTER"],
    [`${validRaw()}&bad=%7F`, "PROHIBITED_CHARACTER"],
  ])("rejects hostile query input with safe code %s", (raw, code) => {
    expect(parserError(raw).diagnostics.code).toBe(code);
  });

  it("rejects a raw unpaired surrogate as invalid UTF-8", () => {
    const raw = `${validRaw()}&bad=${String.fromCharCode(0xd800)}`;
    expect(parserError(raw).diagnostics.code).toBe("INVALID_UTF8");
  });

  it("rejects duplicate decoded names including encoded aliases", () => {
    const error = parserError(validRaw(["alias=one", "%61lias=two"]));
    expect(error.diagnostics.code).toBe("DUPLICATE_KEY");
    expect(error.diagnostics.duplicateCount).toBe(1);
  });
});

describe("Eximbay status semantic minimums", () => {
  it.each([
    "transaction_type",
    "mid",
    "order_id",
    "currency",
    "amount",
    "rescode",
    "resmsg",
    "fgkey",
  ])("requires exactly one nonblank %s field", (required) => {
    const omitted = BASE_PAIRS.filter((pair) => !pair.startsWith(`${required}=`));
    expect(parserError(omitted.join("&")).diagnostics.code).toBe("MISSING_REQUIRED_FIELD");
    const blanked = BASE_PAIRS.map((pair) => pair.startsWith(`${required}=`) ? `${required}=` : pair);
    expect(parserError(blanked.join("&")).diagnostics.code).toBe("BLANK_REQUIRED_FIELD");
  });

  it("requires transaction_id only for a rescode 0000 success candidate", () => {
    const withoutTransaction = BASE_PAIRS.filter((pair) => !pair.startsWith("transaction_id="));
    expect(parserError(withoutTransaction.join("&")).diagnostics.code)
      .toBe("MISSING_SUCCESS_TRANSACTION_ID");

    const failure = withoutTransaction.map((pair) => pair === "rescode=0000" ? "rescode=1001" : pair);
    const parsed = parseUnverifiedEximbayStatus(failure.join("&"));
    expect(parsed.fields.transaction_id).toBeUndefined();
  });

  it("keeps unknown keys untrusted and makes no authenticity or success claim", () => {
    const parsed = parseUnverifiedEximbayStatus(validRaw(["unknown=sensitive-value"]));
    expect(parsed.authority).toBe("UNVERIFIED_STATUS");
    expect(parsed.fields.unknown).toBe("sensitive-value");
    expect(Object.keys(parsed)).not.toContain("verified");
    expect(Object.keys(parsed)).not.toContain("paymentCompleted");
  });
});

describe("Eximbay safe parser diagnostics", () => {
  it("exposes only stable aggregate facts and never sensitive raw material", () => {
    const raw = validRaw([
      "secret-card=4111111111111111",
      "duplicate-secret-key=secret",
      "duplicate-secret-key=other",
    ]);
    const error = parserError(raw);
    const exposed = JSON.stringify(error);

    expect(error.message).toBe("DUPLICATE_KEY");
    expect(error.diagnostics).toEqual({
      code: "DUPLICATE_KEY",
      rawByteLength: new TextEncoder().encode(raw).byteLength,
      pairCount: BASE_PAIRS.length + 3,
      duplicateCount: 1,
      requiredFieldsComplete: false,
      transactionIdPresent: false,
    });
    for (const prohibited of [
      raw,
      "4111111111111111",
      "secret-fgkey",
      "merchant-mid",
      "payment-1",
      "transaction-1",
      "secret-card",
      "duplicate-secret-key",
    ]) {
      expect(exposed).not.toContain(prohibited);
      expect(String(error)).not.toContain(prohibited);
    }
  });
});
