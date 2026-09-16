import { describe, expect, it } from "vitest";
import { diagnosticResult, isRetrieveDiagnosticResult } from "../retrieve-diagnostic-result";
import { emptyRetrieveShapeDiagnostic } from "../providers/eximbay/retrieve-shape-diagnostic";

describe("frozen retrieve diagnostic evidence (offline only)", () => {
  it("accepts the frozen no-contact failure receipt", () => {
    expect(isRetrieveDiagnosticResult(diagnosticResult("PAYMENT_NOT_FOUND"))).toBe(true);
  });

  it("accepts a sanitized admitted observation and its disconnect-failure variant", () => {
    const shape = emptyRetrieveShapeDiagnostic();
    shape.jsonParseSuccess = true;
    shape.root = { type: "object", fields: [], extraKeyCount: 0 };
    shape.payment = { type: "object", fields: [], extraKeyCount: 0 };
    const result = { ...diagnosticResult("DIAGNOSTIC_COMPLETE"),
      inquiryCount: 1, parserResult: "ADMITTED", shape };
    expect(isRetrieveDiagnosticResult(result)).toBe(true);
    expect(isRetrieveDiagnosticResult({ ...result, ok: false, databaseDisconnected: false })).toBe(true);
    expect(isRetrieveDiagnosticResult({ ...result, inquiryCount: 0 })).toBe(false);
    expect(isRetrieveDiagnosticResult({ ...result, shape: { ...shape, raw: "private" } })).toBe(false);
  });

  it.each([
    { raw: "private" }, { cancellationCount: 1 }, { reconciliationCount: 1 },
    { inquiryCount: 1 }, { terminalClass: "REFUND_SUCCEEDED" }, { ok: true },
  ])("rejects expanded or contradictory historical receipts: %j", (override) => {
    expect(isRetrieveDiagnosticResult({ ...diagnosticResult("PAYMENT_NOT_FOUND"), ...override })).toBe(false);
  });
});
