import { CustomerRefundIntakeReasonCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  normalizeSubmitCustomerRefundIntakeInput,
  normalizeWithdrawCustomerRefundIntakeInput,
  type SubmitCustomerRefundIntakeInput,
  type SubmitCustomerRefundIntakeFailureCode,
  type WithdrawCustomerRefundIntakeInput,
} from "../customer-intake-contract";

const NOW = new Date("2026-07-14T10:00:00.123Z");
const INVALID_SUBMIT_INPUTS: Array<{
  field: keyof SubmitCustomerRefundIntakeInput;
  value: unknown;
  code: SubmitCustomerRefundIntakeFailureCode;
}> = [
  { field: "orderId", value: "", code: "INVALID_ORDER_ID" },
  { field: "orderId", value: " \t\n", code: "INVALID_ORDER_ID" },
  { field: "orderId", value: 42, code: "INVALID_ORDER_ID" },
  { field: "customerUserId", value: "", code: "INVALID_CUSTOMER_USER_ID" },
  { field: "customerUserId", value: " \t\n", code: "INVALID_CUSTOMER_USER_ID" },
  { field: "customerUserId", value: [], code: "INVALID_CUSTOMER_USER_ID" },
  { field: "reasonCode", value: "UNRECOGNIZED", code: "INVALID_REASON_CODE" },
  { field: "reasonDetail", value: 42, code: "INVALID_REASON_DETAIL_TYPE" },
  { field: "now", value: new Date(Number.NaN), code: "INVALID_SUBMITTED_AT" },
  { field: "now", value: "2026-07-14", code: "INVALID_SUBMITTED_AT" },
];

describe("customer refund intake contract", () => {
  describe("identifiers, reason code, and time", () => {
    it.each(INVALID_SUBMIT_INPUTS)("rejects invalid runtime input with $code", ({ field, value, code }) => {
      const input = submitInput();
      Reflect.set(input, field, value);
      expect(normalizeSubmitCustomerRefundIntakeInput(input)).toMatchObject({ ok: false, code });
    });

    it("trims identifiers and clones the operation timestamp", () => {
      const now = new Date(NOW);
      const result = normalizeSubmitCustomerRefundIntakeInput(submitInput({
        orderId: "  order-1\n",
        customerUserId: "\tcustomer-1  ",
        now,
      }));

      expect(result).toMatchObject({
        ok: true,
        input: { orderId: "order-1", customerUserId: "customer-1" },
      });
      if (!result.ok) throw new Error("Expected normalized submit input.");
      expect(result.input.operationAt).toEqual(NOW);
      expect(result.input.operationAt).not.toBe(now);
      now.setUTCFullYear(2030);
      expect(result.input.operationAt).toEqual(NOW);
    });

    it("validates and clones withdrawal input independently", () => {
      const now = new Date(NOW);
      const normalized = normalizeWithdrawCustomerRefundIntakeInput({
        orderId: " order-1 ",
        customerUserId: " customer-1 ",
        now,
      });
      expect(normalized).toMatchObject({
        ok: true,
        input: { orderId: "order-1", customerUserId: "customer-1" },
      });
      if (!normalized.ok) throw new Error("Expected normalized withdraw input.");
      expect(normalized.input.operationAt).toEqual(NOW);
      expect(normalized.input.operationAt).not.toBe(now);

      expect(normalizeWithdrawCustomerRefundIntakeInput(withdrawInputWithRuntimeValue("orderId", 7)))
        .toMatchObject({ ok: false, code: "INVALID_ORDER_ID" });
      expect(normalizeWithdrawCustomerRefundIntakeInput(withdrawInputWithRuntimeValue("customerUserId", null)))
        .toMatchObject({ ok: false, code: "INVALID_CUSTOMER_USER_ID" });
      expect(normalizeWithdrawCustomerRefundIntakeInput({
        orderId: "order-1",
        customerUserId: "customer-1",
        now: new Date(Number.NaN),
      })).toMatchObject({ ok: false, code: "INVALID_WITHDRAWN_AT" });
    });
  });

  describe("line endings and ECMAScript trim", () => {
    it("normalizes CRLF and lone CR while preserving internal LF", () => {
      expectNormalizedDetail("first\r\nsecond\rthird\nfourth", "first\nsecond\nthird\nfourth");
    });

    it.each([
      ["SPACE", " "],
      ["TAB", "\t"],
      ["VT", "\v"],
      ["FF", "\f"],
      ["LF", "\n"],
      ["CR", "\r"],
      ["NBSP", "\u00A0"],
      ["LINE SEPARATOR", "\u2028"],
      ["PARAGRAPH SEPARATOR", "\u2029"],
      ["BOM", "\uFEFF"],
      ["EM SPACE", "\u2003"],
    ])("trims leading and trailing %s", (_label, edge) => {
      expectNormalizedDetail(`${edge}stored${edge}`, "stored");
    });

    it.each(["", " \t\v\f\n\r\u00A0\u2028\u2029\uFEFF\u2003 "])(
      "normalizes blank edge-trimmable input to null",
      (value) => expectNormalizedDetail(value, null),
    );

    it("does not trim edge NEL or Mongolian vowel separator", () => {
      expectDetailFailure("\u0085stored", "REASON_DETAIL_CONTROL_CHARACTER");
      expectDetailFailure("\u180Estored", "REASON_DETAIL_FORMAT_CHARACTER");
    });

    it("rejects interior edge-trimmable controls and format characters", () => {
      expectDetailFailure("left\tright", "REASON_DETAIL_CONTROL_CHARACTER");
      expectDetailFailure("left\uFEFFright", "REASON_DETAIL_FORMAT_CHARACTER");
    });
  });

  describe("control-character policy", () => {
    it("permits LF and rejects every representative non-LF Cc", () => {
      expectNormalizedDetail("left\nright", "left\nright");
      for (const value of ["left\0right", "left\tright", "left\u007Fright", "left\u0085right", "left\u009Fright"]) {
        expectDetailFailure(value, "REASON_DETAIL_CONTROL_CHARACTER");
      }
    });
  });

  describe("format-character policy", () => {
    it("permits ZWNJ, ZWJ, emoji ZWJ sequences, and variation selectors", () => {
      expectNormalizedDetail("می\u200Cخواهم", "می\u200Cخواهم");
      expectNormalizedDetail("क्\u200Dष", "क्\u200Dष");
      expectNormalizedDetail("👩\u200D🔬", "👩\u200D🔬");
      expectNormalizedDetail("❤️", "❤️");
    });

    it.each([
      ["soft hyphen", "\u00AD"],
      ["Arabic letter mark", "\u061C"],
      ["Mongolian vowel separator", "\u180E"],
      ["zero-width space", "\u200B"],
      ["left-to-right mark", "\u200E"],
      ["right-to-left mark", "\u200F"],
      ["bidi embedding", "\u202A"],
      ["bidi override", "\u202E"],
      ["word joiner", "\u2060"],
      ["bidi isolate", "\u2066"],
      ["interlinear annotation", "\uFFF9"],
      ["Unicode tag", "\u{E0020}"],
    ])("rejects %s", (_label, character) => {
      expectDetailFailure(`left${character}right`, "REASON_DETAIL_FORMAT_CHARACTER");
    });
  });

  describe("code-point length and error precedence", () => {
    it("accepts 500 and rejects 501 BMP and astral code points without truncation", () => {
      expectNormalizedDetail("a".repeat(500), "a".repeat(500));
      expectDetailFailure("a".repeat(501), "REASON_DETAIL_TOO_LONG");
      expectNormalizedDetail("😀".repeat(500), "😀".repeat(500));
      expectDetailFailure("😀".repeat(501), "REASON_DETAIL_TOO_LONG");
    });

    it("counts ZWJ and variation selectors as code points", () => {
      expectNormalizedDetail(`${"a".repeat(498)}\u200D️`, `${"a".repeat(498)}\u200D️`);
      expectDetailFailure(`${"a".repeat(499)}\u200D️`, "REASON_DETAIL_TOO_LONG");
    });

    it("accepts a 501-code-point input reduced to 500 by edge trim", () => {
      expectNormalizedDetail(` ${"a".repeat(500)}`, "a".repeat(500));
    });

    it("applies control, then format, then length error precedence", () => {
      expectDetailFailure(`x\t\u200B${"a".repeat(501)}`, "REASON_DETAIL_CONTROL_CHARACTER");
      expectDetailFailure(`x\u200B${"a".repeat(501)}`, "REASON_DETAIL_FORMAT_CHARACTER");
    });
  });
});

function submitInput(
  override: Partial<SubmitCustomerRefundIntakeInput> = {},
): SubmitCustomerRefundIntakeInput {
  return {
    orderId: "order-1",
    customerUserId: "customer-1",
    reasonCode: CustomerRefundIntakeReasonCode.CHANGE_OF_MIND,
    reasonDetail: null,
    now: new Date(NOW),
    ...override,
  };
}

function withdrawInputWithRuntimeValue(
  field: keyof WithdrawCustomerRefundIntakeInput,
  value: unknown,
): WithdrawCustomerRefundIntakeInput {
  const input: WithdrawCustomerRefundIntakeInput = {
    orderId: "order-1",
    customerUserId: "customer-1",
    now: new Date(NOW),
  };
  Reflect.set(input, field, value);
  return input;
}

function expectNormalizedDetail(value: string | null | undefined, expected: string | null): void {
  const result = normalizeSubmitCustomerRefundIntakeInput(submitInput({ reasonDetail: value }));
  expect(result).toMatchObject({ ok: true, input: { reasonDetail: expected } });
}

function expectDetailFailure(value: string, code: SubmitCustomerRefundIntakeFailureCode): void {
  const result = normalizeSubmitCustomerRefundIntakeInput(submitInput({ reasonDetail: value }));
  expect(result).toMatchObject({ ok: false, code });
}
