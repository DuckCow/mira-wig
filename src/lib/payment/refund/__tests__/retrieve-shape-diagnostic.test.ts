import { describe, expect, it, vi } from "vitest";
import { runEximbayRetrieveShapeDiagnosticOnce, type RetrieveDiagnosticDatabase } from "../run-eximbay-retrieve-shape-diagnostic-once";
import { isRetrieveDiagnosticResult } from "../retrieve-diagnostic-result";
import { diagnosticEnvironment } from "./retrieve-diagnostic-fixture";
const PAYMENT = { id: "payment-1", provider: "EXIMBAY", mode: "SANDBOX", status: "SUCCEEDED",
  amount: 100, currency: "USD", providerOrderId: "order-private", providerPaymentKey: "transaction-private" } as const;
function harness(payment: Awaited<ReturnType<RetrieveDiagnosticDatabase["payment"]["findUnique"]>> = PAYMENT) {
  const findUnique = vi.fn<RetrieveDiagnosticDatabase["payment"]["findUnique"]>().mockResolvedValue(payment);
  const disconnect = vi.fn<() => Promise<void>>().mockResolvedValue();
  const readSecret = vi.fn<() => Promise<string>>().mockResolvedValue("secret-private");
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
    rescode: "0000", resmsg: "message-private", mid: "mid-private", payment: {
      order_id: "order-private", transaction_id: "transaction-private", amount: "1.00", balance: "1.00",
      currency: "USD", status: "SALE", transaction_date: "20260914010203", auth_code: "auth-private",
    }, card_info: { cardno1: "4111", cardno4: "1111" }, other_param: { param1: "metadata-private" },
  }), { headers: { "content-type": "application/json" } }));
  const createDatabase = vi.fn(() => ({ payment: { findUnique }, $disconnect: disconnect }));
  return { findUnique, disconnect, readSecret, fetch, createDatabase };
}
describe("read-only retrieve diagnostic", () => {
  it.each([undefined, "", " ", "payment-1\n", "x/y", "x".repeat(129), "x;DROP", "한글"])("fails closed for selector %j", async (id) => {
    const fake = harness();
    const env = { ...diagnosticEnvironment(), MIRA_EXIMBAY_RETRIEVE_DIAGNOSTIC_PAYMENT_ID: id };
    expect(await runEximbayRetrieveShapeDiagnosticOnce(env, fake)).toMatchObject({ code: "CONFIG_INVALID", inquiryCount: 0 });
    expect(fake.createDatabase).not.toHaveBeenCalled();
    expect(fake.readSecret).not.toHaveBeenCalled();
    expect(fake.fetch).not.toHaveBeenCalled();
  });
  it("rejects a drifted secret binding before creating a database", async () => {
    const fake = harness();
    const env = { ...diagnosticEnvironment(), MIRA_REFUND_EXIMBAY_CANARY_SECRET_VERSION: "2" };
    expect(await runEximbayRetrieveShapeDiagnosticOnce(env, fake)).toMatchObject({ code: "CONFIG_INVALID" });
    expect(fake.createDatabase).not.toHaveBeenCalled();
  });
  it("sanitizes database construction failure without attempting disconnect or secret access", async () => {
    const fake = harness();
    fake.createDatabase.mockImplementationOnce(() => { throw new Error("database-private"); });
    const result = await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake);
    expect(result).toMatchObject({ code: "DATABASE_UNAVAILABLE", inquiryCount: 0 });
    expect(fake.disconnect).not.toHaveBeenCalled();
    expect(fake.readSecret).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("reads exactly the eight selected fields and one authenticated inquiry, then disconnects", async () => {
    const fake = harness();
    const result = await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake);
    expect(result).toMatchObject({ ok: true, code: "DIAGNOSTIC_COMPLETE", parserResult: "ADMITTED",
      inquiryCount: 1, cancellationCount: 0, reconciliationCount: 0, databaseDisconnected: true });
    expect(isRetrieveDiagnosticResult(result)).toBe(true);
    expect(fake.findUnique.mock.calls).toEqual([[{ where: { id: "payment-1" }, select: {
      id: true, provider: true, mode: true, status: true, amount: true, currency: true,
      providerOrderId: true, providerPaymentKey: true,
    } }]]);
    expect(fake.readSecret).toHaveBeenCalledExactlyOnceWith({ resource: "projects/mira-test1/secrets/diagnostic-test", version: "1" });
    expect(fake.fetch).toHaveBeenCalledTimes(1);
    expect(fake.fetch.mock.calls[0][0]).toBe("https://api-test.eximbay.com/v1/payments/retrieve");
    expect(new Headers(fake.fetch.mock.calls[0][1]?.headers).has("Authorization")).toBe(true);
    expect(fake.disconnect).toHaveBeenCalledTimes(1);
    for (const raw of ["order-private", "transaction-private", "secret-private", "mid-private", "message-private", "auth-private", "metadata-private", "4111", "1111", "20260914010203"]) {
      expect(JSON.stringify(result)).not.toContain(raw);
    }
  });
  it("uses integer JPY wire amounts without multiplying by 100", async () => {
    const fake = harness({ ...PAYMENT, currency: "JPY" });
    fake.fetch.mockResolvedValueOnce(new Response(JSON.stringify({
      rescode: "0000", resmsg: "ok", mid: "mid-private", payment: {
        order_id: "order-private", transaction_id: "transaction-private", amount: "100", balance: "100",
        currency: "JPY", status: "SALE", transaction_date: "20260914010203",
      },
    }), { headers: { "content-type": "application/json" } }));
    const result = await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake);
    expect(result.parserResult).toBe("ADMITTED");
    expect(fake.fetch.mock.calls[0][1]?.body).toContain('"amount":"100"');
    expect(fake.fetch).toHaveBeenCalledTimes(1);
    expect(isRetrieveDiagnosticResult({ ...result, shape: { ...result.shape, unexpected: "private" } })).toBe(false);
    expect(isRetrieveDiagnosticResult({ ...result, shape: { ...result.shape, root: {
      type: "object", fields: [{ name: "private", type: "string" }], extraKeyCount: 0,
    } } })).toBe(false);
  });
  it("stops after one missing Payment read", async () => {
    const fake = harness(null);
    expect(await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake)).toMatchObject({ code: "PAYMENT_NOT_FOUND" });
    expect(fake.findUnique).toHaveBeenCalledTimes(1);
    expect(fake.disconnect).toHaveBeenCalledTimes(1);
    expect(fake.readSecret).not.toHaveBeenCalled();
  });
  it.each([
    { provider: "TOSS" }, { mode: "LIVE" }, { status: "AWAITING" }, { id: "wrong" },
    { providerOrderId: null }, { providerPaymentKey: null }, { providerPaymentKey: "x".repeat(513) },
    { currency: "KRW" }, { amount: 0 }, { amount: -1 }, { amount: 1.5 }, { amount: 2_147_483_648 },
  ] satisfies Array<Partial<Parameters<typeof harness>[0]>>)("rejects invalid Payment %j", async (override) => {
    const fake = harness({ ...PAYMENT, ...override });
    expect(await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake)).toMatchObject({ code: "PAYMENT_INVALID" });
    expect(fake.findUnique).toHaveBeenCalledTimes(1);
    expect(fake.readSecret).not.toHaveBeenCalled();
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(fake.disconnect).toHaveBeenCalledTimes(1);
  });
  it("sanitizes database and secret failures and disconnects", async () => {
    const fake = harness();
    fake.findUnique.mockRejectedValueOnce(new Error("database-private"));
    expect(await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake)).toMatchObject({ code: "DATABASE_READ_FAILED" });
    fake.readSecret.mockRejectedValueOnce(new Error("secret-private"));
    expect(await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake)).toMatchObject({ code: "CREDENTIAL_UNAVAILABLE" });
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(fake.disconnect).toHaveBeenCalledTimes(2);
  });
  it("does not retry a failed inquiry or lose its count on disconnect failure", async () => {
    const fake = harness();
    fake.fetch.mockRejectedValueOnce(new Error("transport-private"));
    fake.disconnect.mockRejectedValueOnce(new Error("disconnect-private"));
    const result = await runEximbayRetrieveShapeDiagnosticOnce(diagnosticEnvironment(), fake);
    expect(result).toMatchObject({ ok: false, inquiryCount: 1, parserResult: "TRANSPORT_FAILURE", databaseDisconnected: false });
    expect(fake.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private");
    expect(isRetrieveDiagnosticResult(result)).toBe(true);
  });
});
