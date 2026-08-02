import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CheckoutSessionStatus,
  OrderStatus,
  PaymentAttemptLifecycle,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  Prisma,
  RefundAttemptActorType,
  RefundAttemptStatus,
  RefundExecutionCommandEventType,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
  ShippingCountry,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

const MARKET_CODE = "KR";
const NOW = new Date("2026-07-11T02:45:00.000Z");
const VALID_TOKEN_HASH = "a".repeat(64);
const E2A_MIGRATION_PATH = join(
  process.cwd(),
  "prisma/migrations/20260716090000_e2a_refund_execution_lease_fence/migration.sql",
);
const E2B1_MIGRATION_PATH = join(
  process.cwd(),
  "prisma/migrations/20260716160000_e2b1_refund_execution_command_events/migration.sql",
);
const E3A_MIGRATION_PATH = join(
  process.cwd(),
  "prisma/migrations/20260716190000_e3a_refund_dispatch_authorization/migration.sql",
);

interface TestContext {
  userId: string;
  orderId: string;
  paymentId: string;
  sessionId: string;
  refundAttemptId: string;
}

describe("refund execution schema", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createFixture();
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it("owns at most one command per attempt and exposes both relation directions", async () => {
    const command = await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId),
      include: { refundAttempt: true },
    });
    const attempt = await db.refundAttempt.findUniqueOrThrow({
      where: { id: ctx.refundAttemptId },
      include: { executionCommand: true },
    });

    expect(command.refundAttempt.id).toBe(ctx.refundAttemptId);
    expect(attempt.executionCommand?.id).toBe(command.id);

    await expectPrismaCode(
      db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) }),
      "P2002",
    );
  });

  it("uses truthful READY lease-fence defaults", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    expect(command).toMatchObject({
      status: RefundExecutionCommandStatus.READY,
      leaseOwner: null,
      leaseUntil: null,
      leaseGeneration: 0,
      leaseTokenHash: null,
      dispatchAttempt: 0,
    });
  });

  it.each([
    {
      label: "negative dispatch ordinal",
      override: { dispatchAttempt: -1 },
      constraint: "RefundExecutionCommand_dispatch_attempt_nonnegative_check",
    },
    {
      label: "LEASED without owner",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: VALID_TOKEN_HASH,
      },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "LEASED without deadline",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseGeneration: 1,
        leaseTokenHash: VALID_TOKEN_HASH,
      },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "LEASED without token hash",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        leaseGeneration: 1,
      },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "LEASED with generation zero",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        leaseTokenHash: VALID_TOKEN_HASH,
      },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "blank lease owner",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "   ",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: VALID_TOKEN_HASH,
      },
      constraint: "RefundExecutionCommand_lease_owner_nonblank_check",
    },
    {
      label: "token hash with non-hex characters",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: `${"a".repeat(63)}g`,
      },
      constraint: "RefundExecutionCommand_lease_token_hash_format_check",
    },
    {
      label: "uppercase token hash",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: "A".repeat(64),
      },
      constraint: "RefundExecutionCommand_lease_token_hash_format_check",
    },
    {
      label: "wrong-length token hash",
      override: {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: "a".repeat(63),
      },
      constraint: "RefundExecutionCommand_lease_token_hash_format_check",
    },
    {
      label: "non-LEASED with owner",
      override: { leaseOwner: "worker-1" },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "non-LEASED with deadline",
      override: { leaseUntil: NOW },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "non-LEASED with token hash",
      override: { leaseTokenHash: VALID_TOKEN_HASH },
      constraint: "RefundExecutionCommand_lease_status_coherence_check",
    },
    {
      label: "negative lease generation",
      override: { leaseGeneration: -1 },
      constraint: "RefundExecutionCommand_lease_generation_nonnegative_check",
    },
    {
      label: "blank safe error code",
      override: { lastSafeErrorCode: "   " },
      constraint: "RefundExecutionCommand_last_safe_error_code_nonblank_check",
    },
    {
      label: "blank safe error message",
      override: { lastSafeErrorMessage: "   " },
      constraint: "RefundExecutionCommand_last_safe_error_message_nonblank_check",
    },
  ])("rejects an incoherent command: $label", async ({ override, constraint }) => {
    await expectConstraint(
      db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId, override) }),
      constraint,
    );
  });

  it("accepts a coherent LEASED command with dispatch ordinal zero", async () => {
    const command = await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId, {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "worker-1",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: VALID_TOKEN_HASH,
        dispatchAttempt: 0,
      }),
    });

    expect(command).toMatchObject({
      status: RefundExecutionCommandStatus.LEASED,
      leaseOwner: "worker-1",
      leaseUntil: NOW,
      leaseGeneration: 1,
      leaseTokenHash: VALID_TOKEN_HASH,
      dispatchAttempt: 0,
    });
  });

  it.each([
    RefundExecutionCommandStatus.DONE,
    RefundExecutionCommandStatus.WAITING_EVIDENCE,
    RefundExecutionCommandStatus.PARKED,
    RefundExecutionCommandStatus.READY,
  ])("rejects token residue on non-LEASED status %s", async (status) => {
    await expectConstraint(
      db.refundExecutionCommand.create({
        data: commandData(ctx.refundAttemptId, { status, leaseTokenHash: VALID_TOKEN_HASH }),
      }),
      "RefundExecutionCommand_lease_status_coherence_check",
    );
  });

  it("executes the migration preflight and rejects a pre-existing LEASED row", async () => {
    await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId, {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "preflight-worker",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: VALID_TOKEN_HASH,
      }),
    });
    const migration = readFileSync(E2A_MIGRATION_PATH, "utf8");
    const preflight = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
    if (!preflight) throw new Error("E2A migration preflight block was not found.");

    await expectConstraint(
      db.$executeRawUnsafe(preflight),
      "Refund execution lease fence migration requires zero pre-existing LEASED commands.",
    );
  });

  it("stores both command-event types for one generation with truthful timestamps", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    const acquired = await db.refundExecutionCommandEvent.create({
      data: commandEventData(command.id, RefundExecutionCommandEventType.LEASE_ACQUIRED),
    });
    const released = await db.refundExecutionCommandEvent.create({
      data: commandEventData(command.id, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED),
    });

    expect(acquired.eventType).toBe(RefundExecutionCommandEventType.LEASE_ACQUIRED);
    expect(released.eventType).toBe(RefundExecutionCommandEventType.PRE_CONTACT_RELEASED);
    expect(acquired.leaseGeneration).toBe(1);
    expect(acquired.dispatchAttempt).toBe(0);
    expect(acquired.occurredAt).toEqual(NOW);
    expect(acquired.createdAt).toBeInstanceOf(Date);
  });

  it.each([
    { label: "zero generation", leaseGeneration: 0, constraint: "RefundExecutionCommandEvent_lease_generation_positive_check" },
    { label: "negative generation", leaseGeneration: -1, constraint: "RefundExecutionCommandEvent_lease_generation_positive_check" },
    { label: "negative dispatch ordinal", dispatchAttempt: -1, constraint: "RefundExecutionCommandEvent_dispatch_attempt_nonnegative_check" },
  ])("rejects command event with $label", async ({ leaseGeneration = 1, dispatchAttempt = 0, constraint }) => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    await expectConstraint(
      db.refundExecutionCommandEvent.create({
        data: commandEventData(command.id, RefundExecutionCommandEventType.LEASE_ACQUIRED, {
          leaseGeneration,
          dispatchAttempt,
        }),
      }),
      constraint,
    );
  });

  it("rejects duplicate event types but accepts the other type for the same command generation", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    await db.refundExecutionCommandEvent.create({
      data: commandEventData(command.id, RefundExecutionCommandEventType.LEASE_ACQUIRED),
    });
    await expectPrismaCode(
      db.refundExecutionCommandEvent.create({
        data: commandEventData(command.id, RefundExecutionCommandEventType.LEASE_ACQUIRED),
      }),
      "P2002",
    );
    await db.refundExecutionCommandEvent.create({
      data: commandEventData(command.id, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED),
    });
    await expectPrismaCode(
      db.refundExecutionCommandEvent.create({
        data: commandEventData(command.id, RefundExecutionCommandEventType.PRE_CONTACT_RELEASED),
      }),
      "P2002",
    );

    await expect(db.refundExecutionCommandEvent.count({ where: { commandId: command.id } })).resolves.toBe(2);
  });

  it("requires occurredAt and restricts command deletion while an event exists", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    await expectConstraint(
      db.$executeRaw(Prisma.sql`
        INSERT INTO "RefundExecutionCommandEvent"
          ("id", "commandId", "eventType", "leaseGeneration", "dispatchAttempt")
        VALUES
          (${`event_${randomUUID()}`}, ${command.id}, 'LEASE_ACQUIRED', 1, 0)
      `),
      "occurredAt",
    );
    await db.refundExecutionCommandEvent.create({
      data: commandEventData(command.id, RefundExecutionCommandEventType.LEASE_ACQUIRED),
    });
    await expectConstraint(
      db.refundExecutionCommand.delete({ where: { id: command.id } }),
      "RefundExecutionCommandEvent_commandId_fkey",
    );
  });

  it("keeps the command-event ledger free of secret, owner, provider, and customer columns", async () => {
    const columns = await db.$queryRaw<{ columnName: string }[]>(Prisma.sql`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'RefundExecutionCommandEvent'
      ORDER BY ordinal_position
    `);
    const names = columns.map((column) => column.columnName);

    expect(names).toEqual([
      "id",
      "commandId",
      "eventType",
      "leaseGeneration",
      "dispatchAttempt",
      "occurredAt",
      "createdAt",
    ]);
    expect(names.some((name) => /token|digest|owner|provider|customer|actor|operation/i.test(name))).toBe(false);
  });

  it("allows a pristine E2A-era database to pass the E2B1 preflight", async () => {
    await expect(runE2B1Preflight()).resolves.toBeUndefined();
  });

  it("blocks E2B1 migration preflight when a LEASED command exists", async () => {
    await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId, {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "preflight-worker",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: VALID_TOKEN_HASH,
      }),
    });

    await expectConstraint(runE2B1Preflight(), "requires zero LEASED commands");
  });

  it("blocks E2B1 migration preflight when a positive dispatch ordinal exists", async () => {
    await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId, { dispatchAttempt: 1 }),
    });

    await expectConstraint(runE2B1Preflight(), "requires zero positive dispatch ordinals");
  });

  it("blocks E2B1 migration preflight when execution evidence exists", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    await db.refundExecutionEvidence.create({ data: evidenceData(command.id) });

    await expectConstraint(runE2B1Preflight(), "requires zero execution evidence rows");
  });

  it("stores evidence under its command, deduplicates globally, and restricts parent deletion", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    const sourceDedupKey = `refund-result:${command.id}:1`;
    const evidence = await db.refundExecutionEvidence.create({
      data: evidenceData(command.id, { sourceDedupKey }),
      include: { command: { include: { refundAttempt: true } } },
    });

    expect(evidence.command.refundAttempt.id).toBe(ctx.refundAttemptId);
    await expectPrismaCode(
      db.refundExecutionEvidence.create({ data: evidenceData(command.id, { sourceDedupKey }) }),
      "P2002",
    );
    await expectConstraint(
      db.refundExecutionCommand.delete({ where: { id: command.id } }),
      "RefundExecutionEvidence_commandId_fkey",
    );
    await expectConstraint(
      db.refundAttempt.delete({ where: { id: ctx.refundAttemptId } }),
      "RefundExecutionCommand_refundAttemptId_fkey",
    );
  });

  it.each([
    {
      label: "amount without currency",
      override: { reportedAmount: 1_000 },
      constraint: "RefundExecutionEvidence_reported_pair_check",
    },
    {
      label: "currency without amount",
      override: { reportedCurrency: "KRW" },
      constraint: "RefundExecutionEvidence_reported_pair_check",
    },
    {
      label: "zero amount",
      override: { reportedAmount: 0, reportedCurrency: "KRW" },
      constraint: "RefundExecutionEvidence_reported_amount_positive_check",
    },
    {
      label: "negative amount",
      override: { reportedAmount: -1, reportedCurrency: "KRW" },
      constraint: "RefundExecutionEvidence_reported_amount_positive_check",
    },
    {
      label: "lowercase currency",
      override: { reportedAmount: 1, reportedCurrency: "krw" },
      constraint: "RefundExecutionEvidence_reported_currency_format_check",
    },
    {
      label: "malformed currency",
      override: { reportedAmount: 1, reportedCurrency: "KR" },
      constraint: "RefundExecutionEvidence_reported_currency_format_check",
    },
    {
      label: "blank source dedup key",
      override: { sourceDedupKey: "   " },
      constraint: "RefundExecutionEvidence_source_dedup_key_nonblank_check",
    },
    {
      label: "blank observed provider refund id",
      override: { observedProviderRefundId: "   " },
      constraint: "RefundExecutionEvidence_provider_refund_id_nonblank_check",
    },
    {
      label: "blank safe code",
      override: { safeCode: "   " },
      constraint: "RefundExecutionEvidence_safe_code_nonblank_check",
    },
    {
      label: "blank safe message",
      override: { safeMessage: "   " },
      constraint: "RefundExecutionEvidence_safe_message_nonblank_check",
    },
  ])("rejects invalid normalized evidence: $label", async ({ override, constraint }) => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    await expectConstraint(
      db.refundExecutionEvidence.create({ data: evidenceData(command.id, override) }),
      constraint,
    );
  });

  it("accepts evidence with both reported financial fields absent", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    const evidence = await db.refundExecutionEvidence.create({ data: evidenceData(command.id) });

    expect(evidence).toMatchObject({ reportedAmount: null, reportedCurrency: null });
  });

  it("accepts positive uppercase reported pairs without enforcing expected-value equality", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    const [matching, mismatched] = await Promise.all([
      db.refundExecutionEvidence.create({
        data: evidenceData(command.id, {
          sourceDedupKey: `refund-result:${command.id}:1`,
          reportedAmount: 1_000,
          reportedCurrency: "KRW",
        }),
      }),
      db.refundExecutionEvidence.create({
        data: evidenceData(command.id, {
          sourceDedupKey: `refund-result:${command.id}:2`,
          reportedAmount: 999,
          reportedCurrency: "USD",
          application: RefundExecutionEvidenceApplication.CONFLICT,
        }),
      }),
    ]);

    expect(matching).toMatchObject({ reportedAmount: 1_000, reportedCurrency: "KRW" });
    expect(mismatched).toMatchObject({
      reportedAmount: 999,
      reportedCurrency: "USD",
      application: RefundExecutionEvidenceApplication.CONFLICT,
    });
  });

  it("installs the exact dispatch-attempt enum values and columns", async () => {
    const enumValues = await db.$queryRaw<{ value: string }[]>(Prisma.sql`
      SELECT enumlabel AS value
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'RefundExecutionDispatchAttemptState'
      ORDER BY enumsortorder
    `);
    const columns = await db.$queryRaw<{ columnName: string }[]>(Prisma.sql`
      SELECT column_name AS "columnName"
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'RefundExecutionDispatchAttempt'
      ORDER BY ordinal_position
    `);

    expect(enumValues.map((row) => row.value)).toEqual([
      "AUTHORIZED",
      "CONTACT_MAY_HAVE_OCCURRED",
    ]);
    expect(columns.map((row) => row.columnName)).toEqual([
      "id",
      "commandId",
      "ordinal",
      "leaseGeneration",
      "provider",
      "mode",
      "providerOperationKey",
      "requestFingerprint",
      "state",
      "authorizedAt",
      "contactMarkedAt",
      "createdAt",
    ]);
  });

  it.each([
    {
      label: "nonpositive ordinal",
      override: { ordinal: 0 },
      constraint: "RefundExecutionDispatchAttempt_ordinal_positive_check",
    },
    {
      label: "nonpositive generation",
      override: { leaseGeneration: 0 },
      constraint: "RefundExecutionDispatchAttempt_lease_generation_positive_check",
    },
    {
      label: "blank operation key",
      override: { providerOperationKey: "   " },
      constraint: "RefundExecutionDispatchAttempt_provider_operation_key_nonblank_",
    },
    {
      label: "malformed fingerprint",
      override: { requestFingerprint: "A".repeat(64) },
      constraint: "RefundExecutionDispatchAttempt_request_fingerprint_format_check",
    },
    {
      label: "AUTHORIZED with contact timestamp",
      override: { contactMarkedAt: NOW },
      constraint: "RefundExecutionDispatchAttempt_state_contact_coherence_check",
    },
    {
      label: "contacted state without timestamp",
      override: { state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED },
      constraint: "RefundExecutionDispatchAttempt_state_contact_coherence_check",
    },
    {
      label: "contact timestamp before authorization",
      override: {
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        contactMarkedAt: new Date(NOW.getTime() - 1),
      },
      constraint: "RefundExecutionDispatchAttempt_state_contact_coherence_check",
    },
  ])("rejects dispatch attempt with $label", async ({ override, constraint }) => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });

    await expectConstraint(
      db.refundExecutionDispatchAttempt.create({ data: dispatchAttemptData(command.id, override) }),
      constraint,
    );
  });

  it("enforces one row per command ordinal and restricts command deletion", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    await db.refundExecutionDispatchAttempt.create({ data: dispatchAttemptData(command.id) });

    await expectPrismaCode(
      db.refundExecutionDispatchAttempt.create({ data: dispatchAttemptData(command.id) }),
      "P2002",
    );
    await expectConstraint(
      db.refundExecutionCommand.delete({ where: { id: command.id } }),
      "RefundExecutionDispatchAttempt_commandId_fkey",
    );
  });

  it("uses RESTRICT deletion and CASCADE parent-key update semantics", async () => {
    const rules = await db.$queryRaw<{ deleteRule: string; updateRule: string }[]>(Prisma.sql`
      SELECT delete_rule AS "deleteRule", update_rule AS "updateRule"
      FROM information_schema.referential_constraints
      WHERE constraint_schema = 'public'
        AND constraint_name = 'RefundExecutionDispatchAttempt_commandId_fkey'
    `);

    expect(rules.length).toBe(1);
    expect(rules[0].deleteRule).toBe("RESTRICT");
    expect(rules[0].updateRule).toBe("CASCADE");
  });

  it("adds no dispatch backfill and leaves a READY ordinal-zero command unchanged", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    const migration = readFileSync(E3A_MIGRATION_PATH, "utf8");
    const hasBackfillStatement = /(?:INSERT\s+INTO|UPDATE)\s+"RefundExecutionDispatchAttempt"/i
      .test(migration);
    const dispatchCount = await db.refundExecutionDispatchAttempt.count({
      where: { commandId: command.id },
    });
    const current = await db.refundExecutionCommand.findUniqueOrThrow({ where: { id: command.id } });

    expect(hasBackfillStatement).toBe(false);
    expect(dispatchCount).toBe(0);
    expect(current.status).toBe(RefundExecutionCommandStatus.READY);
    expect(current.dispatchAttempt).toBe(0);
  });

  it("allows pristine state to pass the E3A preflight", async () => {
    await expect(runE3APreflight()).resolves.toBeUndefined();
  });

  it("blocks E3A preflight for a LEASED command", async () => {
    await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId, {
        status: RefundExecutionCommandStatus.LEASED,
        leaseOwner: "preflight-worker",
        leaseUntil: NOW,
        leaseGeneration: 1,
        leaseTokenHash: VALID_TOKEN_HASH,
      }),
    });

    await expectConstraint(
      runE3APreflight(),
      "Refund dispatch-attempt migration requires zero pre-existing LEASED commands.",
    );
  });

  it("blocks E3A preflight for a positive dispatch ordinal", async () => {
    await db.refundExecutionCommand.create({
      data: commandData(ctx.refundAttemptId, { dispatchAttempt: 1 }),
    });

    await expectConstraint(
      runE3APreflight(),
      "Refund dispatch-attempt migration requires zero positive dispatch ordinals.",
    );
  });

  it("blocks E3A preflight for execution evidence", async () => {
    const command = await db.refundExecutionCommand.create({ data: commandData(ctx.refundAttemptId) });
    await db.refundExecutionEvidence.create({ data: evidenceData(command.id) });

    await expectConstraint(
      runE3APreflight(),
      "Refund dispatch-attempt migration requires zero execution evidence rows.",
    );
  });

  it("blocks E3A preflight for a provider refund identity", async () => {
    await db.refundAttempt.update({
      where: { id: ctx.refundAttemptId },
      data: { providerRefundId: `schema_preflight_${randomUUID()}` },
    });

    await expectConstraint(
      runE3APreflight(),
      "Refund dispatch-attempt migration requires zero provider refund identities.",
    );
  });
});

function commandData(
  refundAttemptId: string,
  override: Partial<Prisma.RefundExecutionCommandUncheckedCreateInput> = {},
): Prisma.RefundExecutionCommandUncheckedCreateInput {
  return {
    refundAttemptId,
    availableAt: NOW,
    ...override,
  };
}

function evidenceData(
  commandId: string,
  override: Partial<Prisma.RefundExecutionEvidenceUncheckedCreateInput> = {},
): Prisma.RefundExecutionEvidenceUncheckedCreateInput {
  return {
    commandId,
    source: RefundExecutionEvidenceSource.ADAPTER_RESPONSE,
    sourceDedupKey: `refund-result:${commandId}:${randomUUID()}`,
    outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
    application: RefundExecutionEvidenceApplication.PARKED,
    observedAt: NOW,
    ...override,
  };
}

function dispatchAttemptData(
  commandId: string,
  override: Partial<Prisma.RefundExecutionDispatchAttemptUncheckedCreateInput> = {},
): Prisma.RefundExecutionDispatchAttemptUncheckedCreateInput {
  return {
    commandId,
    ordinal: 1,
    leaseGeneration: 1,
    provider: PaymentProvider.MOCK,
    mode: PaymentMode.SANDBOX,
    providerOperationKey: `refund-operation-${randomUUID()}`,
    requestFingerprint: "b".repeat(64),
    state: RefundExecutionDispatchAttemptState.AUTHORIZED,
    authorizedAt: NOW,
    ...override,
  };
}

function commandEventData(
  commandId: string,
  eventType: RefundExecutionCommandEventType,
  override: Partial<Prisma.RefundExecutionCommandEventUncheckedCreateInput> = {},
): Prisma.RefundExecutionCommandEventUncheckedCreateInput {
  return {
    commandId,
    eventType,
    leaseGeneration: 1,
    dispatchAttempt: 0,
    occurredAt: NOW,
    ...override,
  };
}

async function runE2B1Preflight(): Promise<void> {
  const migration = readFileSync(E2B1_MIGRATION_PATH, "utf8");
  const preflight = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
  if (!preflight) throw new Error("E2B1 migration preflight block was not found.");
  await db.$executeRawUnsafe(preflight);
}

async function runE3APreflight(): Promise<void> {
  const migration = readFileSync(E3A_MIGRATION_PATH, "utf8");
  const preflight = migration.match(/DO \$\$[\s\S]*?\$\$;/)?.[0];
  if (!preflight) throw new Error("E3A migration preflight block was not found.");
  await db.$executeRawUnsafe(preflight);
}

async function expectConstraint(promise: Promise<unknown>, constraint: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(errorDetails(error)).toContain(constraint);
    return;
  }
  throw new Error(`Expected database constraint ${constraint} to reject the write.`);
}

async function expectPrismaCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected Prisma error ${code}.`);
}

function errorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.message}\n${JSON.stringify(error.meta)}`;
  }
  return error.message;
}

async function createFixture(): Promise<TestContext> {
  const identity = randomUUID();
  const userId = `refund_execution_schema_${identity}`;
  await ensureMarket();
  await db.user.create({ data: { id: userId, email: `${userId}@example.test` } });
  const session = await db.checkoutSession.create({
    data: {
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      status: CheckoutSessionStatus.COMPLETED,
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      expiresAt: new Date(NOW.getTime() + 30 * 60_000),
      completedAt: NOW,
    },
  });
  const payment = await db.payment.create({
    data: {
      checkoutSessionId: session.id,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      status: PaymentAttemptStatus.SUCCEEDED,
      attemptLifecycle: PaymentAttemptLifecycle.FINALIZED,
      amount: 1_000,
      currency: "KRW",
      providerPaymentKey: `provider_payment_${identity}`,
      financialSucceededAt: NOW,
      blockingEndedAt: NOW,
      idempotencyKey: `payment_idem_${identity}`,
    },
  });
  const order = await db.order.create({
    data: {
      checkoutSessionId: session.id,
      paymentId: payment.id,
      userId,
      marketCode: MARKET_CODE,
      currency: "KRW",
      subtotalAmount: 1_000,
      shippingAmount: 0,
      totalAmount: 1_000,
      status: OrderStatus.REFUND_PENDING,
      paidAt: NOW,
    },
  });
  const refundAttempt = await db.refundAttempt.create({
    data: {
      orderId: order.id,
      paymentId: payment.id,
      amount: 1_000,
      currency: "KRW",
      status: RefundAttemptStatus.PROCESSING,
      reason: "Schema constraint fixture",
      actorType: RefundAttemptActorType.SYSTEM,
      provider: PaymentProvider.MOCK,
      mode: PaymentMode.SANDBOX,
      idempotencyKey: `refund:${payment.id}:${identity}`,
      requestedAt: NOW,
    },
  });
  return {
    userId,
    orderId: order.id,
    paymentId: payment.id,
    sessionId: session.id,
    refundAttemptId: refundAttempt.id,
  };
}

async function ensureMarket(): Promise<void> {
  await db.market.upsert({
    where: { code: MARKET_CODE },
    update: {
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
    create: {
      code: MARKET_CODE,
      currency: "KRW",
      shippableCountries: [ShippingCountry.KR],
      defaultLocale: "ko",
      isActive: true,
    },
  });
}

async function cleanup(context: TestContext): Promise<void> {
  const commands = await db.refundExecutionCommand.findMany({
    where: { refundAttemptId: context.refundAttemptId },
    select: { id: true },
  });
  const commandIds = commands.map((command) => command.id);
  await db.refundExecutionDispatchAttempt.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommandEvent.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionEvidence.deleteMany({ where: { commandId: { in: commandIds } } });
  await db.refundExecutionCommand.deleteMany({ where: { id: { in: commandIds } } });
  await db.refundAttemptTransition.deleteMany({ where: { refundAttemptId: context.refundAttemptId } });
  await db.refundAttempt.deleteMany({ where: { id: context.refundAttemptId } });
  await db.order.deleteMany({ where: { id: context.orderId } });
  await db.payment.deleteMany({ where: { id: context.paymentId } });
  await db.checkoutSession.deleteMany({ where: { id: context.sessionId } });
  await db.user.deleteMany({ where: { id: context.userId } });
}
