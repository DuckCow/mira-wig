import { type PrismaClient } from "@prisma/client";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import {
  currentDispatchAuthorityFailure,
  isDispatchAuthorizationLedgerCoherent,
} from "../../dispatch-authorization-contract";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import type { NormalizedTossRefundEligibility } from "./refund-eligibility";
import {
  configuredTossRefundCredential,
  tossAuthorizationPrerequisites,
  validateTossLookupGate,
  type TossAuthorizationEnv,
} from "./refund-authorization-config";
import {
  deriveDurableTossRefundRequest,
  exactTossPaymentKey,
  isTossFullRefundContext,
  matchesCompleteTossAuthorization,
  matchesCurrentTossEligibility,
  sameBindingCredential,
  sameCredentialLabels,
} from "./refund-authorization-identity";
import {
  TossAuthorizationPersistenceRollbackError,
  TossAuthorizationUniqueConflictError,
  persistFreshTossAuthorization,
  replayTossAuthorization,
} from "./refund-authorization-persistence";
import {
  discoverTossAuthorizationOwnership,
  isConservativeTossLookupTimeValid,
  lockAndLoadTossAuthorizationState,
  type AuthorizationTx,
  type FreshTossLookupAuthority,
  type LockedTossAuthorizationState,
} from "./refund-authorization-state";
import {
  normalizeAuthorizeTossRefundExecutionDispatchInput,
  tossRefundAuthorizationFailure as failure,
  type AuthorizeTossRefundExecutionDispatchInput,
  type AuthorizeTossRefundExecutionDispatchResult,
  type NormalizedAuthorizeTossRefundExecutionDispatchInput,
  type TossRefundAuthorizationFailure,
} from "./refund-authorization-contract";
import type { TossRefundLookupPort } from "./refund-lookup-http";
import { extractTossRefundEligibilityResponse } from "./refund-lookup-response";

type PhaseOneResult =
  | Readonly<{ kind: "result"; result: AuthorizeTossRefundExecutionDispatchResult }>
  | Readonly<{
    kind: "fresh";
    authority: FreshTossLookupAuthority;
    credential: ConfiguredTossRefundCredential;
  }>;

export type TossRefundAuthorizerDependencies = Readonly<{ lookup: TossRefundLookupPort }>;

// Construction-time fake injection stays below the public authority-bearing input contract.
export function createTossRefundExecutionAuthorizer(
  dependencies: TossRefundAuthorizerDependencies,
) {
  return async (
    client: PrismaClient,
    input: AuthorizeTossRefundExecutionDispatchInput,
    env: TossAuthorizationEnv = process.env,
  ): Promise<AuthorizeTossRefundExecutionDispatchResult> => {
    const normalized = normalizeAuthorizeTossRefundExecutionDispatchInput(input);
    if (!normalized.ok) return normalized;
    const phaseOne = await client.$transaction((tx) => phaseOneClassification(
      tx,
      normalized.input,
      env,
    ));
    if (phaseOne.kind === "result") return phaseOne.result;
    return lookupThenAuthorize(
      dependencies,
      client,
      phaseOne.authority,
      normalized.input,
      phaseOne.credential,
      env,
    );
  };
}

async function lookupThenAuthorize(
  dependencies: TossRefundAuthorizerDependencies,
  client: PrismaClient,
  authority: FreshTossLookupAuthority,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  credential: ConfiguredTossRefundCredential,
  env: TossAuthorizationEnv,
): Promise<AuthorizeTossRefundExecutionDispatchResult> {
  // Reuse the existing helper so secret trimming and Basic assembly cannot drift.
  const authorization = tossBasicAuthorization(credential.readSecretKey());
  const lookup = await dependencies.lookup(authority.paymentKey, authorization);
  if (lookup.kind === "unavailable") return lookupUnavailable();
  if (lookup.kind === "rejected") return lookupRejected();
  const extracted = extractTossRefundEligibilityResponse(lookup.body, {
    paymentKey: authority.paymentKey,
    conservativeNoLaterThanLookupTimestamp: authority.conservativeNoLaterThanLookupTimestamp,
  });
  if (extracted.kind === "rejected") return lookupRejected();
  if (extracted.kind === "ineligible") return paymentIneligible();
  return phaseFourWithConflictRecovery(client, authority, input, credential, extracted.facts, env);
}

async function phaseOneClassification(
  tx: AuthorizationTx,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  env: TossAuthorizationEnv,
): Promise<PhaseOneResult> {
  const credential = tossAuthorizationPrerequisites(env);
  if (!credentialIsConfigured(credential)) return result(credential);
  const ownership = await discoverTossAuthorizationOwnership(tx, input.commandId);
  if (!ownership) return result(commandNotFound());
  const locked = await lockAndLoadTossAuthorizationState(tx, ownership, input.commandId);
  if (!locked) return result(commandNotFound());
  const classification = classifyLockedState(locked, input, credential);
  if (classification) return result(classification);
  if (locked.structure.kind === "replay") return result(replayTossAuthorization(locked));
  const lookupGate = validateTossLookupGate(env);
  if (lookupGate) return result(lookupGate);
  const paymentKey = exactTossPaymentKey(locked.context.aggregate.payment.providerPaymentKey);
  if (!paymentKey) return result(ledgerFailure());
  return Object.freeze({
    kind: "fresh",
    credential,
    authority: Object.freeze({
      orderId: ownership.orderId,
      refundAttemptId: ownership.refundAttemptId,
      commandId: input.commandId,
      paymentKey,
      // Conservative no-later-than lookup time: the exact Phase 1 database timestamp.
      conservativeNoLaterThanLookupTimestamp: locked.capturedAt.getTime(),
    }),
  });
}

async function phaseFourWithConflictRecovery(
  client: PrismaClient,
  authority: FreshTossLookupAuthority,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  credential: ConfiguredTossRefundCredential,
  eligibility: NormalizedTossRefundEligibility,
  env: TossAuthorizationEnv,
): Promise<AuthorizeTossRefundExecutionDispatchResult> {
  try {
    return await client.$transaction((tx) => phaseFour(
      tx, authority, input, credential, eligibility, env, true,
    ));
  } catch (error) {
    if (error instanceof TossAuthorizationUniqueConflictError) {
      return client.$transaction((tx) => phaseFour(
        tx, authority, input, credential, eligibility, env, false,
      ));
    }
    if (error instanceof TossAuthorizationPersistenceRollbackError) return persistenceFailure();
    throw error;
  }
}

async function phaseFour(
  tx: AuthorizationTx,
  authority: FreshTossLookupAuthority,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  credential: ConfiguredTossRefundCredential,
  eligibility: NormalizedTossRefundEligibility,
  env: TossAuthorizationEnv,
  mayWrite: boolean,
): Promise<AuthorizeTossRefundExecutionDispatchResult> {
  const locked = await lockAndLoadTossAuthorizationState(tx, authority, authority.commandId);
  if (!locked) return commandNotFound();
  if (!isConservativeTossLookupTimeValid(authority, locked.capturedAt)) return ledgerFailure();
  const classification = classifyLockedState(locked, input, credential);
  if (classification) return classification;
  if (locked.structure.kind === "replay") return replayTossAuthorization(locked);
  if (!mayWrite) return authorizationConflict();
  return authorizeFreshLocked(tx, locked, authority, input, credential, eligibility, env);
}

async function authorizeFreshLocked(
  tx: AuthorizationTx,
  locked: LockedTossAuthorizationState,
  authority: FreshTossLookupAuthority,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  credential: ConfiguredTossRefundCredential,
  eligibility: NormalizedTossRefundEligibility,
  env: TossAuthorizationEnv,
): Promise<AuthorizeTossRefundExecutionDispatchResult> {
  const currentCredential = configuredTossRefundCredential(env);
  if (!credentialIsConfigured(currentCredential)) return currentCredential;
  if (!sameCredentialLabels(currentCredential, credential)) return credentialMismatch();
  if (!matchesCurrentTossEligibility(locked.context, eligibility, authority)) {
    return paymentIneligible();
  }
  const request = deriveDurableTossRefundRequest(locked.context);
  if (!request) return ledgerFailure();
  return persistFreshTossAuthorization(tx, locked, input, credential, eligibility, request);
}

function classifyLockedState(
  locked: LockedTossAuthorizationState,
  input: NormalizedAuthorizeTossRefundExecutionDispatchInput,
  credential: ConfiguredTossRefundCredential,
): AuthorizeTossRefundExecutionDispatchResult | null {
  const authorityFailure = currentDispatchAuthorityFailure(locked.context.command, input, locked.capturedAt);
  const authorityResult = classifyAuthorityFailure(authorityFailure);
  if (authorityResult) return authorityResult;
  if (locked.structure.kind === "contacted") return contactRecovery();
  if (!coherentTossLedger(locked)) return ledgerFailure();
  if (locked.structure.kind === "new") return locked.binding === null ? null : ledgerFailure();
  return classifyReplayState(locked, credential);
}

function classifyAuthorityFailure(
  value: ReturnType<typeof currentDispatchAuthorityFailure>,
): AuthorizeTossRefundExecutionDispatchResult | null {
  if (value === "LEASE_FENCE_MISMATCH") return fenceFailure();
  return value === "LEASE_EXPIRED" ? leaseExpired() : null;
}

function coherentTossLedger(locked: LockedTossAuthorizationState): boolean {
  return isDispatchAuthorizationLedgerCoherent(locked.context, locked.history, locked.structure)
    && isTossFullRefundContext(locked.context);
}

function classifyReplayState(
  locked: LockedTossAuthorizationState,
  credential: ConfiguredTossRefundCredential,
): AuthorizeTossRefundExecutionDispatchResult | null {
  const request = deriveDurableTossRefundRequest(locked.context);
  if (!locked.binding || !request || !matchesCompleteTossAuthorization(locked, request)) {
    return ledgerFailure();
  }
  return sameBindingCredential(locked.binding, credential) ? null : credentialMismatch();
}

function credentialIsConfigured(
  value: ConfiguredTossRefundCredential | TossRefundAuthorizationFailure,
): value is ConfiguredTossRefundCredential {
  return "readSecretKey" in value;
}

function result(value: AuthorizeTossRefundExecutionDispatchResult): PhaseOneResult {
  return Object.freeze({ kind: "result", result: value });
}

const commandNotFound = () => failure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
const fenceFailure = () => failure("LEASE_FENCE_MISMATCH", "Refund execution lease fence does not match.");
const leaseExpired = () => failure("LEASE_EXPIRED", "Refund execution lease has expired.");
const contactRecovery = () => failure("CONTACT_RECOVERY_REQUIRED", "Toss refund contact state requires recovery.");
const credentialMismatch = () => failure("CREDENTIAL_BINDING_MISMATCH", "Toss refund credential binding does not match.");
const ledgerFailure = () => failure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
const lookupUnavailable = () => failure("TOSS_LOOKUP_UNAVAILABLE", "Toss refund eligibility lookup is unavailable.");
const lookupRejected = () => failure("TOSS_LOOKUP_REJECTED", "Toss refund eligibility lookup was rejected.");
const paymentIneligible = () => failure("TOSS_PAYMENT_NOT_ELIGIBLE", "Toss payment is not eligible for refund authorization.");
const authorizationConflict = () => failure("DISPATCH_AUTHORIZATION_CONFLICT", "Toss refund dispatch authorization conflicted with durable state.");
const persistenceFailure = () => failure("PERSISTENCE_CONFLICT", "Toss refund authorization persistence conflicted.");
