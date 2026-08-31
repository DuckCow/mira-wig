import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import type { EximbayReadyHandoffV1 } from "@/lib/payment/eximbay/sdk-handoff-contract";
import { parseSyntheticSaleRuntimeConfiguration } from "../contract";
import { createSyntheticSaleHttpHandler, handleNodeHttpRequest } from "../http";
import { startFailureEvidence, type SyntheticSaleRunOwner } from "../run";

const CAPABILITY = "a".repeat(64);
const ORIGIN = "https://mira-p3e-sbx-synthetic-sale-925882331349.asia-northeast3.run.app";
const HANDOFF: EximbayReadyHandoffV1 = Object.freeze({
  kind: "EXIMBAY_READY_HANDOFF_V1",
  paymentId: "payment",
  mode: "SANDBOX",
  sdkGeneration: "v2",
  payload: Object.freeze({
    fgkey: "fixture",
    payment: Object.freeze({
      transaction_type: "PAYMENT",
      order_id: "order",
      currency: "USD",
      amount: "1.00",
      lang: "EN",
      payment_method: "P000",
    }),
    merchant: Object.freeze({ mid: "1849705C64" }),
    buyer: Object.freeze({ name: "Mira Eximbay Canary", email: "fixture@example.test" }),
    url: Object.freeze({ return_url: `${ORIGIN}/checkout/return/session`, status_url: `${ORIGIN}/api/payments/eximbay/status` }),
  }),
});

describe("minimal synthetic SALE HTTP surface", () => {
  it("rejects project, provider, market, currency, MID, and LIVE drift", () => {
    const exact = runtimeEnvironment();
    for (const [name, value] of [
      ["MIRA_SYNTHETIC_SALE_PROJECT_ID", "other-project"],
      ["MIRA_SYNTHETIC_SALE_PROVIDER", "TOSS"],
      ["MIRA_SYNTHETIC_SALE_MARKET", "KR"],
      ["MIRA_SYNTHETIC_SALE_CURRENCY", "KRW"],
      ["EXIMBAY_SANDBOX_MID", "other-mid"],
      ["PAYMENT_MODE", "LIVE"],
      ["EXIMBAY_LIVE_API_KEY", "forbidden"],
    ] as const) {
      expect(parseSyntheticSaleRuntimeConfiguration({ ...exact, [name]: value })).toBeNull();
    }
    expect(parseSyntheticSaleRuntimeConfiguration({
      ...exact,
      MIRA_SYNTHETIC_SALE_PUBLIC_ORIGIN:
        "https://mira-p3e-sbx-synthetic-sale-other.asia-northeast3.run.app",
    })).toBeNull();
  });

  it("adapts a real bodyless Node POST while preserving nonempty rejection", async () => {
    const { handler, start } = fixture();
    const server = createServer((request, responseStream) => {
      void handleNodeHttpRequest(request, responseStream, handler, ORIGIN);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address unavailable");
    const startUrl = `http://127.0.0.1:${address.port}/synthetic-sale/${CAPABILITY}/start`;
    try {
      const nonempty = await fetch(startUrl, { method: "POST", body: "{}" });
      expect(nonempty.status).toBe(400);
      expect(start).not.toHaveBeenCalled();
      const bodyless = await fetch(startUrl, { method: "POST" });
      expect(bodyless.status).toBe(200);
      expect(await bodyless.json()).toEqual(HANDOFF);
      expect(start).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (
        error ? reject(error) : resolve()
      )));
    }
  });

  it("fails closed outside the exact capability routes", async () => {
    const { handler } = fixture();
    for (const path of ["/", "/synthetic-sale/wrong", "/admin", "/api/users"]) {
      expect((await handler(new Request(`${ORIGIN}${path}`))).status).toBe(404);
    }
    expect((await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}?x=1`))).status).toBe(400);
  });

  it("admits one bodyless start and exposes read-only status/return", async () => {
    const { handler, start, status } = fixture();
    const page = await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}`));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain(`data-start-url="/synthetic-sale/${CAPABILITY}/start"`);

    const invalid = await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }));
    expect(invalid.status).toBe(400);
    expect(start).not.toHaveBeenCalled();

    const first = await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}/start`, { method: "POST" }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual(HANDOFF);
    const second = await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}/start`, { method: "POST" }));
    expect(second.status).toBe(409);
    expect(start).toHaveBeenCalledTimes(2);

    expect((await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}/status`))).status).toBe(200);
    expect((await handler(new Request(`${ORIGIN}/checkout/return/session`))).status).toBe(200);
    expect(status).toHaveBeenCalled();
  });

  it("serves only the fixed browser closure with sandbox-only CSP", async () => {
    const { handler } = fixture();
    const asset = await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}/client.js`));
    expect(await asset.text()).toBe("compiled-browser-owner");
    const page = await handler(new Request(`${ORIGIN}/synthetic-sale/${CAPABILITY}`));
    expect(page.headers.get("Content-Security-Policy")).toContain("https://api-test.eximbay.com");
    expect(page.headers.get("Content-Security-Policy")).not.toContain("https://api.eximbay.com");
  });

  it("projects arbitrary start failures into the exact safe evidence shape", () => {
    const raw = Object.assign(new Error("database-url=forbidden secret@example.test"), {
      code: "P2002",
      meta: { target: "private-customer-field" },
    });
    const evidence = startFailureEvidence("b".repeat(32), "FIXTURE_MATERIALIZATION", raw);

    expect(evidence).toEqual({
      ok: false,
      code: "SYNTHETIC_SALE_START_FAILURE",
      runId: "b".repeat(32),
      stage: "FIXTURE_MATERIALIZATION",
      failureCode: "SYNTHETIC_SALE_UNCLASSIFIED_FAILURE",
    });
    expect(Object.keys(evidence).sort()).toEqual([
      "code", "failureCode", "ok", "runId", "stage",
    ]);
    const serialized = JSON.stringify(evidence);
    for (const forbidden of ["database-url", "secret@example.test", "P2002", "private-customer-field"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

function fixture() {
  const configuration = parseSyntheticSaleRuntimeConfiguration(runtimeEnvironment());
  if (!configuration) throw new Error("configuration rejected");
  let invocation = 0;
  const start = vi.fn(() => {
    invocation += 1;
    return invocation === 1 ? Promise.resolve(HANDOFF) : Promise.reject(new Error("already"));
  });
  const status = vi.fn(() => Promise.resolve(Object.freeze({ state: "WAITING" as const, sessionId: "session" })));
  const run: SyntheticSaleRunOwner = Object.freeze({
    capability: CAPABILITY,
    runIdentity: "b".repeat(32),
    start,
    status,
  });
  return {
    handler: createSyntheticSaleHttpHandler(db, run, configuration, { browserAsset: "compiled-browser-owner" }),
    start,
    status,
  };
}

function runtimeEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    MIRA_SYNTHETIC_SALE_RUN_CAPABILITY: CAPABILITY,
    MIRA_SYNTHETIC_SALE_PUBLIC_ORIGIN: ORIGIN,
    MIRA_SYNTHETIC_SALE_PROJECT_ID: "mira-refund-sandbox-0001",
    MIRA_SYNTHETIC_SALE_PROVIDER: "EXIMBAY",
    MIRA_SYNTHETIC_SALE_MARKET: "US",
    MIRA_SYNTHETIC_SALE_CURRENCY: "USD",
    PAYMENT_MODE: "SANDBOX",
    EXIMBAY_CHECKOUT_SANDBOX_ENABLED: "ENABLED",
    EXIMBAY_SANDBOX_API_KEY: "unit-key",
    EXIMBAY_SANDBOX_MID: "1849705C64",
  });
}
