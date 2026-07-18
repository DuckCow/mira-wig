import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { canonicalJson } from "./canonical-json";

export const DATABASE_INVARIANT_POSTGRES_VERSION_UNSUPPORTED = "DATABASE_INVARIANT_POSTGRES_VERSION_UNSUPPORTED";
export const DATABASE_CHECK_INVARIANTS_INVALID = "DATABASE_CHECK_INVARIANTS_INVALID";
export const DATABASE_PARTIAL_INDEX_INVARIANT_INVALID = "DATABASE_PARTIAL_INDEX_INVARIANT_INVALID";
export const DATABASE_INVARIANT_MANIFEST_INVALID = "DATABASE_INVARIANT_MANIFEST_INVALID";
export const EXPECTED_CHECK_INVARIANT_COUNT = 65;
export const EXPECTED_CHECK_MANIFEST_SHA256 = "4bee2cdcfa34213cdd5c3d319da6273aa59361454174bf07cd8a0c9ce5cd97d3";

const PINNED_CHECK_TABLES = Object.freeze([
  "CustomerRefundIntake", "RefundAttemptTransition", "RefundExecutionCommand",
  "RefundExecutionCommandEvent", "RefundExecutionDispatchAttempt", "RefundExecutionEvidence",
  "RefundExecutionProviderContactEligibilityProof", "RefundExecutionProviderEligibilityProof",
  "RefundExecutionProviderOperationBinding",
] as const);

type PinnedCheckTable = typeof PINNED_CHECK_TABLES[number];

export type CheckInvariant = Readonly<{
  schemaName: "public"; tableName: PinnedCheckTable; constraintName: string;
  constraintType: "c"; canonicalDefinition: string; validated: true;
}>;

export type CatalogCheckRow = Readonly<{
  schemaName: string; tableName: string; constraintName: string;
  constraintType: string; definition: string; validated: boolean;
}>;

export type PartialIndexInvariant = Readonly<{
  schemaName: "public"; tableName: "CustomerRefundIntake";
  indexName: "CustomerRefundIntake_orderId_submitted_key";
  unique: true; valid: true; ready: true; orderedExpressions: readonly string[];
  canonicalPredicate: string; canonicalDefinition: string;
}>;

export type CatalogPartialIndexRow = Readonly<{
  schemaName: string; tableName: string; indexName: string;
  unique: boolean; valid: boolean; ready: boolean; orderedExpressions: readonly string[];
  predicate: string | null; definition: string;
}>;

export type DatabaseInvariantCatalog = Readonly<{
  serverVersionNum: number; checks: readonly CatalogCheckRow[];
  partialIndexes: readonly CatalogPartialIndexRow[];
}>;

export type DatabaseInvariantQueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

export const EXPECTED_CHECK_COUNTS_BY_TABLE: Readonly<Record<PinnedCheckTable, number>> =
  Object.freeze({
    CustomerRefundIntake: 8,
    RefundAttemptTransition: 5,
    RefundExecutionCommand: 7,
    RefundExecutionCommandEvent: 2,
    RefundExecutionDispatchAttempt: 5,
    RefundExecutionEvidence: 8,
    RefundExecutionProviderContactEligibilityProof: 11,
    RefundExecutionProviderEligibilityProof: 11,
    RefundExecutionProviderOperationBinding: 8,
  });

export const EXPECTED_CHECK_INVARIANTS: readonly CheckInvariant[] = Object.freeze([
  check("CustomerRefundIntake", "CustomerRefundIntake_approval_link_coherence_check", `CHECK ((status = 'APPROVED'::"CustomerRefundIntakeStatus") = ("approvedRefundAttemptId" IS NOT NULL))`),
  check("CustomerRefundIntake", "CustomerRefundIntake_reason_detail_nonblank_check", `CHECK ("reasonDetail" IS NULL OR btrim("reasonDetail"::text) <> ''::text)`),
  check("CustomerRefundIntake", "CustomerRefundIntake_rejection_coherence_check", `CHECK ((status = 'REJECTED'::"CustomerRefundIntakeStatus") = ("adminRejectionReason" IS NOT NULL))`),
  check("CustomerRefundIntake", "CustomerRefundIntake_rejection_reason_nonblank_check", `CHECK ("adminRejectionReason" IS NULL OR btrim("adminRejectionReason"::text) <> ''::text)`),
  check("CustomerRefundIntake", "CustomerRefundIntake_review_coherence_check", `CHECK ((status = ANY (ARRAY['APPROVED'::"CustomerRefundIntakeStatus", 'REJECTED'::"CustomerRefundIntakeStatus"])) = ("reviewedAt" IS NOT NULL))`),
  check("CustomerRefundIntake", "CustomerRefundIntake_reviewer_nonblank_check", `CHECK ("reviewedByUserId" IS NULL OR btrim("reviewedByUserId") <> ''::text)`),
  check("CustomerRefundIntake", "CustomerRefundIntake_reviewer_pair_check", `CHECK (("reviewedAt" IS NULL) = ("reviewedByUserId" IS NULL))`),
  check("CustomerRefundIntake", "CustomerRefundIntake_withdrawal_coherence_check", `CHECK ((status = 'WITHDRAWN'::"CustomerRefundIntakeStatus") = ("withdrawnAt" IS NOT NULL))`),
  check("RefundAttemptTransition", "RefundAttemptTransition_actor_user_nonblank_check", `CHECK ("actorUserId" IS NULL OR btrim("actorUserId") <> ''::text)`),
  check("RefundAttemptTransition", "RefundAttemptTransition_admin_actor_check", `CHECK ("actorType" <> 'ADMIN'::"RefundAttemptActorType" OR "actorUserId" IS NOT NULL)`),
  check("RefundAttemptTransition", "RefundAttemptTransition_creation_edge_check", `CHECK (("fromStatus" IS NULL) = ("toStatus" = 'REQUESTED'::"RefundAttemptStatus"))`),
  check("RefundAttemptTransition", "RefundAttemptTransition_distinct_status_check", `CHECK ("fromStatus" IS NULL OR "fromStatus" <> "toStatus")`),
  check("RefundAttemptTransition", "RefundAttemptTransition_reason_nonblank_check", `CHECK (btrim(reason) <> ''::text)`),
  check("RefundExecutionCommand", "RefundExecutionCommand_dispatch_attempt_nonnegative_check", `CHECK ("dispatchAttempt" >= 0)`),
  check("RefundExecutionCommand", "RefundExecutionCommand_last_safe_error_code_nonblank_check", `CHECK ("lastSafeErrorCode" IS NULL OR btrim("lastSafeErrorCode"::text) <> ''::text)`),
  check("RefundExecutionCommand", "RefundExecutionCommand_last_safe_error_message_nonblank_check", `CHECK ("lastSafeErrorMessage" IS NULL OR btrim("lastSafeErrorMessage"::text) <> ''::text)`),
  check("RefundExecutionCommand", "RefundExecutionCommand_lease_generation_nonnegative_check", `CHECK ("leaseGeneration" >= 0)`),
  check("RefundExecutionCommand", "RefundExecutionCommand_lease_owner_nonblank_check", `CHECK ("leaseOwner" IS NULL OR btrim("leaseOwner"::text) <> ''::text)`),
  check("RefundExecutionCommand", "RefundExecutionCommand_lease_status_coherence_check", `CHECK (status = 'LEASED'::"RefundExecutionCommandStatus" AND "leaseOwner" IS NOT NULL AND "leaseUntil" IS NOT NULL AND "leaseTokenHash" IS NOT NULL AND "leaseGeneration" >= 1 OR status <> 'LEASED'::"RefundExecutionCommandStatus" AND "leaseOwner" IS NULL AND "leaseUntil" IS NULL AND "leaseTokenHash" IS NULL)`),
  check("RefundExecutionCommand", "RefundExecutionCommand_lease_token_hash_format_check", `CHECK ("leaseTokenHash" IS NULL OR "leaseTokenHash"::text ~ '^[0-9a-f]{64}$'::text)`),
  check("RefundExecutionCommandEvent", "RefundExecutionCommandEvent_dispatch_attempt_nonnegative_check", `CHECK ("dispatchAttempt" >= 0)`),
  check("RefundExecutionCommandEvent", "RefundExecutionCommandEvent_lease_generation_positive_check", `CHECK ("leaseGeneration" >= 1)`),
  check("RefundExecutionDispatchAttempt", "RefundExecutionDispatchAttempt_lease_generation_positive_check", `CHECK ("leaseGeneration" >= 1)`),
  check("RefundExecutionDispatchAttempt", "RefundExecutionDispatchAttempt_ordinal_positive_check", `CHECK (ordinal >= 1)`),
  check("RefundExecutionDispatchAttempt", "RefundExecutionDispatchAttempt_provider_operation_key_nonblank_", `CHECK (btrim("providerOperationKey"::text) <> ''::text)`),
  check("RefundExecutionDispatchAttempt", "RefundExecutionDispatchAttempt_request_fingerprint_format_check", `CHECK ("requestFingerprint"::text ~ '^[0-9a-f]{64}$'::text)`),
  check("RefundExecutionDispatchAttempt", "RefundExecutionDispatchAttempt_state_contact_coherence_check", `CHECK (state = 'AUTHORIZED'::"RefundExecutionDispatchAttemptState" AND "contactMarkedAt" IS NULL OR state = 'CONTACT_MAY_HAVE_OCCURRED'::"RefundExecutionDispatchAttemptState" AND "contactMarkedAt" IS NOT NULL AND "contactMarkedAt" >= "authorizedAt")`),
  check("RefundExecutionEvidence", "RefundEvidence_authorizing_generation_check", `CHECK ("authorizingLeaseGeneration" IS NULL OR "authorizingLeaseGeneration" >= 1)`),
  check("RefundExecutionEvidence", "RefundExecutionEvidence_provider_refund_id_nonblank_check", `CHECK ("observedProviderRefundId" IS NULL OR btrim("observedProviderRefundId"::text) <> ''::text)`),
  check("RefundExecutionEvidence", "RefundExecutionEvidence_reported_amount_positive_check", `CHECK ("reportedAmount" IS NULL OR "reportedAmount" > 0)`),
  check("RefundExecutionEvidence", "RefundExecutionEvidence_reported_currency_format_check", `CHECK ("reportedCurrency" IS NULL OR "reportedCurrency"::text ~ '^[A-Z]{3}$'::text)`),
  check("RefundExecutionEvidence", "RefundExecutionEvidence_reported_pair_check", `CHECK (("reportedAmount" IS NULL) = ("reportedCurrency" IS NULL))`),
  check("RefundExecutionEvidence", "RefundExecutionEvidence_safe_code_nonblank_check", `CHECK ("safeCode" IS NULL OR btrim("safeCode"::text) <> ''::text)`),
  check("RefundExecutionEvidence", "RefundExecutionEvidence_safe_message_nonblank_check", `CHECK ("safeMessage" IS NULL OR btrim("safeMessage"::text) <> ''::text)`),
  check("RefundExecutionEvidence", "RefundExecutionEvidence_source_dedup_key_nonblank_check", `CHECK (btrim("sourceDedupKey"::text) <> ''::text)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_balance_positive_check", `CHECK ("balanceAmount" >= 1)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_cancels_zero_check", `CHECK ("cancelsCount" = 0)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_currency_check", `CHECK (currency::text = 'KRW'::text)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_easy_pay_check", `CHECK ("easyPayPresent" = false)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_fingerprint_check", `CHECK ("eligibilityFingerprint"::text ~ '^[0-9a-f]{64}$'::text)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_method_check", `CHECK (method::text = '카드'::text)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_payment_key_check", `CHECK (btrim("paymentKey"::text) <> ''::text AND "paymentKey"::text !~ '[[:cntrl:]]'::text)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_status_check", `CHECK ("providerStatus"::text = 'DONE'::text)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_tax_exempt_zero_check", `CHECK ("taxExemptionAmount" = 0)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_tax_free_zero_check", `CHECK ("taxFreeAmount" = 0)`),
  check("RefundExecutionProviderContactEligibilityProof", "RefundContactProof_total_positive_check", `CHECK ("totalAmount" >= 1)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_balance_positive_check", `CHECK ("balanceAmount" >= 1)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_cancels_zero_check", `CHECK ("cancelsCount" = 0)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_currency_check", `CHECK (currency::text = 'KRW'::text)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_easy_pay_check", `CHECK ("easyPayPresent" = false)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_fingerprint_check", `CHECK ("eligibilityFingerprint"::text ~ '^[0-9a-f]{64}$'::text)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_method_check", `CHECK (method::text = '카드'::text)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_payment_key_check", `CHECK (btrim("paymentKey"::text) <> ''::text AND "paymentKey"::text !~ '[[:cntrl:]]'::text)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_status_check", `CHECK ("providerStatus"::text = 'DONE'::text)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_tax_exempt_zero_check", `CHECK ("taxExemptionAmount" = 0)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_tax_free_zero_check", `CHECK ("taxFreeAmount" = 0)`),
  check("RefundExecutionProviderEligibilityProof", "RefundEligibilityProof_total_positive_check", `CHECK ("totalAmount" >= 1)`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_algorithm_version_check", `CHECK ("operationKeyAlgorithmVersion"::text = 'toss-refund-v1'::text)`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_generation_label_check", `CHECK ("credentialGenerationBindingId"::text ~ '^[A-Za-z0-9._-]{1,64}$'::text)`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_merchant_label_check", `CHECK ("merchantAccountBindingId"::text ~ '^[A-Za-z0-9._-]{1,64}$'::text)`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_mode_sandbox_check", `CHECK (mode = 'SANDBOX'::"PaymentMode")`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_operation_key_format_check", `CHECK ("providerOperationKey"::text ~ '^toss-refund-v1-[0-9a-f]{64}$'::text)`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_provider_toss_check", `CHECK (provider = 'TOSS'::"PaymentProvider")`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_wire_fingerprint_check", `CHECK ("wireRequestFingerprint"::text ~ '^[0-9a-f]{64}$'::text)`),
  check("RefundExecutionProviderOperationBinding", "RefundProviderBinding_wire_version_check", `CHECK ("wireContractVersion"::text = 'refund-provider-toss-wire/v1'::text)`),
]);

export const EXPECTED_PARTIAL_INDEX: PartialIndexInvariant = Object.freeze({
  schemaName: "public",
  tableName: "CustomerRefundIntake",
  indexName: "CustomerRefundIntake_orderId_submitted_key",
  unique: true,
  valid: true,
  ready: true,
  orderedExpressions: Object.freeze([`"orderId"`]),
  canonicalPredicate: `status = 'SUBMITTED'::"CustomerRefundIntakeStatus"`,
  canonicalDefinition: `CREATE UNIQUE INDEX "CustomerRefundIntake_orderId_submitted_key" ON "CustomerRefundIntake" USING btree ("orderId") WHERE status = 'SUBMITTED'::"CustomerRefundIntakeStatus"`,
});

export function canonicalizeCatalogText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

export function checkManifestHash(entries: readonly CheckInvariant[]): string {
  return createHash("sha256").update(canonicalJson(sortedChecks(entries))).digest("hex");
}

export function verifyPostgresVersion(serverVersionNum: number): void {
  if (!Number.isInteger(serverVersionNum)
    || serverVersionNum < 180_000
    || serverVersionNum >= 190_000) {
    throw new Error(DATABASE_INVARIANT_POSTGRES_VERSION_UNSUPPORTED);
  }
}

export function verifyCheckInvariants(
  expected: readonly CheckInvariant[],
  actual: readonly CatalogCheckRow[],
): void {
  assertExpectedManifest(expected);
  const normalized = actual.map((row) => Object.freeze({
    schemaName: row.schemaName,
    tableName: row.tableName,
    constraintName: row.constraintName,
    constraintType: row.constraintType,
    canonicalDefinition: canonicalizeCatalogText(row.definition),
    validated: row.validated,
  }));
  if (hasDuplicateIdentity(normalized)) throw new Error(DATABASE_CHECK_INVARIANTS_INVALID);
  if (canonicalJson(sortedChecks(expected)) !== canonicalJson(sortedChecks(normalized))) {
    throw new Error(DATABASE_CHECK_INVARIANTS_INVALID);
  }
}

export function verifyPartialIndexInvariant(
  expected: PartialIndexInvariant,
  actual: readonly CatalogPartialIndexRow[],
): void {
  if (actual.length !== 1 || hasDuplicateIndexIdentity(actual)) {
    throw new Error(DATABASE_PARTIAL_INDEX_INVARIANT_INVALID);
  }
  const row = actual[0];
  if (!row) throw new Error(DATABASE_PARTIAL_INDEX_INVARIANT_INVALID);
  const normalized = Object.freeze({
    schemaName: row.schemaName,
    tableName: row.tableName,
    indexName: row.indexName,
    unique: row.unique,
    valid: row.valid,
    ready: row.ready,
    orderedExpressions: row.orderedExpressions.map(canonicalizeCatalogText),
    canonicalPredicate: row.predicate === null ? "" : canonicalizeCatalogText(row.predicate),
    canonicalDefinition: canonicalizeCatalogText(row.definition),
  });
  if (canonicalJson(expected) !== canonicalJson(normalized)) {
    throw new Error(DATABASE_PARTIAL_INDEX_INVARIANT_INVALID);
  }
}

export function verifyDatabaseInvariantCatalog(catalog: DatabaseInvariantCatalog): void {
  verifyPostgresVersion(catalog.serverVersionNum);
  verifyCheckInvariants(EXPECTED_CHECK_INVARIANTS, catalog.checks);
  verifyPartialIndexInvariant(EXPECTED_PARTIAL_INDEX, catalog.partialIndexes);
}

export async function readDatabaseInvariantCatalog(
  client: DatabaseInvariantQueryClient,
): Promise<DatabaseInvariantCatalog> {
  const version = await client.$queryRaw<{ serverVersionNum: number }[]>(
    Prisma.sql`SELECT current_setting('server_version_num')::int AS "serverVersionNum"`,
  );
  if (version.length !== 1 || !version[0]) throw new Error(DATABASE_INVARIANT_POSTGRES_VERSION_UNSUPPORTED);
  verifyPostgresVersion(version[0].serverVersionNum);
  const checks = await client.$queryRaw<CatalogCheckRow[]>(Prisma.sql`
    SELECT
      namespace.nspname AS "schemaName", relation.relname AS "tableName",
      constraint_record.conname AS "constraintName", constraint_record.contype::text AS "constraintType",
      pg_get_constraintdef(constraint_record.oid, true) AS definition,
      constraint_record.convalidated AS validated
    FROM pg_constraint constraint_record
    JOIN pg_class relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (${Prisma.join(PINNED_CHECK_TABLES)})
      AND constraint_record.contype = 'c'
    ORDER BY relation.relname, constraint_record.conname
  `);
  const partialIndexes = await client.$queryRaw<CatalogPartialIndexRow[]>(Prisma.sql`
    SELECT
      namespace.nspname AS "schemaName", relation.relname AS "tableName",
      index_relation.relname AS "indexName", index_record.indisunique AS unique,
      index_record.indisvalid AS valid, index_record.indisready AS ready,
      ARRAY(
        SELECT pg_get_indexdef(index_record.indexrelid, position, true)
        FROM generate_series(1, index_record.indnkeyatts) AS position
        ORDER BY position
      ) AS "orderedExpressions",
      pg_get_expr(index_record.indpred, index_record.indrelid, true) AS predicate,
      pg_get_indexdef(index_record.indexrelid, 0, true) AS definition
    FROM pg_index index_record
    JOIN pg_class index_relation ON index_relation.oid = index_record.indexrelid
    JOIN pg_class relation ON relation.oid = index_record.indrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = 'CustomerRefundIntake_orderId_submitted_key'
  `);
  return Object.freeze({ serverVersionNum: version[0].serverVersionNum,
    checks: Object.freeze(checks), partialIndexes: Object.freeze(partialIndexes) });
}

export async function verifyDatabaseInvariants(
  client: DatabaseInvariantQueryClient,
): Promise<void> {
  verifyDatabaseInvariantCatalog(await readDatabaseInvariantCatalog(client));
}

function check(
  tableName: PinnedCheckTable,
  constraintName: string,
  canonicalDefinition: string,
): CheckInvariant {
  return Object.freeze({
    schemaName: "public",
    tableName,
    constraintName,
    constraintType: "c",
    canonicalDefinition,
    validated: true,
  });
}

function assertExpectedManifest(expected: readonly CheckInvariant[]): void {
  if (expected.length === 0 || hasDuplicateIdentity(expected)) {
    throw new Error(DATABASE_INVARIANT_MANIFEST_INVALID);
  }
  for (const entry of expected) {
    if (entry.schemaName !== "public"
      || !PINNED_CHECK_TABLES.includes(entry.tableName)
      || entry.constraintType !== "c"
      || entry.validated !== true
      || canonicalizeCatalogText(entry.canonicalDefinition) !== entry.canonicalDefinition) {
      throw new Error(DATABASE_INVARIANT_MANIFEST_INVALID);
    }
  }
}

function hasDuplicateIdentity(
  entries: readonly Readonly<{ schemaName: string; tableName: string; constraintName: string }>[],
): boolean {
  const identities = entries.map((entry) => (
    `${entry.schemaName}\u0000${entry.tableName}\u0000${entry.constraintName}`
  ));
  return new Set(identities).size !== identities.length;
}

function hasDuplicateIndexIdentity(
  entries: readonly Readonly<{ schemaName: string; indexName: string }>[],
): boolean {
  const identities = entries.map((entry) => `${entry.schemaName}\u0000${entry.indexName}`);
  return new Set(identities).size !== identities.length;
}

function sortedChecks<T extends Readonly<{
  schemaName: string;
  tableName: string;
  constraintName: string;
}>>(entries: readonly T[]): readonly T[] {
  return [...entries].sort((left, right) => (
    left.schemaName.localeCompare(right.schemaName)
    || left.tableName.localeCompare(right.tableName)
    || left.constraintName.localeCompare(right.constraintName)
  ));
}
