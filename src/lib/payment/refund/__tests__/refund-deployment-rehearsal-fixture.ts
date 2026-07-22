import type { RefundDeploymentRehearsalChildResult } from "../refund-deployment-rehearsal-child";
import type { RefundDeploymentRehearsalDependencies } from "../run-refund-deployment-rehearsal";

const WORKER_FORMAT = "mira-refund-worker-process-observation/v1";
const OPERATIONS_FORMAT = "mira-refund-operations-process/v1";

export function successfulRehearsalChildValues(): unknown[] {
  return [
    {
      ok: true,
      code: "CHECK_READY",
      readiness: readiness(),
      process: processObservation(WORKER_FORMAT, "CHECK"),
    },
    {
      ok: true,
      code: "HEALTH_SNAPSHOT",
      readiness: readiness(),
      routes: { READY: false, UNCONTACTED: false, CONTACTED_LOOKUP: false, CONTACTED_RECONTACT: false },
      backlog: {
        READY: emptyBacklog(),
        UNCONTACTED: emptyBacklog(),
        CONTACTED: emptyBacklog(),
        MANUAL_REVIEW: emptyBacklog(),
      },
      process: processObservation(WORKER_FORMAT, "HEALTH"),
    },
    {
      ok: true,
      code: "MANUAL_REVIEW_QUEUE",
      summary: { count: 0, oldestAgeSeconds: null },
      cases: [],
      truncated: false,
      process: processObservation(OPERATIONS_FORMAT, "MANUAL"),
    },
    {
      ok: true,
      code: "RECONCILIATION_SNAPSHOT",
      summary: {
        caseCount: 0,
        possibleContactCount: 0,
        manualReviewCount: 0,
        contactedWarningCount: 0,
        contactedCriticalCount: 0,
      },
      cases: [],
      truncated: false,
      process: processObservation(OPERATIONS_FORMAT, "RECONCILE"),
    },
    {
      ok: true,
      code: "CREDENTIAL_LIFECYCLE_CHECK",
      credentialStatus: "ABSENT",
      secretValidation: "NOT_PERFORMED",
      rotationCapability: "SINGLE_ACTIVE_ONLY",
      historicalGenerationResolution: false,
      revocationReadiness: "NOT_PROVABLE",
      process: processObservation(OPERATIONS_FORMAT, "CREDENTIAL"),
    },
    {
      ok: true,
      code: "FEATURE_DISABLED",
      process: processObservation(WORKER_FORMAT, "RUN_ONCE"),
    },
  ];
}

export function successfulRehearsalDependencies(
  values: unknown[] = successfulRehearsalChildValues(),
  observedSpecs: unknown[] = [],
): RefundDeploymentRehearsalDependencies {
  return {
    executable: "/test/node",
    cwd: "/test/repository",
    runChild(spec): Promise<RefundDeploymentRehearsalChildResult> {
      observedSpecs.push(spec);
      const value = values.shift();
      return Promise.resolve(value === undefined
        ? Object.freeze({ ok: false, reason: "NO_OUTPUT" })
        : Object.freeze({ ok: true, value }));
    },
  };
}

export function safeRehearsalEnv(): Readonly<Record<string, string>> {
  return Object.freeze({
    DATABASE_URL: "postgresql://test:test@localhost:5432/wig_platform_test?schema=public",
  });
}

function readiness() {
  return {
    workerMasterEnabled: false,
    credentialStatus: "ABSENT",
    databaseReachable: true,
    migrationStatus: "READY",
  };
}

function emptyBacklog() {
  return { count: 0, oldestAgeSeconds: null };
}

function processObservation(formatVersion: string, command: string) {
  return { formatVersion, command, operationDurationMs: 1 };
}
