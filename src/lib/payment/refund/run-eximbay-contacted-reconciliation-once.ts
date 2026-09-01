import { PrismaClient, type Payment } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isExactQ004ReleasedPayment,
  isExactRecoverableBlocker,
  recoverEximbayCheckout,
  type EximbayCheckoutRecoveryResult,
} from "@/lib/payment/eximbay/checkout-recovery";
import type { EximbayBf4Fetch } from "@/lib/payment/eximbay/bf4-contact";
import { EXIMBAY_SANDBOX_API_KEY } from "@/lib/payment/providers/credentials";
import {
  EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
  parseEximbayContactedReconciliationEnvironment,
  type EximbayContactedReconciliationEnvironment,
} from "./eximbay-contacted-reconciliation-environment";
import { readExactEximbayRefundCanarySecret } from "./eximbay-refund-canary-secret-reader";

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
type RecoveryDatabase = PrismaClient;
type RecoveryPayment = Pick<Payment,
  | "id"
  | "checkoutSessionId"
  | "provider"
  | "mode"
  | "status"
  | "attemptLifecycle"
  | "remediationStatus"
  | "amount"
  | "currency"
  | "providerOrderId"
  | "providerPaymentKey"
  | "contactStartedAt"
  | "financialSucceededAt"
  | "blockingEndedAt"
  | "suspendedByPaymentId"
  | "errorCode"
>;

export type EximbayContactedReconciliationDisposition =
  | "RELEASED_AFTER_Q004"
  | "REPLAYED_ALREADY_RELEASED"
  | "TRANSACTION_OBSERVED"
  | "OUTCOME_UNKNOWN"
  | "STALE_OR_NOT_ELIGIBLE"
  | "RECOVERY_DISABLED"
  | "STATE_CHANGED";

export type EximbayContactedReconciliationResult = Readonly<{
  ok: boolean;
  code: "CONTACTED_RECONCILIATION_COMPLETE" | "CONFIG_INVALID"
    | "CREDENTIAL_UNAVAILABLE" | "INTERNAL_FAILURE";
  terminalClass: "RECONCILIATION_COMPLETED" | "HOST_FAILURE";
  runId: typeof EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID;
  checkoutSessionId: typeof EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID;
  disposition?: EximbayContactedReconciliationDisposition;
  providerRetrieveCount: 0 | 1;
  durableRelease: "PERFORMED" | "OBSERVED_EXISTING" | "NOT_REPORTED";
}>;

type FixedRecoveryTarget = Readonly<{
  paymentId: string;
  authenticatedUserId: string;
  kind: "ACTIVE" | "REPLAY";
}>;

export type EximbayContactedReconciliationDependencies = Readonly<{
  createDatabase: (env: RuntimeEnvironment) => RecoveryDatabase;
  disconnectDatabase: (database: RecoveryDatabase) => Promise<void>;
  loadTarget: (
    database: RecoveryDatabase,
    checkoutSessionId: typeof EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
  ) => Promise<FixedRecoveryTarget | null>;
  readSecret: typeof readExactEximbayRefundCanarySecret;
  transport: EximbayBf4Fetch;
  recover: typeof recoverEximbayCheckout;
}>;

export const defaultEximbayContactedReconciliationDependencies:
EximbayContactedReconciliationDependencies = Object.freeze({
  createDatabase: (env) => {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  },
  disconnectDatabase: (database) => database.$disconnect(),
  loadTarget: loadFixedRecoveryTarget,
  readSecret: readExactEximbayRefundCanarySecret,
  transport: globalThis.fetch,
  recover: recoverEximbayCheckout,
});

export async function runEximbayContactedReconciliationOnce(
  env: RuntimeEnvironment,
  dependencies: EximbayContactedReconciliationDependencies =
  defaultEximbayContactedReconciliationDependencies,
): Promise<EximbayContactedReconciliationResult> {
  const authority = parseEximbayContactedReconciliationEnvironment(env);
  if (!authority) return hostFailure("CONFIG_INVALID", 0);
  let database: RecoveryDatabase;
  try {
    database = dependencies.createDatabase(env);
  } catch {
    return hostFailure("CONFIG_INVALID", 0);
  }
  const contact: { count: 0 | 1 } = { count: 0 };
  let result: EximbayContactedReconciliationResult;
  try {
    result = await executeFixedTarget(database, authority, env, contact, dependencies);
  } catch {
    result = hostFailure("INTERNAL_FAILURE", contact.count);
  }
  try {
    await dependencies.disconnectDatabase(database);
  } catch {
    return hostFailure("INTERNAL_FAILURE", contact.count);
  }
  return result;
}

async function executeFixedTarget(
  database: RecoveryDatabase,
  authority: EximbayContactedReconciliationEnvironment,
  env: RuntimeEnvironment,
  contact: { count: 0 | 1 },
  dependencies: EximbayContactedReconciliationDependencies,
): Promise<EximbayContactedReconciliationResult> {
  const target = await dependencies.loadTarget(database, authority.checkoutSessionId);
  if (!target) return completed("STALE_OR_NOT_ELIGIBLE", contact.count);
  let recoveryEnvironment = env;
  if (target.kind === "ACTIVE") {
    let secret: string;
    try {
      secret = await dependencies.readSecret({
        resource: authority.secretResource,
        version: authority.secretVersion,
      });
    } catch {
      return hostFailure("CREDENTIAL_UNAVAILABLE", contact.count);
    }
    recoveryEnvironment = Object.freeze({ ...env, [EXIMBAY_SANDBOX_API_KEY]: secret });
  }
  const recovered = await dependencies.recover(database, {
    checkoutSessionId: authority.checkoutSessionId,
    paymentId: target.paymentId,
    authenticatedUserId: target.authenticatedUserId,
    env: recoveryEnvironment,
    transport: singleRetrieveTransport(contact, dependencies.transport),
    emitDiagnostic: suppressRedundantDiagnostic,
  });
  return recoveryResult(recovered, contact.count);
}

function suppressRedundantDiagnostic(): void {
  return;
}

async function loadFixedRecoveryTarget(
  database: RecoveryDatabase,
  checkoutSessionId: typeof EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
): Promise<FixedRecoveryTarget | null> {
  const session = await database.checkoutSession.findUnique({
    where: { id: checkoutSessionId },
    select: {
      id: true,
      userId: true,
      payments: { select: recoveryPaymentSelect },
    },
  });
  if (!session || session.id !== checkoutSessionId) return null;
  return selectFixedRecoveryTarget(session);
}

export function selectFixedRecoveryTarget(
  session: Readonly<{
    id: string;
    userId: string;
    payments: readonly RecoveryPayment[];
  }>,
): FixedRecoveryTarget | null {
  if (session.id !== EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID) return null;
  const candidates = session.payments.flatMap((payment) => targetCandidate(payment));
  return candidates.length === 1
    ? Object.freeze({ ...candidates[0], authenticatedUserId: session.userId })
    : null;
}

function targetCandidate(payment: RecoveryPayment): readonly Omit<
  FixedRecoveryTarget,
  "authenticatedUserId"
>[] {
  if (isExactRecoverableBlocker(payment)) {
    return Object.freeze([Object.freeze({ paymentId: payment.id, kind: "ACTIVE" as const })]);
  }
  return isExactQ004ReleasedPayment(payment)
    ? Object.freeze([Object.freeze({ paymentId: payment.id, kind: "REPLAY" as const })])
    : Object.freeze([]);
}

const recoveryPaymentSelect = Object.freeze({
  id: true,
  checkoutSessionId: true,
  provider: true,
  mode: true,
  status: true,
  attemptLifecycle: true,
  remediationStatus: true,
  amount: true,
  currency: true,
  providerOrderId: true,
  providerPaymentKey: true,
  contactStartedAt: true,
  financialSucceededAt: true,
  blockingEndedAt: true,
  suspendedByPaymentId: true,
  errorCode: true,
} as const);

function singleRetrieveTransport(
  contact: { count: 0 | 1 },
  transport: EximbayBf4Fetch,
): EximbayBf4Fetch {
  return (...args) => {
    if (contact.count === 1) return Promise.reject(new Error("PROVIDER_RETRIEVE_LIMIT_EXCEEDED"));
    contact.count = 1;
    return transport(...args);
  };
}

function recoveryResult(
  result: EximbayCheckoutRecoveryResult,
  providerRetrieveCount: 0 | 1,
): EximbayContactedReconciliationResult {
  if (result.kind === "released") return completed("RELEASED_AFTER_Q004", providerRetrieveCount);
  if (result.kind === "replayed") {
    return completed("REPLAYED_ALREADY_RELEASED", providerRetrieveCount);
  }
  return completed(recoveryReasonDisposition(result.reason), providerRetrieveCount);
}

function recoveryReasonDisposition(
  reason: Extract<EximbayCheckoutRecoveryResult, { kind: "notReleased" }>["reason"],
): EximbayContactedReconciliationDisposition {
  const dispositions = Object.freeze({
    DISABLED: "RECOVERY_DISABLED",
    NOT_ELIGIBLE: "STALE_OR_NOT_ELIGIBLE",
    TRANSACTION_OBSERVED: "TRANSACTION_OBSERVED",
    OUTCOME_UNKNOWN: "OUTCOME_UNKNOWN",
    STATE_CHANGED: "STATE_CHANGED",
  } as const);
  return dispositions[reason];
}

function completed(
  disposition: EximbayContactedReconciliationDisposition,
  providerRetrieveCount: 0 | 1,
): EximbayContactedReconciliationResult {
  return Object.freeze({
    ok: true,
    code: "CONTACTED_RECONCILIATION_COMPLETE",
    terminalClass: "RECONCILIATION_COMPLETED",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    disposition,
    providerRetrieveCount,
    durableRelease: disposition === "RELEASED_AFTER_Q004"
      ? "PERFORMED"
      : disposition === "REPLAYED_ALREADY_RELEASED"
        ? "OBSERVED_EXISTING"
        : "NOT_REPORTED",
  });
}

function hostFailure(
  code: Extract<EximbayContactedReconciliationResult["code"],
    "CONFIG_INVALID" | "CREDENTIAL_UNAVAILABLE" | "INTERNAL_FAILURE">,
  providerRetrieveCount: 0 | 1,
): EximbayContactedReconciliationResult {
  return Object.freeze({
    ok: false,
    code,
    terminalClass: "HOST_FAILURE",
    runId: EXIMBAY_CONTACTED_RECONCILIATION_RUN_ID,
    checkoutSessionId: EXIMBAY_CONTACTED_RECONCILIATION_CHECKOUT_SESSION_ID,
    providerRetrieveCount,
    durableRelease: "NOT_REPORTED",
  });
}
