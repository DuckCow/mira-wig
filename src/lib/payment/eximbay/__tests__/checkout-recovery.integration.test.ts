import { randomUUID } from "node:crypto";
import {
  FulfillmentType,
  PaymentAdapterExecutionKind,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentInitiationOutputKind,
  PaymentMode,
  PaymentProvider,
  PaymentRemediationStatus,
  PrismaClient,
  ShippingCountry,
  WigCategory,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { initiatePaymentAttempt } from "@/lib/payment/attempt/initiate";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { PaymentMethod } from "@/lib/payment/providers/routing";
import type { PaymentInitiationProvider } from "@/lib/payment/providers/types";
import { hasUnresolvedSessionExposure } from "@/lib/payment/remediation";
import { createCheckoutSession, readCheckoutSessionResume } from "@/lib/payment/session";
import type { EximbayBf4Fetch } from "../bf4-contact";
import { processEximbayBf4Status } from "../bf4-engine";
import type { EximbayReadyFetch } from "../ready-http";
import {
  applyContactedReconciliationRoleGrants,
  bootstrapEximbayP3eDatabaseRoles,
  defaultEximbayP3eDatabaseBootstrapDependencies,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  restoreCanaryRefundRoleGrants,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";
import {
  checkoutRecoveryTransmissionId,
  EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
  EXIMBAY_CHECKOUT_RECOVERY_OUTCOME_UNKNOWN_LOG_EVENT,
  EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED,
  recoverEximbayCheckout,
} from "../checkout-recovery";

const initiationProvider = vi.hoisted<PaymentInitiationProvider>(() => ({
  code: "EXIMBAY",
  adapterExecutionKind: "EXTERNAL",
  initiate: () => Promise.reject(new Error("generic Eximbay provider seam must remain unused")),
}));

vi.mock("@/lib/payment/providers/initiation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payment/providers/initiation")>()),
  resolveInitiationProvider: () => initiationProvider,
}));

const NOW = new Date("2026-08-25T01:00:00.000Z");
const RECOVERY_AT = new Date("2026-08-25T01:05:00.000Z");
const CALLBACK_AT = new Date("2026-08-25T01:06:00.000Z");
const MID = "R11A_SYNTHETIC_MID";
const API_KEY = "R11A_SYNTHETIC_KEY_DO_NOT_LOG";
const RESTRICTED_ROLE_PASSWORD = "contacted_reconciliation_restricted_test_only";
const RECOVERY_ENV = Object.freeze({
  [EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED]: "ENABLED",
  EXIMBAY_SANDBOX_MID: MID,
  EXIMBAY_SANDBOX_API_KEY: API_KEY,
});

interface Fixture {
  userId: string;
  styleId: string;
  variantId: string;
  sessionId: string;
  paymentId: string;
  providerOrderId: string;
  amount: number;
}

const bootstrapInput = Object.freeze({
  admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  targetDatabaseName: "wig_platform_test" as const,
});

describe.sequential("Eximbay R11A checkout recovery", () => {
  let fixture: Fixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await cleanupFixture(fixture);
  });

  it("keeps the dormant gate contact-free and releases only on one authoritative Q004 event", async () => {
    const disabledTransport = vi.fn<EximbayBf4Fetch>();
    const disabled = await recoverEximbayCheckout(db, recoveryInput(fixture, disabledTransport, {}));
    expect(disabled).toEqual({ kind: "notReleased", reason: "DISABLED" });
    expect(disabledTransport).not.toHaveBeenCalled();
    await expect(recoverEximbayCheckout(db, recoveryInput(fixture, disabledTransport, {
      [EXIMBAY_CHECKOUT_RECOVERY_SANDBOX_ENABLED]: "enabled",
    }))).rejects.toThrow("EXIMBAY_CHECKOUT_RECOVERY_INVALID_ACTIVATION");
    expect(disabledTransport).not.toHaveBeenCalled();

    const transport = q004Transport();
    const released = await recoverEximbayCheckout(db, recoveryInput(fixture, transport));
    const replayTransport = vi.fn<EximbayBf4Fetch>();
    const replay = await recoverEximbayCheckout(db, recoveryInput(fixture, replayTransport));

    expect(released).toMatchObject({ kind: "released", paymentId: fixture.paymentId });
    expect(replay).toMatchObject({ kind: "replayed", paymentId: fixture.paymentId });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(replayTransport).not.toHaveBeenCalled();
    await expect(db.paymentEvent.count({
      where: {
        provider: PaymentProvider.EXIMBAY,
        transmissionId: checkoutRecoveryTransmissionId(fixture.paymentId),
      },
    })).resolves.toBe(1);
    const event = await db.paymentEvent.findUniqueOrThrow({
      where: {
        provider_transmissionId: {
          provider: PaymentProvider.EXIMBAY,
          transmissionId: checkoutRecoveryTransmissionId(fixture.paymentId),
        },
      },
    });
    expect(event).toMatchObject({
      source: "API",
      eventType: EXIMBAY_CHECKOUT_RECOVERY_EVENT_TYPE,
      verifiedMode: PaymentMode.SANDBOX,
      status: "PROCESSED",
      raw: {
        paymentId: fixture.paymentId,
        checkoutSessionId: fixture.sessionId,
        providerOrderId: fixture.providerOrderId,
        providerCode: "Q004",
        providerResult: { rescode: "Q004" },
      },
    });
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        remediationStatus: PaymentRemediationStatus.NONE,
        providerOrderId: fixture.providerOrderId,
        providerPaymentKey: null,
        financialSucceededAt: null,
        blockingEndedAt: RECOVERY_AT,
        errorCode: "EXIMBAY_NO_TRANSACTION_OBSERVED",
      });
    await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
    const resumed = await readCheckoutSessionResume(db, {
      checkoutSessionId: fixture.sessionId,
      authenticatedUserId: fixture.userId,
      now: RECOVERY_AT,
    });
    expect(resumed).toMatchObject({ disposition: "PAYMENT_ELIGIBLE", recoveryPaymentId: null });
  });

  it("does not release an observed transaction", async () => {
    const result = await recoverEximbayCheckout(db, recoveryInput(fixture, transactionObservedTransport()));
    expect(result).toEqual({ kind: "notReleased", reason: "TRANSACTION_OBSERVED" });
    await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({ blockingEndedAt: null, errorCode: null });
  });

  it("logs one bounded redacted diagnostic while keeping provider outcome unknown fail closed", async () => {
    const rawValueSentinel = "RAW_PROVIDER_VALUE_MUST_NOT_ESCAPE";
    const resmsgSentinel = "RESMSG_MUST_NOT_ESCAPE";
    const logged: unknown[] = [];
    const warning = vi.spyOn(console, "warn").mockImplementation((value: unknown) => {
      logged.push(value);
    });
    try {
      const result = await recoverEximbayCheckout(db, recoveryInput(
        fixture,
        () => Promise.resolve(jsonResponse({
          ...realCanaryObservedQ004Envelope(resmsgSentinel),
          extra_root_member: { secret: rawValueSentinel },
        })),
      ));
      expect(result).toEqual({ kind: "notReleased", reason: "OUTCOME_UNKNOWN" });
      expect(warning).toHaveBeenCalledTimes(1);
      const serialized = logged[0];
      expect(typeof serialized).toBe("string");
      if (typeof serialized !== "string") throw new Error("expected structured diagnostic JSON");
      const record: unknown = JSON.parse(serialized);
      expect(record).toEqual(expect.objectContaining({
        event: EXIMBAY_CHECKOUT_RECOVERY_OUTCOME_UNKNOWN_LOG_EVENT,
        checkoutSessionId: fixture.sessionId,
        paymentId: fixture.paymentId,
        mode: PaymentMode.SANDBOX,
        failureCode: "UNKNOWN_SHAPE",
        deadlineAborted: false,
        httpStatus: 200,
        responseContentTypeClass: "JSON",
        observedRescode: "Q004",
        rootKeys: ["card_info", "extra_root_member", "mid", "other_param", "payment", "rescode", "resmsg"],
        rootKeysTruncated: false,
      }));
      if (typeof record !== "object" || record === null || Array.isArray(record)) {
        throw new Error("expected structured diagnostic object");
      }
      expect(Object.keys(record).sort()).toEqual([
        "checkoutSessionId",
        "deadlineAborted",
        "elapsedMs",
        "event",
        "failureCode",
        "httpStatus",
        "mode",
        "observedRescode",
        "paymentId",
        "responseByteCount",
        "responseContentTypeClass",
        "rootKeys",
        "rootKeysTruncated",
      ]);
      for (const forbidden of [
        rawValueSentinel,
        resmsgSentinel,
        API_KEY,
        MID,
        fixture.userId,
        fixture.providerOrderId,
        "Authorization",
        "fgkey",
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      warning.mockRestore();
    }

    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
        remediationStatus: PaymentRemediationStatus.NONE,
        providerPaymentKey: null,
        financialSucceededAt: null,
        blockingEndedAt: null,
        errorCode: null,
      });
    await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
    await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
  });

  it("keeps outcome unknown fail closed when diagnostic logging throws", async () => {
    const transport = vi.fn<EximbayBf4Fetch>(() => Promise.resolve(new Response("{}", {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {
      throw new Error("SYNTHETIC_DIAGNOSTIC_SINK_FAILURE");
    });
    try {
      const result = await recoverEximbayCheckout(db, recoveryInput(fixture, transport));

      expect(result).toEqual({ kind: "notReleased", reason: "OUTCOME_UNKNOWN" });
      expect(transport).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledTimes(1);
      await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
        .resolves.toMatchObject({
          status: PaymentAttemptStatus.INITIATED,
          attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
          remediationStatus: PaymentRemediationStatus.NONE,
          providerPaymentKey: null,
          financialSucceededAt: null,
          blockingEndedAt: null,
          errorCode: null,
        });
      await expect(db.paymentEvent.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
      await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
    } finally {
      warning.mockRestore();
    }
  });

  it("runs every contacted-recovery disposition under the exact temporary restricted role", async () => {
    const databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
    const admin = new Client({ connectionString: databaseUrl });
    const additionalFixtures: Fixture[] = [];
    let restricted: PrismaClient | null = null;
    await admin.connect();
    await admin.query("SELECT pg_advisory_lock(682326912)");
    try {
      const dependencies = contactedRoleDependencies();
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, dependencies);
      await bootstrapEximbayP3eDatabaseRoles(admin, bootstrapInput);
      await admin.query(`ALTER ROLE mira_refund_canary PASSWORD '${RESTRICTED_ROLE_PASSWORD}'`);
      await applyContactedReconciliationRoleGrants(admin, bootstrapInput, dependencies);
      restricted = restrictedRecoveryClient(databaseUrl);

      const q004 = q004Transport();
      await expect(recoverEximbayCheckout(restricted, recoveryInput(fixture, q004)))
        .resolves.toMatchObject({ kind: "released", paymentId: fixture.paymentId });
      expect(q004).toHaveBeenCalledTimes(1);
      const replayTransport = vi.fn<EximbayBf4Fetch>();
      await expect(recoverEximbayCheckout(restricted, recoveryInput(fixture, replayTransport)))
        .resolves.toMatchObject({ kind: "replayed", paymentId: fixture.paymentId });
      expect(replayTransport).not.toHaveBeenCalled();
      await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
        .resolves.toMatchObject({
          status: PaymentAttemptStatus.INITIATED,
          attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
          remediationStatus: PaymentRemediationStatus.NONE,
          providerPaymentKey: null,
          financialSucceededAt: null,
          blockingEndedAt: RECOVERY_AT,
          errorCode: "EXIMBAY_NO_TRANSACTION_OBSERVED",
        });
      await expect(db.paymentEvent.count({
        where: {
          provider: PaymentProvider.EXIMBAY,
          transmissionId: checkoutRecoveryTransmissionId(fixture.paymentId),
        },
      })).resolves.toBe(1);
      await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } }))
        .resolves.toBe(0);
      await expect(readCheckoutSessionResume(db, {
        checkoutSessionId: fixture.sessionId,
        authenticatedUserId: fixture.userId,
        now: RECOVERY_AT,
      })).resolves.toMatchObject({ disposition: "PAYMENT_ELIGIBLE", recoveryPaymentId: null });

      const observedFixture = await createFixture();
      additionalFixtures.push(observedFixture);
      const observedTransport = transactionObservedTransport();
      await expect(recoverEximbayCheckout(
        restricted,
        recoveryInput(observedFixture, observedTransport),
      )).resolves.toEqual({ kind: "notReleased", reason: "TRANSACTION_OBSERVED" });
      expect(observedTransport).toHaveBeenCalledTimes(1);

      const ambiguousFixture = await createFixture();
      additionalFixtures.push(ambiguousFixture);
      const ambiguousTransport = vi.fn<EximbayBf4Fetch>(() => Promise.resolve(jsonResponse({
        ...realCanaryObservedQ004Envelope("shape remains intentionally ambiguous"),
        extra_root_member: true,
      })));
      const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      try {
        await expect(recoverEximbayCheckout(
          restricted,
          recoveryInput(ambiguousFixture, ambiguousTransport),
        )).resolves.toEqual({ kind: "notReleased", reason: "OUTCOME_UNKNOWN" });
      } finally {
        warning.mockRestore();
      }
      expect(ambiguousTransport).toHaveBeenCalledTimes(1);

      const staleFixture = await createFixture();
      additionalFixtures.push(staleFixture);
      await db.checkoutSession.update({
        where: { id: staleFixture.sessionId },
        data: { expiresAt: new Date(RECOVERY_AT.getTime() - 1) },
      });
      const staleTransport = vi.fn<EximbayBf4Fetch>();
      await expect(recoverEximbayCheckout(
        restricted,
        recoveryInput(staleFixture, staleTransport),
      )).resolves.toEqual({ kind: "notReleased", reason: "NOT_ELIGIBLE" });
      expect(staleTransport).not.toHaveBeenCalled();

      await expect(db.payment.findUniqueOrThrow({ where: { id: observedFixture.paymentId } }))
        .resolves.toMatchObject({ blockingEndedAt: null, errorCode: null });
      await expect(db.payment.findUniqueOrThrow({ where: { id: ambiguousFixture.paymentId } }))
        .resolves.toMatchObject({ blockingEndedAt: null, errorCode: null });
      await expect(db.paymentEvent.count({
        where: { checkoutSessionId: { in: [observedFixture.sessionId, ambiguousFixture.sessionId] } },
      })).resolves.toBe(0);

      await restricted.$disconnect();
      restricted = null;
      await restoreCanaryRefundRoleGrants(admin, bootstrapInput, dependencies);
      await expect(reconciliationPrivilegeResidue(admin)).resolves.toEqual({
        checkoutSessionIdUpdate: false,
        paymentEventSelect: false,
        paymentEventInsert: false,
        paymentBlockingEndedAtUpdate: false,
      });
    } finally {
      if (restricted) await restricted.$disconnect().catch(() => undefined);
      for (const extra of additionalFixtures.reverse()) {
        await cleanupFixture(extra).catch(() => undefined);
      }
      await restoreCanaryRefundRoleGrants(
        admin,
        bootstrapInput,
        contactedRoleDependencies(),
      ).catch(() => undefined);
      await admin.query("ALTER ROLE mira_refund_canary PASSWORD NULL").catch(() => undefined);
      await admin.query("SELECT pg_advisory_unlock(682326912)").catch(() => undefined);
      await admin.end();
    }
  });

  it("reclaims the slot and completes a late SALE when no successor exists", async () => {
    await release(fixture);
    const result = await processSale(fixture, "late-case-1");
    expect(result).toMatchObject({ kind: "handled", acknowledgement: { kind: "SUCCESS" } });
    await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(1);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
        remediationStatus: PaymentRemediationStatus.NONE,
      });
  });

  it("supersedes an uncontacted successor before completing the released predecessor", async () => {
    await release(fixture);
    const successor = await createSuccessor(fixture, false);
    await processSale(fixture, "late-case-2");
    await expect(db.payment.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.SUPERSEDED,
        contactStartedAt: null,
      });
    await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(1);
  });

  it("records cancellation-required remediation when the successor was contacted", async () => {
    await release(fixture);
    const successor = await createSuccessor(fixture, true);
    await processSale(fixture, "late-case-3");
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
        remediationStatus: PaymentRemediationStatus.PENDING,
        suspendedByPaymentId: successor.id,
        errorCode: "EXIMBAY_LATE_SUCCESS_CANCELLATION_REQUIRED",
      });
    await expect(db.payment.findUniqueOrThrow({ where: { id: successor.id } }))
      .resolves.toMatchObject({ blockingEndedAt: null });
    await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
    await expect(db.paymentOutbox.count({
      where: { dedupKey: { startsWith: "payment-remediation:EXIMBAY:" } },
    })).resolves.toBeGreaterThan(0);
  });

  it("preserves the successor Order and records a late old success without a second Order", async () => {
    await release(fixture);
    const successor = await createSuccessor(fixture, true);
    if (successor.providerOrderId === null) throw new Error("R11A successor providerOrderId missing");
    const successorFixture: Fixture = {
      ...fixture,
      paymentId: successor.id,
      providerOrderId: successor.providerOrderId,
    };
    await processSale(successorFixture, "successor-sale");
    await processSale(fixture, "late-case-4");

    const orders = await db.order.findMany({ where: { checkoutSessionId: fixture.sessionId } });
    expect(orders).toHaveLength(1);
    expect(orders[0].paymentId).toBe(successor.id);
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.SUCCEEDED,
        attemptLifecycle: PaymentAttemptLifecycle.SUSPENDED,
        remediationStatus: PaymentRemediationStatus.PENDING,
        suspendedByPaymentId: successor.id,
        errorCode: "EXIMBAY_LATE_SUCCESS_CANCELLATION_REQUIRED",
      });
  });

  it("retains a released late callback ambiguity as session-wide exposure", async () => {
    await release(fixture);
    const result = await processEximbayBf4Status(db, {
      exactRawQuery: statusRaw(fixture, "late-case-5"),
      receivedAt: CALLBACK_AT,
      modeCeiling: PaymentMode.SANDBOX,
      env: bf4Env(),
      transport: vi.fn<EximbayBf4Fetch>(() => Promise.resolve(jsonResponse({ rescode: "9999", resmsg: "ambiguous" }))),
      now: () => CALLBACK_AT,
    });
    expect(result).toMatchObject({ kind: "handled" });
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        blockingEndedAt: RECOVERY_AT,
        remediationStatus: PaymentRemediationStatus.NONE,
        errorCode: "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN",
      });
    await expect(hasUnresolvedSessionExposure(db, fixture.sessionId)).resolves.toBe(true);
    await expect(readCheckoutSessionResume(db, {
      checkoutSessionId: fixture.sessionId,
      authenticatedUserId: fixture.userId,
      now: CALLBACK_AT,
    })).resolves.toMatchObject({ disposition: "PAYMENT_EXISTS", recoveryPaymentId: null });
  });

  it("serializes a callback claim ahead of Q004 release and refuses retry authority", async () => {
    const q004 = deferred<Response>();
    const recovery = recoverEximbayCheckout(db, recoveryInput(
      fixture,
      vi.fn<EximbayBf4Fetch>(() => q004.promise),
    ));
    await Promise.resolve();
    const callback = processEximbayBf4Status(db, {
      exactRawQuery: statusRaw(fixture, "race-sale"),
      receivedAt: CALLBACK_AT,
      modeCeiling: PaymentMode.SANDBOX,
      env: bf4Env(),
      transport: saleTransport(fixture, "race-sale"),
      now: () => CALLBACK_AT,
    });
    await callback;
    q004.resolve(jsonResponse({ rescode: "Q004", resmsg: "not observed" }));

    await expect(recovery).resolves.toEqual({ kind: "notReleased", reason: "STATE_CHANGED" });
    await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(1);
    await expect(db.paymentEvent.count({
      where: { transmissionId: checkoutRecoveryTransmissionId(fixture.paymentId) },
    })).resolves.toBe(0);
  });

  it("rereads a Q004 release committed after BF4 correlation before recording ambiguity", async () => {
    const correlationObserved = deferred<void>();
    const resumeCallback = deferred<void>();
    const correlationSpy = pauseBeforeFirstBf4Transaction(
      correlationObserved,
      resumeCallback,
    );
    const callback = processEximbayBf4Status(db, {
      exactRawQuery: statusRaw(fixture, "stale-correlation-ambiguity"),
      receivedAt: CALLBACK_AT,
      modeCeiling: PaymentMode.SANDBOX,
      env: bf4Env(),
      transport: vi.fn<EximbayBf4Fetch>(() => Promise.resolve(
        jsonResponse({ rescode: "9999", resmsg: "ambiguous" }),
      )),
      now: () => CALLBACK_AT,
    });
    await correlationObserved.promise;
    try {
      await expect(recoverEximbayCheckout(db, recoveryInput(fixture, q004Transport())))
        .resolves.toMatchObject({ kind: "released", paymentId: fixture.paymentId });
    } finally {
      resumeCallback.resolve();
    }

    try {
      await expect(callback).resolves.toMatchObject({
        kind: "handled",
        stage: "VERIFY_OUTCOME_UNKNOWN",
      });
    } finally {
      correlationSpy.mockRestore();
    }
    await expect(db.payment.findUniqueOrThrow({ where: { id: fixture.paymentId } }))
      .resolves.toMatchObject({
        status: PaymentAttemptStatus.INITIATED,
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        remediationStatus: PaymentRemediationStatus.NONE,
        providerPaymentKey: null,
        financialSucceededAt: null,
        blockingEndedAt: RECOVERY_AT,
        errorCode: "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN",
      });
    await expect(hasUnresolvedSessionExposure(db, fixture.sessionId)).resolves.toBe(true);
    await expect(readCheckoutSessionResume(db, {
      checkoutSessionId: fixture.sessionId,
      authenticatedUserId: fixture.userId,
      now: CALLBACK_AT,
    })).resolves.toMatchObject({ disposition: "PAYMENT_EXISTS", recoveryPaymentId: null });

    const freshContact = vi.fn<EximbayReadyFetch>();
    await expect(initiatePaymentAttempt(db, {
      sessionId: fixture.sessionId,
      userId: fixture.userId,
      adapterContext: eximbayAdapterContext(),
      now: CALLBACK_AT,
      eximbayReady: {
        env: {
          ...bf4Env(),
          PAYMENT_PUBLIC_ORIGIN: "https://payments.example.test/",
        },
        fetchImpl: freshContact,
      },
    })).rejects.toMatchObject({ code: "SESSION_REMEDIATION_REQUIRED" });
    expect(freshContact).not.toHaveBeenCalled();
    await expect(db.paymentEvent.count({
      where: { transmissionId: checkoutRecoveryTransmissionId(fixture.paymentId) },
    })).resolves.toBe(1);
    await expect(db.order.count({ where: { checkoutSessionId: fixture.sessionId } })).resolves.toBe(0);
  });

  it("enforces the fail-closed released row CHECK and admits only the exact ambiguity diagnostic", async () => {
    await release(fixture);
    await expect(db.payment.update({
      where: { id: fixture.paymentId },
      data: { errorCode: "ARBITRARY_RELEASE" },
    })).rejects.toThrow();
    await expect(db.payment.update({
      where: { id: fixture.paymentId },
      data: { attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN },
    })).rejects.toThrow();
    await expect(db.payment.update({
      where: { id: fixture.paymentId },
      data: {
        attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
        errorCode: "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN",
      },
    })).resolves.toMatchObject({
      attemptLifecycle: PaymentAttemptLifecycle.OUTCOME_UNKNOWN,
      errorCode: "EXIMBAY_RELEASED_ATTEMPT_OUTCOME_UNKNOWN",
    });
  });

  it("does not admit an arbitrary terminal payment as a released BF4 target", async () => {
    const providerOrderId = syntheticEximbayProviderOrderId();
    const terminal = await db.payment.create({
      data: {
        checkoutSessionId: fixture.sessionId,
        provider: PaymentProvider.EXIMBAY,
        mode: PaymentMode.SANDBOX,
        adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
        status: PaymentAttemptStatus.FAILED,
        attemptLifecycle: PaymentAttemptLifecycle.TERMINAL_FAILURE,
        amount: fixture.amount,
        currency: "USD",
        providerOrderId,
        idempotencyKey: `r11a-terminal-${randomUUID()}`,
        contactIntentAt: NOW,
        contactStartedAt: new Date(NOW.getTime() + 1),
        blockingEndedAt: new Date(NOW.getTime() + 2),
        errorCode: "TERMINAL_PROVIDER_FAILURE",
      },
      select: { id: true },
    });
    const transport = saleTransport({ ...fixture, paymentId: terminal.id, providerOrderId }, "terminal-sale");
    const result = await processEximbayBf4Status(db, {
      exactRawQuery: statusRaw({ ...fixture, paymentId: terminal.id, providerOrderId }, "terminal-sale"),
      receivedAt: CALLBACK_AT,
      modeCeiling: PaymentMode.SANDBOX,
      env: bf4Env(),
      transport,
      now: () => CALLBACK_AT,
    });
    expect(result).toMatchObject({ kind: "conflict" });
    expect(transport).not.toHaveBeenCalled();
    await expect(db.paymentEvent.count({
      where: { checkoutSessionId: fixture.sessionId, eventType: "EXIMBAY_BF4_STATUS" },
    })).resolves.toBe(0);
  });
});

async function createFixture(): Promise<Fixture> {
  const suffix = randomUUID().replaceAll("-", "");
  const userId = `r11a_user_${suffix}`;
  await db.market.upsert({
    where: { code: "US" },
    update: { currency: "USD", isActive: true },
    create: {
      code: "US",
      currency: "USD",
      shippableCountries: ["US"],
      defaultLocale: "en",
      isActive: true,
    },
  });
  await db.user.create({ data: { id: userId, email: `${userId}@example.test`, name: "R11A Buyer" } });
  const style = await db.wigStyle.create({
    data: {
      name: "R11A Style",
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      isActive: true,
      availableMarkets: { create: { marketCode: "US", isActive: true } },
    },
    select: { id: true },
  });
  const variant = await db.wigVariant.create({
    data: {
      wigStyleId: style.id,
      color: "Black",
      length: "Medium",
      curl: "Straight",
      price: 4999,
      stock: 3,
      sku: `R11A-${suffix}`,
      fulfillmentType: FulfillmentType.MTO,
      marketPrices: { create: { marketCode: "US", amount: 4999 } },
    },
    select: { id: true },
  });
  await db.cartItem.create({ data: { userId, wigStyleId: style.id, variantId: variant.id, quantity: 1 } });
  const session = await createCheckoutSession(db, {
    userId,
    marketCode: "US",
    communicationLocale: "en",
    shipping: {
      recipientName: "R11A Buyer",
      phone: "+1-555-0100",
      country: ShippingCountry.US,
      postalCode: "10001",
      administrativeArea: "NY",
      city: "New York",
      addressLine1: "1 Recovery Street",
    },
    now: NOW,
  });
  const providerOrderId = syntheticEximbayProviderOrderId();
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.sessionId,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: PaymentAttemptLifecycle.CONTACTED,
      amount: session.totalAmount,
      currency: session.currency,
      providerOrderId,
      idempotencyKey: `r11a-idem-${suffix}`,
      contactIntentAt: NOW,
      contactStartedAt: new Date(NOW.getTime() + 1),
      initiationOutputKind: PaymentInitiationOutputKind.READY,
      initiationCompletedAt: new Date(NOW.getTime() + 2),
    },
    select: { id: true },
  });
  return {
    userId,
    styleId: style.id,
    variantId: variant.id,
    sessionId: session.sessionId,
    paymentId: payment.id,
    providerOrderId,
    amount: session.totalAmount,
  };
}

async function createSuccessor(fixture: Fixture, contacted: boolean) {
  const now = new Date(RECOVERY_AT.getTime() + 1);
  return db.payment.create({
    data: {
      checkoutSessionId: fixture.sessionId,
      provider: PaymentProvider.EXIMBAY,
      mode: PaymentMode.SANDBOX,
      adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
      routingRuleId: "r11a.successor",
      status: PaymentAttemptStatus.INITIATED,
      attemptLifecycle: contacted
        ? PaymentAttemptLifecycle.CONTACTED
        : PaymentAttemptLifecycle.CONTACT_AUTHORIZED,
      amount: fixture.amount,
      currency: "USD",
      providerOrderId: syntheticEximbayProviderOrderId(),
      idempotencyKey: `r11a-successor-${randomUUID()}`,
      contactIntentAt: now,
      contactStartedAt: contacted ? new Date(now.getTime() + 1) : null,
      ...(contacted ? {
        initiationOutputKind: PaymentInitiationOutputKind.READY,
        initiationCompletedAt: new Date(now.getTime() + 2),
      } : {}),
    },
    select: { id: true, providerOrderId: true },
  });
}

async function release(fixture: Fixture): Promise<void> {
  await expect(recoverEximbayCheckout(db, recoveryInput(fixture, q004Transport())))
    .resolves.toMatchObject({ kind: "released" });
}

function recoveryInput(
  fixture: Fixture,
  transport: EximbayBf4Fetch,
  env: Readonly<Record<string, string | undefined>> = RECOVERY_ENV,
) {
  return {
    checkoutSessionId: fixture.sessionId,
    paymentId: fixture.paymentId,
    authenticatedUserId: fixture.userId,
    env,
    transport,
    now: () => RECOVERY_AT,
  } as const;
}

function contactedRoleDependencies() {
  return {
    ...defaultEximbayP3eDatabaseBootstrapDependencies,
    verifyExactLedger: () => Promise.resolve(),
  };
}

function restrictedRecoveryClient(adminUrl: string): PrismaClient {
  const url = new URL(adminUrl);
  url.username = "mira_refund_canary";
  url.password = RESTRICTED_ROLE_PASSWORD;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString() }) });
}

async function reconciliationPrivilegeResidue(admin: Client) {
  const result = await admin.query<{
    checkoutSessionIdUpdate: boolean;
    paymentEventSelect: boolean;
    paymentEventInsert: boolean;
    paymentBlockingEndedAtUpdate: boolean;
  }>(`
    SELECT
      has_column_privilege(
        'mira_refund_canary', 'public."CheckoutSession"', 'id', 'UPDATE'
      ) AS "checkoutSessionIdUpdate",
      has_table_privilege(
        'mira_refund_canary', 'public."PaymentEvent"', 'SELECT'
      ) AS "paymentEventSelect",
      has_table_privilege(
        'mira_refund_canary', 'public."PaymentEvent"', 'INSERT'
      ) AS "paymentEventInsert",
      has_column_privilege(
        'mira_refund_canary', 'public."Payment"', 'blockingEndedAt', 'UPDATE'
      ) AS "paymentBlockingEndedAtUpdate"
  `);
  const row = result.rows[0];
  if (!row) throw new Error("CONTACTED_RECONCILIATION_PRIVILEGE_READ_FAILED");
  return row;
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  const url = new URL(value);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("LOCAL_DATABASE_REQUIRED");
  }
  if (url.pathname !== "/wig_platform_test") throw new Error("WIG_PLATFORM_TEST_REQUIRED");
  return value;
}

function q004Transport() {
  return vi.fn<EximbayBf4Fetch>(() => Promise.resolve(
    jsonResponse(realCanaryObservedQ004Envelope("not observed")),
  ));
}

function realCanaryObservedQ004Envelope(resmsg: string): Record<string, unknown> {
  // Root member names and Q004 are canary evidence; optional field values are synthetic and ignored.
  return {
    card_info: null,
    mid: 7,
    other_param: ["synthetic"],
    payment: "synthetic",
    rescode: "Q004",
    resmsg,
  };
}

function transactionObservedTransport() {
  return vi.fn<EximbayBf4Fetch>(() => Promise.resolve(
    jsonResponse({ rescode: "0000", resmsg: "observed", mid: MID, payment: {} }),
  ));
}

async function processSale(fixture: Fixture, transactionId: string) {
  return processEximbayBf4Status(db, {
    exactRawQuery: statusRaw(fixture, transactionId),
    receivedAt: CALLBACK_AT,
    modeCeiling: PaymentMode.SANDBOX,
    env: bf4Env(),
    transport: saleTransport(fixture, transactionId),
    now: () => CALLBACK_AT,
  });
}

function saleTransport(fixture: Fixture, transactionId: string) {
  return vi.fn<EximbayBf4Fetch>((input) => Promise.resolve(
    fetchInputUrl(input).endsWith("/verify")
      ? jsonResponse({ rescode: "0000", resmsg: "verified" })
      : jsonResponse({
          rescode: "0000",
          resmsg: "retrieved",
          mid: MID,
          payment: {
            order_id: fixture.providerOrderId,
            currency: "USD",
            amount: amountWire(fixture.amount),
            transaction_id: transactionId,
            status: "SALE",
            transaction_date: "20260825010600",
          },
        }),
  ));
}

function fetchInputUrl(input: Parameters<EximbayBf4Fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function statusRaw(fixture: Fixture, transactionId: string): string {
  return [
    "transaction_type=PAYMENT",
    `mid=${MID}`,
    `order_id=${fixture.providerOrderId}`,
    "currency=USD",
    `amount=${amountWire(fixture.amount)}`,
    "rescode=0000",
    "resmsg=Success",
    "fgkey=synthetic-status-only",
    `transaction_id=${transactionId}`,
  ].join("&");
}

function bf4Env() {
  return { EXIMBAY_SANDBOX_MID: MID, EXIMBAY_SANDBOX_API_KEY: API_KEY };
}

function amountWire(amount: number): string {
  const digits = String(amount).padStart(3, "0");
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

function pauseBeforeFirstBf4Transaction(
  observed: ReturnType<typeof deferred<void>>,
  resume: ReturnType<typeof deferred<void>>,
) {
  const transaction = db.$transaction.bind(db);
  const transactionSpy = vi.spyOn(db, "$transaction");
  transactionSpy.mockImplementation(transaction);
  transactionSpy.mockImplementationOnce(async (operation) => {
    observed.resolve();
    await resume.promise;
    return transaction(operation);
  });
  return transactionSpy;
}

function eximbayAdapterContext(): ProviderFactoryContext {
  return {
    provider: PaymentProvider.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    market: "US",
    method: PaymentMethod.CARD,
    currency: "USD",
    ruleId: "r11a.stale-correlation.retry-block",
    credentials: [],
    liveGuard: { kind: "blocked", liveEnabled: false, reason: "test-only dormant direct seam" },
  };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  const payments = await db.payment.findMany({
    where: { checkoutSessionId: fixture.sessionId },
    select: { providerPaymentKey: true },
  });
  const keys = payments.flatMap((payment) => payment.providerPaymentKey ? [payment.providerPaymentKey] : []);
  await db.paymentOutbox.deleteMany({
    where: { dedupKey: { in: keys.map((key) => `payment-remediation:EXIMBAY:${key}`) } },
  });
  await db.paymentEvent.deleteMany({ where: { checkoutSessionId: fixture.sessionId } });
  const order = await db.order.findUnique({ where: { checkoutSessionId: fixture.sessionId }, select: { id: true } });
  if (order) {
    const items = await db.orderItem.findMany({ where: { orderId: order.id }, select: { id: true } });
    await db.manufacturingRequest.deleteMany({ where: { orderItemId: { in: items.map((item) => item.id) } } });
    await db.orderItem.deleteMany({ where: { orderId: order.id } });
    await db.orderShipping.deleteMany({ where: { orderId: order.id } });
    await db.order.delete({ where: { id: order.id } });
  }
  await db.payment.deleteMany({ where: { checkoutSessionId: fixture.sessionId } });
  await db.checkoutSessionLine.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSessionShipping.deleteMany({ where: { sessionId: fixture.sessionId } });
  await db.checkoutSession.deleteMany({ where: { id: fixture.sessionId } });
  await db.cartItem.deleteMany({ where: { userId: fixture.userId } });
  await db.variantMarketPrice.deleteMany({ where: { variantId: fixture.variantId } });
  await db.wigVariant.deleteMany({ where: { id: fixture.variantId } });
  await db.wigStyle.deleteMany({ where: { id: fixture.styleId } });
  await db.user.deleteMany({ where: { id: fixture.userId } });
}
