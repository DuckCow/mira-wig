import { PrismaClient } from "@prisma/client";
import { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  defaultRefundSandboxProviderFreePreflightDependencies,
  runRefundSandboxProviderFreePreflight,
} from "../run-refund-sandbox-provider-free-preflight";
import { REFUND_PROVIDER_CONTACT_ADMISSION_APPLICATION_NAME } from
  "../refund-provider-contact-admission";

let databaseUrl: string;

beforeAll(() => {
  databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider-free sandbox preflight against disposable PostgreSQL", () => {
  it("uses real readers and the production two-session admission probe without mutation or network", async () => {
    const before = await businessSnapshot();
    const fetchPoison = vi.fn(() => { throw new Error("NETWORK_MUST_NOT_RUN"); });
    vi.stubGlobal("fetch", fetchPoison);
    let disconnects = 0;

    const result = await runRefundSandboxProviderFreePreflight({}, {
      ...defaultRefundSandboxProviderFreePreflightDependencies,
      inspectEnvironment: () => Object.freeze({
        DATABASE_URL: databaseUrl,
        activationEnvironment: Object.freeze({}),
      }),
      disconnectDatabase: async (database: PrismaClient) => {
        disconnects += 1;
        await defaultRefundSandboxProviderFreePreflightDependencies.disconnectDatabase(database);
      },
    });

    expect(result).toEqual({
      ok: true,
      code: "PROVIDER_FREE_SANDBOX_PREFLIGHT_COMPLETE",
      activation: "BLOCKED",
      providerExecution: "NOT_PERFORMED",
      credentialProvisioned: false,
      executorAuthorityProvisioned: false,
      schedulerProvisioned: false,
      cloudProvisioningVerifiedByRuntime: false,
      checks: {
        database: "READY",
        postgresqlMajor: 18,
        migrations: "READY",
        worker: "DISABLED_READY",
        health: "EMPTY",
        manualReview: "EMPTY",
        reconciliation: "EMPTY",
        credential: "ABSENT_NOT_VALIDATED",
        distributedAdmission: "ONE_WINNER_ONE_BUSY",
      },
    });
    expect(disconnects).toBe(1);
    expect(fetchPoison).not.toHaveBeenCalled();
    expect(await businessSnapshot()).toEqual(before);
    expect(await sessionCount()).toBe(0);
  });
});

async function businessSnapshot() {
  const [commands, attempts, transitions, dispatches, evidence, bindings, proofs, contacts] =
    await Promise.all([
      db.refundExecutionCommand.count(),
      db.refundAttempt.count(),
      db.refundAttemptTransition.count(),
      db.refundExecutionDispatchAttempt.count(),
      db.refundExecutionEvidence.count(),
      db.refundExecutionProviderOperationBinding.count(),
      db.refundExecutionProviderEligibilityProof.count(),
      db.refundExecutionProviderContactEligibilityProof.count(),
    ]);
  return { commands, attempts, transitions, dispatches, evidence, bindings, proofs, contacts };
}

async function sessionCount(): Promise<number> {
  const audit = new Client({ connectionString: databaseUrl, application_name: "mira_p3e_b1_preflight_audit" });
  await audit.connect();
  try {
    const result = await audit.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM pg_stat_activity
      WHERE application_name = $1
    `, [REFUND_PROVIDER_CONTACT_ADMISSION_APPLICATION_NAME]);
    return Number(result.rows[0]?.count ?? "-1");
  } finally {
    await audit.end();
  }
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (!(["localhost", "127.0.0.1", "::1", "[::1]"] as const).some(
    (host) => host === url.hostname,
  ) || decodeURIComponent(url.pathname) !== "/wig_platform_test") {
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  }
  return value;
}
