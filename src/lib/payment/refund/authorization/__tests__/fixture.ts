import { randomUUID } from "node:crypto";
import { PrismaClient, RefundAttemptActorType } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { db } from "@/lib/db";
import { syntheticEximbayProviderOrderId } from "@/lib/payment/__tests__/eximbay-fixture";
import { createDispatchFixture, cleanupDispatchFixtures, type DispatchFixture } from "../../__tests__/refund-dispatch-fixture";
import { requireOwnedRefundTestCluster } from "../../__tests__/retained-refund-test-history";
import { sealEximbayRefundCanaryTarget } from "../../eximbay-refund-canary-target-binding-pl-v1";
import { createRefundAuthorizationAdmin } from "../admin";
import { parseRefundReentryRelease, templateForGrant } from "../release";
import { VerifiedRefundExecution, type RuntimeIdentityPort } from "../runtime";
import { REFUND_REENTRY_OPERATION } from "../contract";
import {
  bootstrapEximbayP3eDatabaseRoles, EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  defaultEximbayP3eDatabaseBootstrapDependencies,
} from "../../../../../../scripts/eximbay-p3e-database-bootstrap";
import { AUTHORIZATION_COMMAND_UPDATE, grantRefundAuthorizationApplicationAccess } from "../../../../../../scripts/refund-authorization-privileges";

export const enabled = { MIRA_REFUND_AUTHORIZATION_ENABLED: "ENABLED", MIRA_REFUND_REENTRY_RELEASE_SHA256: "a".repeat(64) };
export const appRole = "mira_refund_authorization_test_app";
export const issuerId = `refund_authorization_admin_${randomUUID()}`;
export const bootstrapInput = { admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION, environment: "SANDBOX", targetDatabaseName: "wig_platform_test" } as const;
export const restoreDependencies = { ...defaultEximbayP3eDatabaseBootstrapDependencies,
  verifyExactLedger: async (client: Client) => {
    const rows = await client.query<{ name: string }>('SELECT migration_name AS name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    if (!rows.rows.some((row) => row.name === "20260909090000_refund_execution_authorization")) throw new Error("TEST_MIGRATION_REQUIRED");
  },
};
export const release = parseRefundReentryRelease({
  formatVersion: "mira-refund-reentry-release/v1", audience: "https://mira.example.test/api/payments/refunds/reentry/admission",
  jobName: "projects/synthetic-refund-test/locations/asia-northeast3/jobs/reentry-test",
  serviceAccountSubject: "123456789012345678901", serviceAccountEmail: "worker@synthetic-refund-test.iam.gserviceaccount.com",
  mid: "MIRA-SBX", merchantAccountBindingId: "merchant-v1", credentialGenerationBindingId: "credential-v1",
  secretResource: "projects/synthetic-refund-test/secrets/test-api-key", secretVersion: "1",
  executionTemplate: { serviceAccount: "worker@synthetic-refund-test.iam.gserviceaccount.com", maxRetries: 0, timeout: "180s",
    vpcAccess: { egress: "PRIVATE_RANGES_ONLY", networkInterfaces: [{ network: "projects/synthetic-refund-test/global/networks/refund", subnetwork: "projects/synthetic-refund-test/regions/asia-northeast3/subnetworks/refund" }] },
    containers: [{ image: `example.test/refund-test@sha256:${"b".repeat(64)}`, resources: { limits: { cpu: "1", memory: "512Mi" } },
      env: [
        { name: "MIRA_REFUND_AUTHORIZATION_ENABLED", value: "ENABLED" },
        { name: "REFUND_EXECUTION_WORKER_ENABLED", value: "ENABLED" },
        { name: "REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED", value: "ENABLED" },
        { name: "REFUND_EXECUTION_LEASE_ENABLED", value: "ENABLED" },
        { name: "REFUND_EXECUTION_UNCONTACTED_RECOVERY_ENABLED", value: "ENABLED" },
        { name: "REFUND_EXECUTION_DISPATCH_AUTHORIZATION_ENABLED", value: "ENABLED" },
        { name: "REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED", value: "ENABLED" },
        { name: "MIRA_REFUND_REENTRY_ADMISSION_URL", value: "https://mira.example.test/api/payments/refunds/reentry/admission" },
        { name: "MIRA_REFUND_REENTRY_JOB_NAME", value: "projects/synthetic-refund-test/locations/asia-northeast3/jobs/reentry-test" },
        { name: "MIRA_REFUND_AUTHORIZATION_ID", value: "${GRANT_ID}" },
        { name: "DATABASE_URL", valueSource: { secretKeyRef: { secret: "test-db", version: "1" } } },
      ] }] },
}, "a".repeat(64)); // Synthetic fixture identity, never a promotion artifact.
export const loadRelease = (digest: string) => digest === release.digest ? Promise.resolve(release) : Promise.reject(new Error("TEST_RELEASE_MISMATCH"));
export const fixtures: DispatchFixture[] = [];
export type Target = Awaited<ReturnType<typeof targetFixture>>;

export function roleUrl(role?: string): string {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/");
  if (role) { url.username = role; url.password = ""; }
  return url.toString();
}
export function prismaFor(role: string) {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: roleUrl(role) }) });
}
export async function pgFor(role?: string) {
  const client = new Client({ connectionString: roleUrl(role) });
  await client.connect();
  return client;
}
export async function setupRoles() {
  await requireOwnedRefundTestCluster();
  const admin = await pgFor();
  try {
    await bootstrapEximbayP3eDatabaseRoles(admin, bootstrapInput);
    await admin.query(`CREATE ROLE ${appRole} LOGIN NOINHERIT`);
    await admin.query(`GRANT CONNECT ON DATABASE wig_platform_test TO ${appRole}; GRANT USAGE ON SCHEMA public TO ${appRole}`);
    await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${appRole}; GRANT INSERT ON "RefundExecutionCommandEvent" TO ${appRole}`);
    for (const [table, columns] of Object.entries(AUTHORIZATION_COMMAND_UPDATE)) {
      await admin.query(`GRANT UPDATE (${columns.map((c) => `"${c}"`).join(",")}) ON "${table}" TO ${appRole}`);
    }
    for (const table of ["User", "Payment", "RefundExecutionProviderOperationBinding", "RefundExecutionEvidence", "RefundExecutionCommandEvent"]) {
      await admin.query(`GRANT UPDATE ("id") ON "${table}" TO ${appRole}`);
    }
    await grantRefundAuthorizationApplicationAccess(admin, appRole);
    await db.user.create({ data: { id: issuerId, email: `${issuerId}@example.test`, role: "ADMIN" } });
  } finally { await admin.end(); }
}
export async function teardownRoles() {
  await db.user.delete({ where: { id: issuerId } });
  const admin = await pgFor();
  try { await admin.query(`DROP OWNED BY ${appRole}; DROP ROLE ${appRole}`); }
  finally { await admin.end(); }
}
export async function cleanupTargets() { await cleanupDispatchFixtures(...fixtures.splice(0)); }
export function adminService(client: PrismaClient, actor = issuerId) {
  return createRefundAuthorizationAdmin(client, () => Promise.resolve({ user: { id: actor, role: "ADMIN" } }), loadRelease, enabled);
}
export async function targetFixture(generation = 1) {
  const fixture = await createDispatchFixture({ totalAmount: 100, targetAmount: 100,
    communicationLocale: "ko", refundActorType: RefundAttemptActorType.SYSTEM, refundActorUserId: null });
  fixtures.push(fixture);
  await db.$transaction(async (tx) => {
    await requireOwnedRefundTestCluster(tx);
    await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
    await tx.payment.update({ where: { id: fixture.paymentId }, data: { provider: "EXIMBAY", providerOrderId: syntheticEximbayProviderOrderId(),
      currency: "USD", adapterExecutionKind: "EXTERNAL" } });
  });
  await db.order.update({ where: { id: fixture.orderId }, data: { currency: "USD" } });
  await db.refundAttempt.update({ where: { id: fixture.refundAttemptId }, data: { provider: "EXIMBAY", currency: "USD" } });
  const seal = await sealEximbayRefundCanaryTarget(db, { commandId: fixture.commandId, merchantAccountBindingId: release.merchantAccountBindingId,
    credentialGenerationBindingId: release.credentialGenerationBindingId, syntheticProvenanceDigest: "f".repeat(64), noCustomerPiiAttested: true });
  const leaseTime = new Date(Date.now() - 30 * 60_000);
  if (generation > 0) {
    await db.refundExecutionCommand.update({ where: { id: fixture.commandId }, data: { status: "LEASED", leaseGeneration: generation,
      leaseOwner: "synthetic-prior-execution", leaseTokenHash: "c".repeat(64), leaseUntil: new Date(leaseTime.getTime() + 300_000) } });
    for (let g = 1; g <= generation; g++) {
      await db.refundExecutionCommandEvent.create({ data: { commandId: fixture.commandId, eventType: "LEASE_ACQUIRED", leaseGeneration: g,
        dispatchAttempt: 0, occurredAt: leaseTime } });
    }
  }
  await db.eximbayRefundSandboxCanaryApproval.create({ data: { commandId: fixture.commandId,
    formatVersion: "mira-refund-eximbay-sandbox-canary-approval/v1", provider: "EXIMBAY", mode: "SANDBOX",
    approvalEvidenceDigest: "0".repeat(64), releaseBindingDigest: "1".repeat(64), canaryJobBindingDigest: "2".repeat(64),
    preflightJobBindingDigest: "3".repeat(64), imageBindingDigest: "4".repeat(64), secretGenerationBindingDigest: "5".repeat(64),
    targetBindingDigest: seal.targetBindingDigest, issuedByPrincipalId: "synthetic-origin-issuer",
    approvedAt: new Date(leaseTime.getTime() - 1000), expiresAt: new Date(leaseTime.getTime() + 600_000),
    consumedAt: leaseTime, consumedExecutionId: `synthetic-original-${randomUUID()}`, consumedExecutionBindingDigest: "6".repeat(64),
  } });
  return { fixture, ...seal, generation };
}
export function issueInput(target: Target) {
  return { issuanceRequestId: randomUUID(), commandId: target.commandId, expectedPredecessorGeneration: target.generation,
    confirmedTargetBindingDigest: target.targetBindingDigest, releasePolicyDigest: release.digest };
}
export function runtimePort(grantId: string, executionName: string, uid = randomUUID()): RuntimeIdentityPort {
  return { verifyIdToken: () => Promise.resolve({ sub: release.serviceAccountSubject, email: release.serviceAccountEmail,
    email_verified: true, aud: release.audience, iss: "https://accounts.google.com", exp: Date.now() / 1000 + 300 }),
  getExecution: () => Promise.resolve({ name: executionName, uid, taskCount: 1, parallelism: 1, template: executionTemplateForGrant(grantId) }) };
}

// PARTIAL_RETAINED_EVIDENCE: local rvhbh evidence preserves the first four raw
// Execution env positions. The execution name, UID and remaining fixture fields
// below are deliberately synthetic.
export function rvhbhLiveShapedRuntimePort(grantId: string, executionName: string, uid = randomUUID()): RuntimeIdentityPort {
  const template = executionTemplateForGrant(grantId);
  const containers = template.containers;
  if (!Array.isArray(containers) || containers.length !== 1 || !isRecord(containers[0]) || !Array.isArray(containers[0].env)) {
    throw new Error("TEST_TEMPLATE_REQUIRED");
  }
  const env = retainedRvhbhEnvironmentOrder(containers[0].env);
  return {
    verifyIdToken: () => Promise.resolve({ sub: release.serviceAccountSubject, email: release.serviceAccountEmail,
      email_verified: true, aud: release.audience, iss: "https://accounts.google.com", exp: Date.now() / 1000 + 300 }),
    getExecution: () => Promise.resolve({ name: executionName, uid, taskCount: 1, parallelism: 1,
      template: { ...template, containers: [{ ...containers[0], env }] } }),
  };
}

function retainedRvhbhEnvironmentOrder(values: readonly unknown[]): unknown[] {
  const knownPrefix = ["REFUND_EXECUTION_EXIMBAY_ROUTING_ENABLED", "REFUND_EXECUTION_OBSERVATION_APPLICATION_ENABLED", "DATABASE_URL", "MIRA_REFUND_AUTHORIZATION_ENABLED"];
  const byName = new Map(values.map((value) => [isRecord(value) && typeof value.name === "string" ? value.name : "", value]));
  const prefix = knownPrefix.map((name) => byName.get(name)).filter((value): value is unknown => value !== undefined);
  return [...prefix, ...values.filter((value) => !isRecord(value) || typeof value.name !== "string" || !knownPrefix.includes(value.name))];
}

export function workerEnvironmentForGrant(grantId: string): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {
    CLOUD_RUN_JOB: "reentry-test",
    CLOUD_RUN_EXECUTION: "reentry-test-execution",
    CLOUD_RUN_TASK_COUNT: "1",
    CLOUD_RUN_TASK_INDEX: "0",
    CLOUD_RUN_TASK_ATTEMPT: "0",
  };
  for (const entry of workerTemplateEnvironment(grantId)) {
    environment[entry.name] = entry.value;
  }
  return Object.freeze(environment);
}

type WorkerEnvironmentEntry = { name: string; value: string };

function workerTemplateEnvironment(grantId: string): WorkerEnvironmentEntry[] {
  const template = templateForGrant(release, grantId);
  if (!isRecord(template)) throw new Error("TEST_TEMPLATE_REQUIRED");
  const containers = recordValue(template, "containers");
  if (!Array.isArray(containers) || containers.length !== 1) throw new Error("TEST_TEMPLATE_REQUIRED");
  const container = firstItem(containers);
  if (!isRecord(container)) throw new Error("TEST_TEMPLATE_REQUIRED");
  const environment = recordValue(container, "env");
  if (!Array.isArray(environment)) throw new Error("TEST_TEMPLATE_REQUIRED");
  return workerEnvironmentEntries(environment);
}

function isWorkerEnvironmentEntry(value: unknown): value is WorkerEnvironmentEntry {
  return isRecord(value) && typeof value.name === "string" && typeof value.value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordValue(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function firstItem(values: readonly unknown[]): unknown {
  return values[0];
}

function workerEnvironmentEntries(values: readonly unknown[]): WorkerEnvironmentEntry[] {
  return values.filter(isWorkerEnvironmentEntry);
}

function executionTemplateForGrant(grantId: string): Record<string, unknown> {
  const template = templateForGrant(release, grantId);
  if (!template || typeof template !== "object" || Array.isArray(template)) throw new Error("TEST_TEMPLATE_REQUIRED");
  const executionTemplate: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) if (key !== "vpcAccess") executionTemplate[key] = value;
  return executionTemplate;
}
export function verified(grantId: string) {
  const name = `${release.jobName}/executions/test-${randomUUID()}`;
  return VerifiedRefundExecution.verify("synthetic-signed-token", name, grantId, release, runtimePort(grantId, name));
}
export async function seedGrant(target: Target, issuedAt: Date, expiresAt: Date) {
  return db.refundExecutionAuthorization.create({ data: { issuanceRequestId: randomUUID(), commandId: target.commandId, expectedPredecessorGeneration: target.generation, releasePolicyDigest: release.digest,
    targetBindingDigest: target.targetBindingDigest, refundAttemptId: target.refundAttemptId, providerOperationBindingId: target.providerOperationBindingId,
    operationClass: REFUND_REENTRY_OPERATION, issuedByUserId: issuerId, issuedAt, expiresAt } });
}

// Direct SQL is deliberate adversarial testing of the real app role, never a second
// production admission owner. It can omit/misorder writes to exercise M's constraints.
export async function rawConsumption(client: Client, grantId: string, commandId: string, at: Date, generation: number,
  eventId: string = randomUUID(), includeCommand = true, includeEvent = true) {
  const execution = `${release.jobName}/executions/raw-${randomUUID()}`;
  await client.query(`UPDATE "RefundExecutionAuthorization" SET "consumedAt"=$2, "consumedByPrincipalId"=$3,
    "consumedExecutionId"=$4, "consumedExecutionUid"=$5, "consumedLeaseEventId"=$6 WHERE id=$1`,
  [grantId, at.toISOString(), release.serviceAccountSubject, execution, randomUUID(), eventId]);
  if (includeCommand) await client.query(`UPDATE "RefundExecutionCommand" SET "leaseGeneration"=$2, "leaseOwner"=$3,
    "leaseUntil"=$4, "leaseTokenHash"=$5, "updatedAt"=$6 WHERE id=$1`,
  [commandId, generation + 1, execution, new Date(at.getTime() + 300_000).toISOString(), "d".repeat(64), at.toISOString()]);
  if (includeEvent) await client.query(`INSERT INTO "RefundExecutionCommandEvent" (id,"commandId","leaseGeneration","eventType","dispatchAttempt","occurredAt")
    VALUES ($1,$2,$3,'LEASE_ACQUIRED',0,$4)`, [eventId, commandId, generation + 1, at.toISOString()]);
}
