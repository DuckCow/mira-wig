import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CheckoutSessionStatus,
  OutboxStatus,
  PaymentAttemptStatus,
  PaymentEventFailureStage,
  PaymentEventSource,
  PaymentEventStatus,
  PaymentMode,
  PaymentProvider,
  ShippingCountry,
  WebhookIngressRejectionStage,
  WigCategory,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { MarketCode } from "@/lib/market/types";
import { OUTBOX_MAX_ATTEMPTS } from "@/lib/payment/outbox";
import { reconcilePaymentCore, type ReconciliationFinding } from "@/lib/payment/reconciliation";

const C2_NOW = new Date("2026-08-03T00:00:00.000Z");
const C2_OLD = new Date("2026-08-02T23:00:00.000Z");
const STALE_MS = 10_000;

interface TestContext {
  userId: string;
  styleIds: string[];
  variantIds: string[];
  sessionIds: string[];
  paymentIds: string[];
  orderIds: string[];
  outboxIds: string[];
  eventIds: string[];
  rejectionIds: string[];
}

interface SessionInput {
  status?: CheckoutSessionStatus;
  totalAmount?: number;
  currency?: string;
}

interface PaymentInput {
  status?: PaymentAttemptStatus;
  amount?: number;
  currency?: string;
  providerRef?: string | null;
  providerConfirmIdempotencyKey?: string | null;
  providerPaymentKey?: string | null;
  mode?: PaymentMode;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: Date;
}

describe("payment reconciliation C2-v0", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = makeContext();
    await ensureMarkets();
    await db.user.create({ data: { id: ctx.userId, email: `${ctx.userId}@example.test` } });
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("classifies recent and stale SUCCEEDED payments without orders without repair", async () => {
    const recentSession = await createSession(ctx);
    const staleSession = await createSession(ctx);
    const recent = await createPayment(ctx, recentSession.id, { updatedAt: C2_NOW });
    const stale = await createPayment(ctx, staleSession.id, { updatedAt: C2_OLD });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    const recentFinding = findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", recent.id);
    const staleFinding = findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", stale.id);
    expect(recentFinding.recommendedAction).toBe("NORMAL_IN_FLIGHT");
    expect(recentFinding.details.paymentMode).toBe(PaymentMode.SANDBOX);
    expect(recentFinding.details.voidPathStatus).toBe("absent");
    expect(staleFinding.recommendedAction).toBe("AUTO_REENTRY_CANDIDATE");
    expect(staleFinding.details.voidPathStatus).toBe("absent");
    await expect(db.order.count({ where: { userId: ctx.userId } })).resolves.toBe(0);
  });

  it("classifies missing-order payments by active and failed void path state", async () => {
    const pending = await paymentWithVoidPath(ctx, OutboxStatus.PENDING, 0);
    const processing = await paymentWithVoidPath(ctx, OutboxStatus.PROCESSING, 1);
    const failed = await paymentWithVoidPath(ctx, OutboxStatus.FAILED, OUTBOX_MAX_ATTEMPTS);

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", pending.payment.id))
      .toMatchObject({ recommendedAction: "VOID_PENDING" });
    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", processing.payment.id))
      .toMatchObject({ recommendedAction: "VOID_PENDING" });
    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", failed.payment.id))
      .toMatchObject({ recommendedAction: "VOID_FAILED_MAX_ATTEMPTS" });
    expect(findingFor(findings, "PG_VOID_MAX_ATTEMPTS", "paymentOutbox", failed.outboxId))
      .toMatchObject({ recommendedAction: "VOID_FAILED_MAX_ATTEMPTS" });
  });

  it("detects order payment status, amount, and session-state inconsistencies", async () => {
    const badStatus = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const badStatusPayment = await createPayment(ctx, badStatus.id, { status: PaymentAttemptStatus.FAILED });
    const badStatusOrder = await createOrder(ctx, badStatus, badStatusPayment);
    const amountSession = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const amountPayment = await createPayment(ctx, amountSession.id, { amount: amountSession.totalAmount + 1 });
    const amountOrder = await createOrder(ctx, amountSession, amountPayment);
    const stateSession = await createSession(ctx, { status: CheckoutSessionStatus.FAILED });
    const statePayment = await createPayment(ctx, stateSession.id);
    const stateOrder = await createOrder(ctx, stateSession, statePayment);

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "ORDER_BAD_PAYMENT_STATUS", "order", badStatusOrder.id))
      .toMatchObject({ recommendedAction: "MANUAL_REVIEW" });
    expect(findingFor(findings, "AMOUNT_CURRENCY_MISMATCH", "order", amountOrder.id))
      .toMatchObject({ recommendedAction: "MANUAL_REVIEW" });
    expect(findingFor(findings, "SESSION_STATE_MISMATCH", "order", stateOrder.id))
      .toMatchObject({ recommendedAction: "MANUAL_REVIEW" });
  });

  it("detects structurally obvious partial local completion anomalies", async () => {
    const emptySession = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const emptyPayment = await createPayment(ctx, emptySession.id);
    const emptyOrder = await createOrder(ctx, emptySession, emptyPayment);
    const mtoSession = await createSession(ctx, { status: CheckoutSessionStatus.COMPLETED });
    const mtoPayment = await createPayment(ctx, mtoSession.id);
    const mtoOrder = await createOrder(ctx, mtoSession, mtoPayment);
    await createMtoOrderItem(ctx, mtoOrder.id);

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(partialReason(findings, emptyOrder.id, "order has no items")).toBeTruthy();
    expect(partialReason(findings, emptyOrder.id, "order missing shipping snapshot")).toBeTruthy();
    expect(partialReason(findings, mtoOrder.id, "MTO order item missing manufacturing request")).toBeTruthy();
  });

  it("classifies pg.void max attempts and structural payload mismatch", async () => {
    const session = await createSession(ctx);
    const payment = await createPayment(ctx, session.id, { providerPaymentKey: `c2_void_${randomUUID()}` });
    const maxOutbox = await createVoidOutbox(ctx, payment, { status: OutboxStatus.FAILED, attempts: OUTBOX_MAX_ATTEMPTS });
    const mismatchOutbox = await createVoidOutbox(ctx, payment, {
      status: OutboxStatus.FAILED,
      attempts: 1,
      providerPaymentKey: `wrong_${randomUUID()}`,
    });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "PG_VOID_MAX_ATTEMPTS", "paymentOutbox", maxOutbox.id))
      .toMatchObject({ recommendedAction: "VOID_FAILED_MAX_ATTEMPTS" });
    expect(findingFor(findings, "PG_VOID_MISMATCH_TERMINAL", "paymentOutbox", mismatchOutbox.id))
      .toMatchObject({ recommendedAction: "VOID_MISMATCH_TERMINAL" });
  });

  it("classifies trusted webhook events and stale retryable states", async () => {
    const parse = await createPaymentEvent(ctx, PaymentEventStatus.FAILED, {
      failureStage: PaymentEventFailureStage.PARSE,
      failureCode: "PARSE.FIELD_MISSING",
    });
    const retryable = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.TRANSIENT_DB_ERROR",
      attemptCount: 1,
      lastAttemptAt: C2_OLD,
    });
    const received = await createPaymentEvent(ctx, PaymentEventStatus.RECEIVED, { receivedAt: C2_OLD });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "TRUSTED_EVENT_PARSE_FAILED", "paymentEvent", parse.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
    expect(findingFor(findings, "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED", "paymentEvent", retryable.id))
      .toMatchObject({ recommendedAction: "WATCH_STALE" });
    expect(findingFor(findings, "STALE_PAYMENT_EVENT_RECEIVED", "paymentEvent", received.id))
      .toMatchObject({ recommendedAction: "WATCH_STALE" });
    expect(findingFor(findings, "STALE_PAYMENT_EVENT_RETRYABLE_FAILED", "paymentEvent", retryable.id))
      .toMatchObject({ recommendedAction: "WATCH_STALE" });
  });

  it("classifies Toss webhook event visibility states with safe provenance details", async () => {
    const ready = await createPaymentEvent(ctx, PaymentEventStatus.IGNORED, {
      lastError: "TOSS_STATUS_READY",
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
    });
    const unknown = await createPaymentEvent(ctx, PaymentEventStatus.IGNORED, { lastError: "TOSS_STATUS_UNKNOWN" });
    const terminal = await createPaymentEvent(ctx, PaymentEventStatus.FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.LEGACY_UNVERIFIED_EVENT",
      lastError: "Legacy event requires manual review",
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
    });
    const binding = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.CREDENTIAL_BINDING_UNAVAILABLE",
      lastError: "Credential binding is unavailable",
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
    });
    const divergence = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.MODE_DIVERGENCE",
      lastError: "Mode divergence deferred",
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
    });
    const generic = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.TRANSIENT_DB_ERROR",
    });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    const readyFinding = findingFor(findings, "TOSS_IGNORED_PROVIDER_STATUS", "paymentEvent", ready.id);
    expect(readyFinding).toMatchObject({ severity: "info", recommendedAction: "ALERT_ONLY" });
    expect(readyFinding.details).toMatchObject({
      provider: PaymentProvider.TOSS,
      status: PaymentEventStatus.IGNORED,
      lastError: "TOSS_STATUS_READY",
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
      transmissionId: ready.transmissionId,
    });
    expect(findingFor(findings, "TOSS_IGNORED_PROVIDER_STATUS", "paymentEvent", unknown.id))
      .toMatchObject({ severity: "warning", recommendedAction: "MANUAL_REVIEW" });
    const terminalFinding = findingFor(findings, "TRUSTED_EVENT_TERMINAL_COMPLETE_FAILED", "paymentEvent", terminal.id);
    expect(terminalFinding).toMatchObject({ severity: "warning", recommendedAction: "MANUAL_REVIEW" });
    expect(terminalFinding.details).toMatchObject({
      failureCode: "COMPLETE.LEGACY_UNVERIFIED_EVENT",
      provider: PaymentProvider.TOSS,
      verifiedMode: PaymentMode.SANDBOX,
      verifiedCredentialBinding: "toss:sandbox:v1",
      lastError: "Legacy event requires manual review",
    });
    expect(findingFor(findings, "WEBHOOK_EVENT_BINDING_UNAVAILABLE", "paymentEvent", binding.id))
      .toMatchObject({ severity: "warning", recommendedAction: "ALERT_ONLY" });
    expect(findingFor(findings, "WEBHOOK_EVENT_MODE_DIVERGENCE", "paymentEvent", divergence.id))
      .toMatchObject({ severity: "warning", recommendedAction: "ALERT_ONLY" });
    expect(hasSourceFinding(findings, "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED", "paymentEvent", binding.id)).toBe(false);
    expect(hasSourceFinding(findings, "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED", "paymentEvent", divergence.id)).toBe(false);
    expect(findingFor(findings, "TRUSTED_EVENT_RETRYABLE_COMPLETE_FAILED", "paymentEvent", generic.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
  });

  it("classifies Toss retryable events beyond the provider redelivery horizon", async () => {
    const horizonMs = 60_000;
    const justUnder = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      receivedAt: new Date(C2_NOW.getTime() - horizonMs + 1),
    });
    const justOver = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      receivedAt: new Date(C2_NOW.getTime() - horizonMs - 1),
    });
    const paypalOver = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      provider: PaymentProvider.PAYPAL,
      receivedAt: new Date(C2_NOW.getTime() - horizonMs - 1),
    });

    const findings = await reconcilePaymentCore(db, { ...reconcileOptions(), tossRedeliveryHorizonMs: horizonMs });

    expect(hasSourceFinding(findings, "PAYMENT_EVENT_BEYOND_REDELIVERY_HORIZON", "paymentEvent", justUnder.id)).toBe(false);
    expect(findingFor(findings, "PAYMENT_EVENT_BEYOND_REDELIVERY_HORIZON", "paymentEvent", justOver.id))
      .toMatchObject({ severity: "warning", recommendedAction: "MANUAL_REVIEW" });
    expect(hasSourceFinding(findings, "PAYMENT_EVENT_BEYOND_REDELIVERY_HORIZON", "paymentEvent", paypalOver.id)).toBe(false);
  });

  it("classifies rejected inbound rows and simple spike thresholds", async () => {
    const verify = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "VERIFY.FAILED");
    const metadata = await createRejection(ctx, WebhookIngressRejectionStage.METADATA_EXTRACT, "METADATA.MISSING_EVENT_TYPE");
    const raw = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "VERIFY.RAW_MISMATCH");

    const findings = await reconcilePaymentCore(db, {
      ...reconcileOptions(),
      verifySpikeThreshold: 2,
      metadataSpikeThreshold: 1,
      rawMismatchSpikeThreshold: 1,
    });

    expect(findingFor(findings, "WEBHOOK_VERIFY_REJECTION", "webhookIngressRejection", verify.id))
      .toMatchObject({ recommendedAction: "SECURITY_SIGNAL" });
    expect(findingFor(findings, "WEBHOOK_METADATA_REJECTION", "webhookIngressRejection", metadata.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
    expect(findingFor(findings, "WEBHOOK_RAW_MISMATCH", "webhookIngressRejection", raw.id))
      .toMatchObject({ recommendedAction: "SECURITY_SIGNAL" });
    expect(findings.some((finding) => finding.kind === "WEBHOOK_VERIFY_REJECTION_SPIKE")).toBe(true);
    expect(findings.some((finding) => finding.kind === "WEBHOOK_METADATA_REJECTION_SPIKE")).toBe(true);
    expect(findings.some((finding) => finding.kind === "WEBHOOK_RAW_MISMATCH_SPIKE")).toBe(true);
  });

  it("separates acked unsupported and lookup unavailable rejections from verify security noise", async () => {
    const acked = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "TOSS.EVENT_ACKED_UNSUPPORTED");
    for (let index = 0; index < 9; index += 1) {
      await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "TOSS.EVENT_ACKED_UNSUPPORTED");
    }
    const lookupCodes = [
      "TOSS.LOOKUP_TIMEOUT",
      "TOSS.LOOKUP_NETWORK_ERROR",
      "TOSS.LOOKUP_HTTP_ERROR",
      "TOSS.LOOKUP_PORT_UNAVAILABLE",
      "SANDBOX_EXTERNAL_MISCONFIGURED",
      "SANDBOX_EXTERNAL_CREDENTIALS_MISSING",
      "SANDBOX_EXTERNAL_CONFIG_INVALID",
    ];
    const lookupRows: Awaited<ReturnType<typeof createRejection>>[] = [];
    for (const code of lookupCodes) {
      lookupRows.push(await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, code));
    }

    const findings = await reconcilePaymentCore(db, {
      ...reconcileOptions(),
      verifySpikeThreshold: 1,
      lookupUnavailableSpikeThreshold: lookupCodes.length,
    });

    expect(findingFor(findings, "WEBHOOK_ACKED_UNSUPPORTED_EVENT", "webhookIngressRejection", acked.id))
      .toMatchObject({ severity: "info", recommendedAction: "ALERT_ONLY" });
    expect(hasSourceFinding(findings, "WEBHOOK_VERIFY_REJECTION", "webhookIngressRejection", acked.id)).toBe(false);
    for (const row of lookupRows) {
      expect(findingFor(findings, "WEBHOOK_LOOKUP_UNAVAILABLE", "webhookIngressRejection", row.id))
        .toMatchObject({ severity: "warning", recommendedAction: "ALERT_ONLY" });
      expect(hasSourceFinding(findings, "WEBHOOK_VERIFY_REJECTION", "webhookIngressRejection", row.id)).toBe(false);
    }
    expect(findings.some((finding) => finding.kind === "WEBHOOK_VERIFY_REJECTION_SPIKE")).toBe(false);
    expect(findings.some((finding) => finding.kind === "WEBHOOK_LOOKUP_UNAVAILABLE_SPIKE")).toBe(true);
  });

  it("keeps mode collision, generic verify, and raw-mismatch rejection visibility intact", async () => {
    const collision = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "VERIFY.MODE_COLLISION");
    const verify = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "VERIFY.FAILED");
    const raw = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "VERIFY.RAW_MISMATCH");

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "WEBHOOK_MODE_COLLISION", "webhookIngressRejection", collision.id))
      .toMatchObject({ severity: "critical", recommendedAction: "SECURITY_SIGNAL" });
    expect(findingFor(findings, "WEBHOOK_VERIFY_REJECTION", "webhookIngressRejection", verify.id))
      .toMatchObject({ recommendedAction: "SECURITY_SIGNAL" });
    expect(findingFor(findings, "WEBHOOK_RAW_MISMATCH", "webhookIngressRejection", raw.id))
      .toMatchObject({ recommendedAction: "SECURITY_SIGNAL" });
  });

  it("detects provider-confirm marker findings with redacted details", async () => {
    const manualSession = await createSession(ctx);
    const stopSession = await createSession(ctx);
    const terminalSession = await createSession(ctx);
    const manual = await createPayment(ctx, manualSession.id, providerMarkerInput("PROVIDER_CONFIRM_MANUAL_REVIEW"));
    const stop = await createPayment(ctx, stopSession.id, providerMarkerInput("PROVIDER_CONFIRM_STOP"));
    const terminal = await createPayment(ctx, terminalSession.id, {
      ...providerMarkerInput("PROVIDER_CONFIRM_TERMINAL"),
      status: PaymentAttemptStatus.FAILED,
    });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "PROVIDER_CONFIRM_MANUAL_REVIEW", "payment", manual.id))
      .toMatchObject({ severity: "critical", recommendedAction: "MANUAL_REVIEW", confidence: "high" });
    expect(findingFor(findings, "PROVIDER_CONFIRM_STOP", "payment", stop.id))
      .toMatchObject({ severity: "critical", recommendedAction: "MANUAL_REVIEW", confidence: "high" });
    const terminalFinding = findingFor(findings, "PROVIDER_CONFIRM_TERMINAL_FAILED", "payment", terminal.id);
    expect(terminalFinding).toMatchObject({ severity: "warning", recommendedAction: "ALERT_ONLY", confidence: "high" });
    expect(terminalFinding.details).toMatchObject({
      hasProviderRef: true,
      hasProviderConfirmIdempotencyKey: true,
      hasProviderPaymentKey: false,
      hasOrder: false,
    });
    const renderedDetails = JSON.stringify(terminalFinding.details);
    expect(renderedDetails).not.toContain("provider_ref_secret");
    expect(renderedDetails).not.toContain("confirm_key_secret");
  });

  it("detects stale provider confirm attempts but leaves recent and terminal marker rows out", async () => {
    const staleSession = await createSession(ctx);
    const recentSession = await createSession(ctx);
    const terminalSession = await createSession(ctx);
    const stale = await createPayment(ctx, staleSession.id, pendingConfirmInput(C2_OLD));
    const recent = await createPayment(ctx, recentSession.id, pendingConfirmInput(C2_NOW));
    const terminal = await createPayment(ctx, terminalSession.id, {
      ...providerMarkerInput("PROVIDER_CONFIRM_TERMINAL"),
      status: PaymentAttemptStatus.FAILED,
      updatedAt: C2_OLD,
    });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "STALE_PROVIDER_CONFIRM_ATTEMPT", "payment", stale.id))
      .toMatchObject({ severity: "warning", recommendedAction: "WATCH_STALE", confidence: "medium" });
    expect(hasFinding(findings, "STALE_PROVIDER_CONFIRM_ATTEMPT", recent.id)).toBe(false);
    expect(hasFinding(findings, "STALE_PROVIDER_CONFIRM_ATTEMPT", terminal.id)).toBe(false);
    expect(findingFor(findings, "PROVIDER_CONFIRM_TERMINAL_FAILED", "payment", terminal.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
  });

  it("treats retryable pending confirm attempts as stale without adding programmer-error findings", async () => {
    const retryableSession = await createSession(ctx);
    const programmerSession = await createSession(ctx);
    const retryable = await createPayment(ctx, retryableSession.id, pendingConfirmInput(C2_OLD));
    await createPayment(ctx, programmerSession.id, {
      ...pendingConfirmInput(C2_OLD),
      errorCode: "PROVIDER_CONFIRM_PROGRAMMER_ERROR",
    });

    const findings = await reconcilePaymentCore(db, reconcileOptions());

    expect(findingFor(findings, "STALE_PROVIDER_CONFIRM_ATTEMPT", "payment", retryable.id))
      .toMatchObject({ recommendedAction: "WATCH_STALE" });
    expect(findings.map((finding): string => finding.kind)).not.toContain("PROVIDER_CONFIRM_PROGRAMMER_ERROR");
  });

  it("does not mutate provider-confirm marker fields", async () => {
    const session = await createSession(ctx);
    const payment = await createPayment(ctx, session.id, providerMarkerInput("PROVIDER_CONFIRM_MANUAL_REVIEW"));
    const event = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.TRANSIENT_DB_ERROR",
      attemptCount: 1,
      lastAttemptAt: C2_OLD,
    });
    const before = await mutationSnapshot(ctx.userId, payment.id, event.id);

    const findings = await reconcilePaymentCore(db, reconcileOptions());
    const after = await mutationSnapshot(ctx.userId, payment.id, event.id);

    expect(findingFor(findings, "PROVIDER_CONFIRM_MANUAL_REVIEW", "payment", payment.id))
      .toMatchObject({ recommendedAction: "MANUAL_REVIEW" });
    expect(after).toEqual(before);
  });

  it("keeps the provider-confirm detector read-only and exact-marker based", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/payment/reconciliation/provider-confirm.ts"), "utf8");
    for (const forbidden of [
      "completeFromCapture",
      "dispatchPending",
      "createVoidHandler",
      "transitionCheckoutSession",
      "provider.confirm",
      "create(",
      "updateMany",
      ".update(",
      "upsert",
      "deleteMany",
      ".delete(",
      "lastError",
      "Toss",
      "PayPal",
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain("errorCode: \"PROVIDER_CONFIRM_MANUAL_REVIEW\"");
  });

  it("keeps webhook visibility reconciliation read-only", async () => {
    const event = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.MODE_DIVERGENCE",
      lastError: "Mode divergence deferred",
    });
    const rejection = await createRejection(ctx, WebhookIngressRejectionStage.VERIFY, "TOSS.LOOKUP_TIMEOUT", {
      lastError: "Provider lookup unavailable",
    });
    const before = await reconciliationVisibilitySnapshot(ctx, event.id, rejection.id);

    const findings = await reconcilePaymentCore(db, reconcileOptions());
    const after = await reconciliationVisibilitySnapshot(ctx, event.id, rejection.id);

    expect(findingFor(findings, "WEBHOOK_EVENT_MODE_DIVERGENCE", "paymentEvent", event.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
    expect(findingFor(findings, "WEBHOOK_LOOKUP_UNAVAILABLE", "webhookIngressRejection", rejection.id))
      .toMatchObject({ recommendedAction: "ALERT_ONLY" });
    expect(after).toEqual(before);
  });

  it("does not mutate payment, order, outbox, or event state", async () => {
    const session = await createSession(ctx);
    const payment = await createPayment(ctx, session.id, { updatedAt: C2_OLD });
    const event = await createPaymentEvent(ctx, PaymentEventStatus.RETRYABLE_FAILED, {
      failureStage: PaymentEventFailureStage.COMPLETE,
      failureCode: "COMPLETE.TRANSIENT_DB_ERROR",
      attemptCount: 1,
      lastAttemptAt: C2_OLD,
    });
    const before = await mutationSnapshot(ctx.userId, payment.id, event.id);

    const findings = await reconcilePaymentCore(db, reconcileOptions());
    const after = await mutationSnapshot(ctx.userId, payment.id, event.id);

    expect(findingFor(findings, "SUCCEEDED_PAYMENT_WITHOUT_ORDER", "payment", payment.id))
      .toMatchObject({ recommendedAction: "AUTO_REENTRY_CANDIDATE" });
    expect(after).toEqual(before);
  });
});

function makeContext(): TestContext {
  return {
    userId: `c2_${randomUUID()}`,
    styleIds: [],
    variantIds: [],
    sessionIds: [],
    paymentIds: [],
    orderIds: [],
    outboxIds: [],
    eventIds: [],
    rejectionIds: [],
  };
}

function reconcileOptions() {
  return {
    now: C2_NOW,
    staleReceivedAfterMs: STALE_MS,
    staleRetryableFailedAfterMs: STALE_MS,
    staleSucceededPaymentAfterMs: STALE_MS,
    staleProviderConfirmAfterMs: STALE_MS,
    spikeWindowMs: 60_000,
    verifySpikeThreshold: 100,
    metadataSpikeThreshold: 100,
    rawMismatchSpikeThreshold: 100,
    parseFailureSpikeThreshold: 100,
    completeRetryableSpikeThreshold: 100,
  };
}

function providerMarkerInput(errorCode: string): PaymentInput {
  return {
    status: PaymentAttemptStatus.AWAITING,
    providerRef: `provider_ref_secret_${randomUUID()}`,
    providerConfirmIdempotencyKey: `confirm_key_secret_${randomUUID()}`,
    providerPaymentKey: null,
    errorCode,
    errorMessage: "safe marker",
    updatedAt: C2_OLD,
  };
}

function pendingConfirmInput(updatedAt: Date): PaymentInput {
  return {
    status: PaymentAttemptStatus.AWAITING,
    providerConfirmIdempotencyKey: `confirm_${randomUUID()}`,
    providerPaymentKey: null,
    updatedAt,
  };
}

async function ensureMarkets(): Promise<void> {
  await db.market.upsert({
    where: { code: MarketCode.KR },
    update: { currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
    create: { code: MarketCode.KR, currency: "KRW", shippableCountries: [ShippingCountry.KR], defaultLocale: "ko", isActive: true },
  });
}

async function createSession(context: TestContext, input: SessionInput = {}) {
  const totalAmount = input.totalAmount ?? 12_000;
  const session = await db.checkoutSession.create({
    data: {
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: input.currency ?? "KRW",
      status: input.status ?? CheckoutSessionStatus.SUBMITTED,
      subtotalAmount: totalAmount,
      shippingAmount: 0,
      totalAmount,
      expiresAt: new Date(C2_NOW.getTime() + 30 * 60_000),
      submittedAt: C2_NOW,
      completedAt: input.status === CheckoutSessionStatus.COMPLETED ? C2_NOW : null,
    },
  });
  context.sessionIds.push(session.id);
  return session;
}

async function createPayment(context: TestContext, sessionId: string, input: PaymentInput = {}) {
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: sessionId,
      provider: PaymentProvider.TOSS,
      mode: input.mode ?? PaymentMode.SANDBOX,
      status: input.status ?? PaymentAttemptStatus.SUCCEEDED,
      amount: input.amount ?? 12_000,
      currency: input.currency ?? "KRW",
      providerRef: input.providerRef,
      providerConfirmIdempotencyKey: input.providerConfirmIdempotencyKey,
      providerPaymentKey: input.providerPaymentKey === undefined ? `c2_pay_${randomUUID()}` : input.providerPaymentKey,
      idempotencyKey: `c2_idem_${randomUUID()}`,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      createdAt: input.updatedAt ?? C2_NOW,
      updatedAt: input.updatedAt ?? C2_NOW,
    },
  });
  context.paymentIds.push(payment.id);
  return payment;
}

async function createOrder(context: TestContext, session: Awaited<ReturnType<typeof createSession>>, payment: Awaited<ReturnType<typeof createPayment>>) {
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId: context.userId,
      marketCode: MarketCode.KR,
      currency: session.currency,
      subtotalAmount: session.subtotalAmount,
      shippingAmount: session.shippingAmount,
      totalAmount: session.totalAmount,
      paidAt: C2_NOW,
    },
  });
  context.orderIds.push(order.id);
  return order;
}

async function createMtoOrderItem(context: TestContext, orderId: string): Promise<void> {
  const variant = await createVariant(context);
  await db.orderItem.create({
    data: {
      orderId,
      variantId: variant.id,
      quantity: 1,
      unitAmount: 12_000,
      fulfillmentType: "MTO",
      snapshotData: { name: "C2 test" },
    },
  });
}

async function createVariant(context: TestContext) {
  const style = await db.wigStyle.create({
    data: {
      name: `C2 Style ${randomUUID()}`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
    },
  });
  context.styleIds.push(style.id);
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "C",
      price: 12_000,
      stock: 5,
      sku: `C2-${randomUUID()}`,
    },
  });
  context.variantIds.push(variant.id);
  return variant;
}

async function paymentWithVoidPath(context: TestContext, status: OutboxStatus, attempts: number) {
  const session = await createSession(context);
  const payment = await createPayment(context, session.id, { updatedAt: C2_OLD });
  const outbox = await createVoidOutbox(context, payment, { status, attempts });
  return { payment, outboxId: outbox.id };
}

async function createVoidOutbox(
  context: TestContext,
  payment: Awaited<ReturnType<typeof createPayment>>,
  input: { status: OutboxStatus; attempts: number; providerPaymentKey?: string },
) {
  const providerPaymentKey = input.providerPaymentKey ?? requireProviderKey(payment.providerPaymentKey);
  const outbox = await db.paymentOutbox.create({
    data: {
      topic: "pg.void",
      payload: { paymentId: payment.id, provider: payment.provider, providerPaymentKey, reason: "C2_TEST" },
      status: input.status,
      attempts: input.attempts,
      dedupKey: `void:${payment.provider}:${providerPaymentKey}`,
      updatedAt: C2_NOW,
    },
  });
  context.outboxIds.push(outbox.id);
  return outbox;
}

async function createPaymentEvent(
  context: TestContext,
  status: PaymentEventStatus,
  input: Partial<{
    provider: PaymentProvider;
    receivedAt: Date;
    failureStage: PaymentEventFailureStage;
    failureCode: string;
    attemptCount: number;
    lastAttemptAt: Date;
    lastError: string | null;
    verifiedMode: PaymentMode | null;
    verifiedCredentialBinding: string | null;
  }> = {},
) {
  const event = await db.paymentEvent.create({
    data: {
      provider: input.provider ?? PaymentProvider.TOSS,
      source: PaymentEventSource.WEBHOOK,
      transmissionId: `c2_tx_${randomUUID()}`,
      eventType: "PAYMENT.CAPTURED",
      verifiedMode: input.verifiedMode,
      verifiedCredentialBinding: input.verifiedCredentialBinding,
      raw: JSON.stringify({ c2: true }),
      status,
      receivedAt: input.receivedAt ?? C2_NOW,
      failureStage: input.failureStage,
      failureCode: input.failureCode,
      attemptCount: input.attemptCount ?? 0,
      lastAttemptAt: input.lastAttemptAt,
      lastError: input.lastError,
    },
  });
  context.eventIds.push(event.id);
  return event;
}

async function createRejection(
  context: TestContext,
  stage: WebhookIngressRejectionStage,
  code: string,
  input: Partial<{
    provider: PaymentProvider;
    receivedAt: Date;
    lastError: string | null;
  }> = {},
) {
  const rejection = await db.webhookIngressRejection.create({
    data: {
      provider: input.provider ?? PaymentProvider.TOSS,
      stage,
      code,
      candidateTransmissionId: `c2_reject_${randomUUID()}`,
      candidateEventType: "PAYMENT.CAPTURED",
      rawBodyBytes: 10,
      rawBodyHash: "a".repeat(64),
      rawBodyPrefix: "c2",
      lastError: input.lastError,
      receivedAt: input.receivedAt ?? C2_NOW,
    },
  });
  context.rejectionIds.push(rejection.id);
  return rejection;
}

async function reconciliationVisibilitySnapshot(context: TestContext, eventId: string, rejectionId: string) {
  const event = await db.paymentEvent.findUniqueOrThrow({
    where: { id: eventId },
    select: { status: true, failureStage: true, failureCode: true, lastError: true, attemptCount: true },
  });
  const rejection = await db.webhookIngressRejection.findUniqueOrThrow({
    where: { id: rejectionId },
    select: { stage: true, code: true, lastError: true },
  });
  return {
    event,
    rejection,
    paymentEventCount: await db.paymentEvent.count({ where: { id: { in: context.eventIds } } }),
    rejectionCount: await db.webhookIngressRejection.count({ where: { id: { in: context.rejectionIds } } }),
    orderCount: await db.order.count({ where: { id: { in: context.orderIds } } }),
    outboxCount: await db.paymentOutbox.count({ where: { id: { in: context.outboxIds } } }),
  };
}

async function mutationSnapshot(userId: string, paymentId: string, eventId: string) {
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: {
      status: true,
      provider: true,
      providerRef: true,
      providerConfirmIdempotencyKey: true,
      providerPaymentKey: true,
      errorCode: true,
      errorMessage: true,
    },
  });
  const event = await db.paymentEvent.findUniqueOrThrow({ where: { id: eventId }, select: { status: true, attemptCount: true } });
  const dedupKey = payment.providerPaymentKey ? `void:${payment.provider}:${payment.providerPaymentKey}` : "missing";
  return {
    payment,
    event,
    orderCount: await db.order.count({ where: { userId } }),
    outboxCount: await db.paymentOutbox.count({ where: { dedupKey } }),
  };
}

function hasFinding(
  findings: ReconciliationFinding[],
  kind: ReconciliationFinding["kind"],
  paymentId: string,
): boolean {
  return findings.some((finding) => finding.kind === kind && finding.sourceIds.payment?.includes(paymentId));
}

function hasSourceFinding(
  findings: ReconciliationFinding[],
  kind: ReconciliationFinding["kind"],
  source: keyof ReconciliationFinding["sourceIds"],
  id: string,
): boolean {
  return findings.some((finding) => finding.kind === kind && finding.sourceIds[source]?.includes(id));
}

function findingFor(
  findings: ReconciliationFinding[],
  kind: ReconciliationFinding["kind"],
  source: keyof ReconciliationFinding["sourceIds"],
  id: string,
) {
  const found = findings.find((finding) => finding.kind === kind && finding.sourceIds[source]?.includes(id));
  if (!found) throw new Error(`Missing ${kind} for ${source}:${id}`);
  return found;
}

function partialReason(findings: ReconciliationFinding[], orderId: string, reason: string): ReconciliationFinding | undefined {
  return findings.find((finding) => (
    finding.kind === "PARTIAL_LOCAL_COMPLETION"
    && finding.sourceIds.order?.includes(orderId)
    && finding.details.reason === reason
  ));
}

function requireProviderKey(providerPaymentKey: string | null): string {
  if (providerPaymentKey) return providerPaymentKey;
  throw new Error("Missing providerPaymentKey");
}

async function cleanup(context: TestContext): Promise<void> {
  await db.webhookIngressRejection.deleteMany({ where: { id: { in: context.rejectionIds } } });
  await db.paymentEvent.deleteMany({ where: { id: { in: context.eventIds } } });
  await db.paymentOutbox.deleteMany({ where: { id: { in: context.outboxIds } } });
  await db.manufacturingRequest.deleteMany({ where: { orderItem: { orderId: { in: context.orderIds } } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.orderShipping.deleteMany({ where: { orderId: { in: context.orderIds } } });
  await db.order.deleteMany({ where: { id: { in: context.orderIds } } });
  await db.payment.deleteMany({ where: { id: { in: context.paymentIds } } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: { in: context.sessionIds } } });
  await db.checkoutSession.deleteMany({ where: { id: { in: context.sessionIds } } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: { in: context.variantIds } } });
  await db.wigVariant.deleteMany({ where: { id: { in: context.variantIds } } });
  await db.wigStyle.deleteMany({ where: { id: { in: context.styleIds } } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
