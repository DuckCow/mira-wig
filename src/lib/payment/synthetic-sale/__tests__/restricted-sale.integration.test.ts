import { randomBytes } from "node:crypto";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PrismaClient,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";

const browserSdk = vi.hoisted(() => {
  const requestPay = vi.fn<(payload: unknown) => unknown>();
  const load = vi.fn<(
    mode: "SANDBOX" | "LIVE",
  ) => Promise<(payload: unknown) => unknown>>();
  return { requestPay, load };
});

vi.mock("@/lib/payment/eximbay/sdk-loader", () => ({
  loadEximbaySdkV2: browserSdk.load,
}));
import {
  applySyntheticSaleRoleGrants,
  bootstrapEximbayP3eDatabaseRoles,
  defaultEximbayP3eDatabaseBootstrapDependencies,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  materializeSyntheticSaleMarketPrecondition,
  restoreCanaryRefundRoleGrants,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";
import { handleEximbayBf4StatusRoute } from "@/lib/payment/eximbay/bf4-status-route";
import type { EximbayBf4Fetch } from "@/lib/payment/eximbay/bf4-contact";
import { orderPaidEmailDedupKey } from "@/lib/payment/email/topics";
import { createEximbayRequestPayController } from "@/lib/payment/eximbay/sdk-invocation";
import { parseSyntheticSaleRuntimeConfiguration } from "../contract";
import { createSyntheticSaleHttpHandler } from "../http";
import { createSyntheticSaleRunOwner } from "../run";

const ROLE_PASSWORD = "synthetic_sale_restricted_test_only";
const API_KEY = "synthetic_sale_provider_fixture_key";
const MID = "1849705C64";
let databaseUrl: string;

const bootstrapInput = Object.freeze({
  admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  targetDatabaseName: "wig_platform_test" as const,
});

beforeAll(() => {
  databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

describe.sequential("temporary synthetic SALE authority", () => {
  it("records a safe pre-provider failure when the migration-only database has no US Market", async () => {
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query("SELECT pg_advisory_lock(682326912)");
    const capability = randomBytes(32).toString("hex");
    const configuration = parseSyntheticSaleRuntimeConfiguration({
      MIRA_SYNTHETIC_SALE_RUN_CAPABILITY: capability,
      MIRA_SYNTHETIC_SALE_PUBLIC_ORIGIN:
        "https://mira-p3e-sbx-synthetic-sale-925882331349.asia-northeast3.run.app",
      MIRA_SYNTHETIC_SALE_PROJECT_ID: "mira-refund-sandbox-0001",
      MIRA_SYNTHETIC_SALE_PROVIDER: "EXIMBAY",
      MIRA_SYNTHETIC_SALE_MARKET: "US",
      MIRA_SYNTHETIC_SALE_CURRENCY: "USD",
      PAYMENT_MODE: "SANDBOX",
      EXIMBAY_CHECKOUT_SANDBOX_ENABLED: "ENABLED",
      EXIMBAY_SANDBOX_API_KEY: API_KEY,
      EXIMBAY_SANDBOX_MID: MID,
    });
    if (!configuration) throw new Error("test configuration rejected");
    const ready = vi.fn(() => Promise.reject(new Error("provider must remain uncontacted")));
    const evidence: object[] = [];
    let restricted: PrismaClient | null = null;
    try {
      await admin.query(`DELETE FROM "Market" WHERE code = 'US'`);
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, lifecycleDependencies());
      await bootstrapEximbayP3eDatabaseRoles(admin, bootstrapInput);
      await admin.query(`ALTER ROLE mira_refund_canary PASSWORD '${ROLE_PASSWORD}'`);
      await applySyntheticSaleRoleGrants(admin, bootstrapInput, lifecycleDependencies());

      restricted = restrictedClient(databaseUrl);
      const run = createSyntheticSaleRunOwner(restricted, configuration, ready, (event) => {
        evidence.push(event);
      });
      const handler = createSyntheticSaleHttpHandler(restricted, run, configuration, {
        browserAsset: "compiled-browser-owner",
      });
      const startUrl = `${configuration.publicOrigin}/synthetic-sale/${capability}/start`;
      const first = await handler(new Request(startUrl, { method: "POST" }));
      expect(first.status).toBe(409);
      await expect(first.json()).resolves.toEqual({ ok: false, state: "WAITING" });
      const duplicate = await handler(new Request(startUrl, { method: "POST" }));
      expect(duplicate.status).toBe(409);
      expect(ready).not.toHaveBeenCalled();
      await expect(run.status()).resolves.toEqual({ state: "WAITING" });
      const sessions = await admin.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "CheckoutSession" WHERE "userId" = $1`,
        [`exsale_user_${run.runIdentity}`],
      );
      expect(sessions.rows).toEqual([{ count: "0" }]);
      expect(evidence).toEqual([
        {
          ok: false,
          code: "SYNTHETIC_SALE_START_FAILURE",
          runId: run.runIdentity,
          stage: "FIXTURE_MATERIALIZATION",
          failureCode: "SYNTHETIC_SALE_MARKET_INVALID",
        },
        {
          ok: false,
          code: "SYNTHETIC_SALE_START_FAILURE",
          runId: run.runIdentity,
          stage: "START_GUARD",
          failureCode: "SYNTHETIC_SALE_ALREADY_STARTED",
        },
      ]);
      const serialized = JSON.stringify(evidence);
      for (const forbidden of [capability, API_KEY, "@example.test", "provider must remain uncontacted"]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      if (restricted) await restricted.$disconnect().catch(() => undefined);
      await cleanupRun(admin, capability).catch(() => undefined);
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, lifecycleDependencies()).catch(() => undefined);
      await admin.query("ALTER ROLE mira_refund_canary PASSWORD NULL").catch(() => undefined);
      await admin.query("SELECT pg_advisory_unlock(682326912)").catch(() => undefined);
      await admin.end();
    }
  });

  it("creates, no-ops, and rejects conflict through the bootstrap Market owner", async () => {
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query("SELECT pg_advisory_lock(682326912)");
    try {
      await admin.query(`DELETE FROM "Market" WHERE code = 'US'`);
      const created = await materializeSyntheticSaleMarketPrecondition(
        admin,
        bootstrapInput,
        marketPreconditionDependencies(),
      );
      expect(created).toMatchObject({
        code: "SYNTHETIC_SALE_MARKET_PRECONDITION_COMPLETE",
        disposition: "CREATED",
        market: exactUsMarketEvidence(),
        postconditionRowCount: 1,
      });
      const beforeExact = await readUsMarket(admin);

      const exact = await materializeSyntheticSaleMarketPrecondition(
        admin,
        bootstrapInput,
        marketPreconditionDependencies(),
      );
      expect(exact).toMatchObject({ disposition: "ALREADY_EXACT" });
      await expect(readUsMarket(admin)).resolves.toEqual(beforeExact);

      await admin.query(`UPDATE "Market" SET currency = 'EUR' WHERE code = 'US'`);
      const conflicting = await readUsMarket(admin);
      await expect(materializeSyntheticSaleMarketPrecondition(
        admin,
        bootstrapInput,
        marketPreconditionDependencies(),
      )).rejects.toMatchObject({ code: "SYNTHETIC_SALE_MARKET_PRECONDITION_CONFLICT" });
      await expect(readUsMarket(admin)).resolves.toEqual(conflicting);
    } finally {
      await admin.query(`DELETE FROM "Market" WHERE code = 'US'`).catch(() => undefined);
      await admin.query("SELECT pg_advisory_unlock(682326912)").catch(() => undefined);
      await admin.end();
    }
  });

  it("runs READY and authoritative BF4 completion only inside the temporary ACL window", async () => {
    const admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query("SELECT pg_advisory_lock(682326912)");
    browserSdk.requestPay.mockReset();
    browserSdk.load.mockReset();
    browserSdk.load.mockResolvedValue(browserSdk.requestPay);
    const capability = randomBytes(32).toString("hex");
    const configuration = parseSyntheticSaleRuntimeConfiguration({
      MIRA_SYNTHETIC_SALE_RUN_CAPABILITY: capability,
      MIRA_SYNTHETIC_SALE_PUBLIC_ORIGIN:
        "https://mira-p3e-sbx-synthetic-sale-925882331349.asia-northeast3.run.app",
      MIRA_SYNTHETIC_SALE_PROJECT_ID: "mira-refund-sandbox-0001",
      MIRA_SYNTHETIC_SALE_PROVIDER: "EXIMBAY",
      MIRA_SYNTHETIC_SALE_MARKET: "US",
      MIRA_SYNTHETIC_SALE_CURRENCY: "USD",
      PAYMENT_MODE: "SANDBOX",
      EXIMBAY_CHECKOUT_SANDBOX_ENABLED: "ENABLED",
      EXIMBAY_SANDBOX_API_KEY: API_KEY,
      EXIMBAY_SANDBOX_MID: MID,
    });
    if (!configuration) throw new Error("test configuration rejected");
    vi.stubEnv("PAYMENT_MODE", "SANDBOX");
    vi.stubEnv("EXIMBAY_CHECKOUT_SANDBOX_ENABLED", "ENABLED");
    vi.stubEnv("EXIMBAY_SANDBOX_API_KEY", API_KEY);
    vi.stubEnv("EXIMBAY_SANDBOX_MID", MID);
    let restricted: PrismaClient | null = null;
    try {
      await materializeSyntheticSaleMarketPrecondition(
        admin,
        bootstrapInput,
        marketPreconditionDependencies(),
      );
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, lifecycleDependencies());
      await bootstrapEximbayP3eDatabaseRoles(admin, bootstrapInput);
      await admin.query(`ALTER ROLE mira_refund_canary PASSWORD '${ROLE_PASSWORD}'`);
      await admin.query(`GRANT SELECT ON TABLE "Market" TO mira_refund_canary`);
      await admin.query(`GRANT UPDATE ("code") ON TABLE "Market" TO mira_refund_canary`);
      await expectLegacyMarketUpdateAuthority(databaseUrl);
      await applySyntheticSaleRoleGrants(admin, bootstrapInput, lifecycleDependencies());
      await expectNegativeBoundaries(databaseUrl);

      restricted = restrictedClient(databaseUrl);
      const ready = vi.fn(() => Promise.resolve(new Response(JSON.stringify({
        rescode: "0000",
        resmsg: "synthetic",
        fgkey: "synthetic-sale-fgkey",
      }), { status: 200, headers: { "Content-Type": "application/json" } })));
      const run = createSyntheticSaleRunOwner(restricted, configuration, ready);
      const handoff = await run.start();
      expect(handoff).toMatchObject({
        kind: "EXIMBAY_READY_HANDOFF_V1",
        mode: "SANDBOX",
        payload: { merchant: { mid: MID }, payment: { amount: "1.00", currency: "USD" } },
      });
      await expect(run.start()).rejects.toThrow("SYNTHETIC_SALE_ALREADY_STARTED");
      expect(ready).toHaveBeenCalledTimes(1);

      const browser = createEximbayRequestPayController(handoff);
      if (!browser.ok) throw new Error("fresh handoff rejected by browser owner");
      const requestPay = browser.controller.invoke();
      expect(browser.controller.invoke()).toBe(requestPay);
      await expect(requestPay).resolves.toEqual({ kind: "BROWSER_HANDOFF_ATTEMPTED" });
      expect(browserSdk.load).toHaveBeenCalledTimes(1);
      expect(browserSdk.load).toHaveBeenCalledWith("SANDBOX");
      expect(browserSdk.requestPay).toHaveBeenCalledTimes(1);
      expect(browserSdk.requestPay).toHaveBeenCalledWith(handoff.payload);

      const transactionId = `synthetic-sale-${run.runIdentity}`;
      const raw = statusRaw(handoff.payload.payment.order_id, transactionId);
      const transport = providerTransport(raw, handoff.payload.payment.order_id, transactionId);
      const bf4 = await handleEximbayBf4StatusRoute(
        restricted,
        new Request(`${configuration.publicOrigin}/api/payments/eximbay/status`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: raw,
        }),
        { ...configuration.providerEnv, EXIMBAY_BF4_STATUS_ROUTE_ENABLED: "ENABLED" },
        transport,
        monotonicClock(),
      );
      expect(bf4.status).toBe(200);
      await expect(bf4.text()).resolves.toBe("rescode=0000&resmsg=Success");
      expect(transport).toHaveBeenCalledTimes(2);
      await expectPositivePostconditions(restricted, run.runIdentity);
      await expect(run.status()).resolves.toMatchObject({ state: "SUCCEEDED" });

      await restricted.$disconnect();
      restricted = null;
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, lifecycleDependencies());
      await expectSalePrivilegeRemoved(databaseUrl);
    } finally {
      if (restricted) await restricted.$disconnect().catch(() => undefined);
      await cleanupRun(admin, capability).catch(() => undefined);
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, lifecycleDependencies()).catch(() => undefined);
      await admin.query("ALTER ROLE mira_refund_canary PASSWORD NULL").catch(() => undefined);
      await admin.query("SELECT pg_advisory_unlock(682326912)").catch(() => undefined);
      await admin.end();
      vi.unstubAllEnvs();
    }
  });
});

function lifecycleDependencies() {
  return {
    ...defaultEximbayP3eDatabaseBootstrapDependencies,
    verifyExactLedger: () => Promise.resolve(),
  };
}

function marketPreconditionDependencies() {
  return { verifyExactLedger: () => Promise.resolve() };
}

function restrictedClient(adminUrl: string): PrismaClient {
  const url = new URL(adminUrl);
  url.username = "mira_refund_canary";
  url.password = ROLE_PASSWORD;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
}

function providerTransport(
  raw: string,
  orderId: string,
  transactionId: string,
) {
  return vi.fn<EximbayBf4Fetch>((input, init) => {
    const url = requestUrl(input);
    if (url.endsWith("/verify")) {
      expect(init?.body).toBe(JSON.stringify({ data: raw }));
      return Promise.resolve(json({ rescode: "0000", resmsg: "verified" }));
    }
    expect(url.endsWith("/retrieve")).toBe(true);
    return Promise.resolve(json({
      rescode: "0000",
      resmsg: "retrieved",
      mid: MID,
      payment: {
        order_id: orderId,
        currency: "USD",
        amount: "1.00",
        transaction_id: transactionId,
        status: "SALE",
        transaction_date: "20260831071600",
      },
    }));
  });
}

function statusRaw(orderId: string, transactionId: string): string {
  return [
    "transaction_type=PAYMENT",
    `mid=${MID}`,
    `order_id=${orderId}`,
    "currency=USD",
    "amount=1.00",
    "rescode=0000",
    "resmsg=Success+exact",
    "fgkey=status-only-not-ready",
    `transaction_id=${transactionId}`,
  ].join("&");
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function monotonicClock(): () => Date {
  let offset = 0;
  return () => new Date(Date.UTC(2026, 7, 31, 7, 16, offset += 1));
}

async function expectPositivePostconditions(client: PrismaClient, runIdentity: string): Promise<void> {
  const userId = `exsale_user_${runIdentity}`;
  const session = await client.checkoutSession.findFirstOrThrow({
    where: { userId },
    include: { payments: true, order: { include: { items: true, shipping: true } } },
  });
  expect(session).toMatchObject({ status: CheckoutSessionStatus.COMPLETED, communicationLocale: "en" });
  expect(session.payments).toHaveLength(1);
  expect(session.payments[0]).toMatchObject({
    status: PaymentAttemptStatus.SUCCEEDED,
    attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
    adapterExecutionKind: "EXTERNAL",
  });
  expect(session.payments[0]?.providerOrderId).toBeTruthy();
  expect(session.payments[0]?.providerPaymentKey).toBeTruthy();
  expect(session.payments[0]?.financialSucceededAt).toBeInstanceOf(Date);
  expect(session.order).toMatchObject({ status: OrderStatus.PAID });
  expect(session.order?.items).toHaveLength(1);
  expect(session.order?.shipping).toBeTruthy();
  await expect(client.wigVariant.findUniqueOrThrow({
    where: { id: `exsale_variant_${runIdentity}` },
    select: { stock: true },
  })).resolves.toEqual({ stock: 0 });
  await expect(client.cartItem.count({ where: { userId } })).resolves.toBe(0);
}

async function expectNegativeBoundaries(adminUrl: string): Promise<void> {
  const client = restrictedPgClient(adminUrl);
  await client.connect();
  try {
    const before = await client.query(`
      SELECT code, currency, "shippableCountries", "defaultLocale", "isActive",
        "taxConfig", "paymentConfig"
      FROM "Market" WHERE code = 'US'
    `);
    expect(before.rows).toEqual([{
      code: "US",
      currency: "USD",
      shippableCountries: ["US"],
      defaultLocale: "en",
      isActive: true,
      taxConfig: null,
      paymentConfig: null,
    }]);
    await expect(client.query(`UPDATE "Market" SET code = 'UX' WHERE code = 'US'`))
      .rejects.toBeDefined();
    await expect(client.query(`UPDATE "Market" SET code = code WHERE code = 'US'`))
      .rejects.toBeDefined();
    await expect(client.query(`
      INSERT INTO "Market" (code, currency, "shippableCountries", "defaultLocale", "isActive")
      VALUES ('ZZ', 'USD', ARRAY['US']::text[], 'en', true)
    `)).rejects.toBeDefined();
    await expect(client.query("CREATE TABLE synthetic_sale_forbidden(id int)")).rejects.toBeDefined();
    await expect(client.query('TRUNCATE TABLE "User"')).rejects.toBeDefined();
    await expect(client.query(`DELETE FROM "Market" WHERE code = 'US'`)).rejects.toBeDefined();
    await expect(client.query("ALTER ROLE mira_refund_canary CREATEDB")).rejects.toBeDefined();
    const after = await client.query(`
      SELECT code, currency, "shippableCountries", "defaultLocale", "isActive",
        "taxConfig", "paymentConfig"
      FROM "Market" WHERE code = 'US'
    `);
    expect(after.rows).toEqual(before.rows);
  } finally {
    await client.end();
  }
}

async function expectLegacyMarketUpdateAuthority(adminUrl: string): Promise<void> {
  const client = restrictedPgClient(adminUrl);
  await client.connect();
  try {
    await expect(client.query(`UPDATE "Market" SET code = code WHERE code = 'US'`))
      .resolves.toMatchObject({ rowCount: 1 });
  } finally {
    await client.end();
  }
}

async function expectSalePrivilegeRemoved(adminUrl: string): Promise<void> {
  const client = restrictedPgClient(adminUrl);
  await client.connect();
  try {
    await expect(client.query(`INSERT INTO "User" (id,email,role,"createdAt","updatedAt")
      VALUES ('forbidden-sale-user','forbidden-sale-user@example.test','CUSTOMER',now(),now())`))
      .rejects.toBeDefined();
  } finally {
    await client.end();
  }
}

function restrictedPgClient(adminUrl: string): Client {
  const url = new URL(adminUrl);
  url.username = "mira_refund_canary";
  url.password = ROLE_PASSWORD;
  return new Client({ connectionString: url.toString() });
}

function exactUsMarketEvidence() {
  return {
    code: "US",
    currency: "USD",
    active: true,
    defaultLocale: "en",
    shippableCountries: ["US"],
    taxConfigNull: true,
    paymentConfigNull: true,
  };
}

async function readUsMarket(admin: Client) {
  const result = await admin.query<{
    code: string;
    currency: string;
    shippableCountries: string[];
    defaultLocale: string;
    isActive: boolean;
    taxConfig: unknown;
    paymentConfig: unknown;
    xmin: string;
  }>(`
    SELECT code, currency, "shippableCountries", "defaultLocale", "isActive",
      "taxConfig", "paymentConfig", xmin::text AS xmin
    FROM "Market" WHERE code = 'US'
  `);
  return result.rows;
}

async function cleanupRun(admin: Client, capability: string): Promise<void> {
  const { syntheticSaleRunIdentity } = await import("../contract");
  const runIdentity = syntheticSaleRunIdentity(capability);
  const userId = `exsale_user_${runIdentity}`;
  const sessions = await admin.query<{ id: string }>('SELECT id FROM "CheckoutSession" WHERE "userId"=$1', [userId]);
  const sessionIds = sessions.rows.map((row) => row.id);
  await admin.query('DELETE FROM "PaymentEvent" WHERE "checkoutSessionId"=ANY($1::text[])', [sessionIds]);
  const orders = await admin.query<{ id: string }>('SELECT id FROM "Order" WHERE "checkoutSessionId"=ANY($1::text[])', [sessionIds]);
  const orderIds = orders.rows.map((row) => row.id);
  await admin.query('DELETE FROM "PaymentOutbox" WHERE "dedupKey"=ANY($1::text[])', [
    orderIds.map(orderPaidEmailDedupKey),
  ]);
  await admin.query('DELETE FROM "ManufacturingRequest" WHERE "orderItemId" IN (SELECT id FROM "OrderItem" WHERE "orderId"=ANY($1::text[]))', [orderIds]);
  await admin.query('DELETE FROM "OrderItem" WHERE "orderId"=ANY($1::text[])', [orderIds]);
  await admin.query('DELETE FROM "OrderShipping" WHERE "orderId"=ANY($1::text[])', [orderIds]);
  await admin.query('DELETE FROM "Order" WHERE id=ANY($1::text[])', [orderIds]);
  await admin.query('DELETE FROM "Payment" WHERE "checkoutSessionId"=ANY($1::text[])', [sessionIds]);
  await admin.query('DELETE FROM "CheckoutSessionLine" WHERE "sessionId"=ANY($1::text[])', [sessionIds]);
  await admin.query('DELETE FROM "CheckoutSessionShipping" WHERE "sessionId"=ANY($1::text[])', [sessionIds]);
  await admin.query('DELETE FROM "CheckoutSession" WHERE id=ANY($1::text[])', [sessionIds]);
  await admin.query('DELETE FROM "CartItem" WHERE "userId"=$1', [userId]);
  await admin.query('DELETE FROM "VariantMarketPrice" WHERE "variantId"=$1', [`exsale_variant_${runIdentity}`]);
  await admin.query('DELETE FROM "WigStyleMarket" WHERE "wigStyleId"=$1', [`exsale_style_${runIdentity}`]);
  await admin.query('DELETE FROM "WigVariant" WHERE id=$1', [`exsale_variant_${runIdentity}`]);
  await admin.query('DELETE FROM "WigStyle" WHERE id=$1', [`exsale_style_${runIdentity}`]);
  await admin.query('DELETE FROM "User" WHERE id=$1', [userId]);
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL is required");
  const url = new URL(value);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("local DB required");
  if (url.pathname !== "/wig_platform_test") throw new Error("wig_platform_test required");
  return value;
}
