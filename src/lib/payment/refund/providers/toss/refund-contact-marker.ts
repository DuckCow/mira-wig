import type { Prisma, PrismaClient } from "@prisma/client";
import { isDispatchAuthorizationLedgerCoherent } from "../../dispatch-authorization-contract";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import type { NormalizedTossRefundEligibility } from "./refund-eligibility";
import {
  deriveDurableTossRefundRequest,
  isTossFullRefundContext,
  matchesCompleteTossAuthorization,
  matchesCurrentTossEligibility,
  sameCredentialLabels,
  type DurableTossRefundRequest,
} from "./refund-authorization-identity";
import {
  isConfiguredContactCredential,
  tossContactPrerequisites,
  type TossContactEnv,
} from "./refund-contact-config";
import {
  contactFailure,
  type ExecuteTossRefundContactResult,
  type NormalizedExecuteTossRefundContactInput,
} from "./refund-contact-contract";
import {
  buildTossRefundContactEligibilityProofCandidate,
  isTossRefundContactEligibilityFresh,
} from "./refund-contact-eligibility";
import { classifyTossContactDurableState } from "./refund-contact-finality";
import {
  persistContactProofAndMarker,
  TossContactPersistenceRollbackError,
} from "./refund-contact-persistence";
import {
  discoverTossContactOwnership,
  exactCurrentContactFence,
  lockAndLoadTossContactState,
} from "./refund-contact-state";

export type TossContactAuthority = Readonly<{
  orderId: string;
  refundAttemptId: string;
  commandId: string;
  paymentKey: string;
  requestAmount: number;
  conservativeNoLaterThanLookupTimestamp: number;
  credential: ConfiguredTossRefundCredential;
  authorization: string;
  request: DurableTossRefundRequest;
}>;

export type TossContactMarkerResult =
  | Readonly<{ kind: "continue"; request: DurableTossRefundRequest }>
  | Readonly<{ kind: "result"; result: ExecuteTossRefundContactResult }>;

export async function markTossRefundContact(
  client: PrismaClient,
  input: NormalizedExecuteTossRefundContactInput,
  authority: TossContactAuthority,
  eligibility: NormalizedTossRefundEligibility,
  env: TossContactEnv,
): Promise<TossContactMarkerResult> {
  try {
    return await client.$transaction((tx) => markInTransaction(
      tx, input, authority, eligibility, env,
    ));
  } catch (error) {
    if (!(error instanceof TossContactPersistenceRollbackError) && !isUniqueConflict(error)) {
      throw error;
    }
    return classifyMarkerConflict(client, input.commandId);
  }
}

export function matchesFreshTossContactAuthorization(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
): boolean {
  const request = deriveDurableTossRefundRequest(locked.context);
  return locked.structure.kind === "replay" && request !== null
    && isDispatchAuthorizationLedgerCoherent(locked.context, locked.history, locked.structure)
    && isTossFullRefundContext(locked.context)
    && matchesCompleteTossAuthorization(locked, request)
    && locked.binding !== null;
}

async function markInTransaction(
  tx: Prisma.TransactionClient,
  input: NormalizedExecuteTossRefundContactInput,
  authority: TossContactAuthority,
  eligibility: NormalizedTossRefundEligibility,
  env: TossContactEnv,
): Promise<TossContactMarkerResult> {
  const credential = tossContactPrerequisites(env);
  if (!isConfiguredContactCredential(credential)) return result(credential);
  const locked = await lockAndLoadTossContactState(tx, authority, input.commandId);
  if (!locked) return result(commandNotFound());
  const stateFailure = phaseDStateFailure(locked, input, credential, authority);
  if (stateFailure) return result(stateFailure);
  const eligibilityFailure = phaseDEligibilityFailure(locked, eligibility, authority);
  if (eligibilityFailure) return result(eligibilityFailure);
  const currentRequest = deriveDurableTossRefundRequest(locked.context);
  if (!requestMatches(currentRequest, authority.request)) return result(ledgerFailure());
  await persistContactProofAndMarker(
    tx, locked, buildTossRefundContactEligibilityProofCandidate(eligibility),
  );
  return Object.freeze({ kind: "continue", request: authority.request });
}

function phaseDStateFailure(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  input: NormalizedExecuteTossRefundContactInput,
  credential: ConfiguredTossRefundCredential,
  authority: TossContactAuthority,
): ExecuteTossRefundContactResult | null {
  const fence = exactCurrentContactFence(locked, input);
  if (fence) return fenceFailure(fence);
  const classification = classifyTossContactDurableState(locked);
  if (classification.kind === "result") return classification.result;
  if (!sameCredentialLabels(credential, authority.credential)) return credentialMismatch();
  return matchesFreshTossContactAuthorization(locked) ? null : ledgerFailure();
}

function phaseDEligibilityFailure(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  eligibility: NormalizedTossRefundEligibility,
  authority: TossContactAuthority,
): ExecuteTossRefundContactResult | null {
  if (!matchesCurrentTossEligibility(locked.context, eligibility, authority)) {
    return paymentIneligible();
  }
  return isTossRefundContactEligibilityFresh({
    localReceivedAt: eligibility.localReceivedAt,
    phaseDCapturedAt: locked.capturedAt.getTime(),
  }) ? null : eligibilityUnavailable();
}

async function classifyMarkerConflict(
  client: PrismaClient,
  commandId: string,
): Promise<TossContactMarkerResult> {
  return client.$transaction(async (tx) => {
    const ownership = await discoverTossContactOwnership(tx, commandId);
    if (!ownership) return result(commandNotFound());
    const locked = await lockAndLoadTossContactState(tx, ownership, commandId);
    if (!locked) return result(commandNotFound());
    const classification = classifyTossContactDurableState(locked);
    return classification.kind === "result"
      ? result(classification.result)
      : result(persistenceFailure());
  });
}

function requestMatches(
  current: DurableTossRefundRequest | null,
  captured: DurableTossRefundRequest,
): boolean {
  return current !== null
    && current.providerOperationKey === captured.providerOperationKey
    && current.neutralFingerprint === captured.neutralFingerprint
    && current.wireFingerprint === captured.wireFingerprint;
}

function result(value: ExecuteTossRefundContactResult): TossContactMarkerResult {
  return Object.freeze({ kind: "result", result: value });
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

const commandNotFound = () => contactFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
const ledgerFailure = () => contactFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
const credentialMismatch = () => contactFailure("CREDENTIAL_BINDING_MISMATCH", "Toss refund credential binding does not match.");
const eligibilityUnavailable = () => contactFailure("CONTACT_ELIGIBILITY_UNAVAILABLE", "Toss contact eligibility is unavailable.");
const paymentIneligible = () => contactFailure("TOSS_PAYMENT_NOT_ELIGIBLE", "Toss payment is not eligible for contact.");
const persistenceFailure = () => contactFailure("PERSISTENCE_CONFLICT", "Toss contact persistence conflicted.");
const fenceFailure = (code: "LEASE_EXPIRED" | "LEASE_FENCE_MISMATCH") => contactFailure(
  code, code === "LEASE_EXPIRED" ? "Refund execution lease has expired." : "Refund execution lease fence does not match.",
);
