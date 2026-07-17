import type { Prisma, PrismaClient } from "@prisma/client";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  deriveDurableTossRefundRequest,
  exactTossPaymentKey,
  sameBindingCredential,
  type DurableTossRefundRequest,
} from "./refund-authorization-identity";
import {
  isConfiguredContactCredential,
  tossContactPrerequisites,
  type TossContactEnv,
} from "./refund-contact-config";
import {
  contactFailure,
  normalizeExecuteTossRefundContactInput,
  type ExecuteTossRefundContactInput,
  type ExecuteTossRefundContactResult,
  type NormalizedExecuteTossRefundContactInput,
} from "./refund-contact-contract";
import { classifyTossContactDurableState } from "./refund-contact-finality";
import {
  markTossRefundContact,
  matchesFreshTossContactAuthorization,
  type TossContactAuthority,
} from "./refund-contact-marker";
import { applyTossContactSuccess } from "./refund-contact-result-application";
import {
  discoverTossContactOwnership,
  exactCurrentContactFence,
  lockAndLoadTossContactState,
} from "./refund-contact-state";
import {
  normalizeTossRefundCancellationSuccess,
} from "./refund-cancellation-response";
import type {
  TossRefundCancellationPort,
  TossRefundCancellationTransportResult,
} from "./refund-cancellation-http";
import type { TossRefundLookupPort } from "./refund-lookup-http";
import { extractTossRefundEligibilityResponse } from "./refund-lookup-response";
import { deriveTossRefundCancellationWireRequest } from "./refund-wire-request";

export type TossRefundContactDependencies = Readonly<{
  lookup: TossRefundLookupPort;
  cancellation: TossRefundCancellationPort;
}>;

type PhaseResult<T> = Readonly<{ kind: "next"; value: T }>
  | Readonly<{ kind: "result"; result: ExecuteTossRefundContactResult }>;

export function createTossRefundContactExecutor(dependencies: TossRefundContactDependencies) {
  return async (
    client: PrismaClient,
    input: ExecuteTossRefundContactInput,
    env: TossContactEnv = process.env,
  ): Promise<ExecuteTossRefundContactResult> => {
    const normalized = normalizeExecuteTossRefundContactInput(input);
    if (!normalized.ok) return normalized;
    const initial = await classifyBeforeGates(client, normalized.input);
    if (initial.kind === "result") return initial.result;
    const phaseA = await client.$transaction((tx) => phaseAClassification(
      tx, normalized.input, env,
    ));
    if (phaseA.kind === "result") return phaseA.result;
    return lookupThenContact(dependencies, client, normalized.input, phaseA.value, env);
  };
}

async function classifyBeforeGates(
  client: PrismaClient,
  input: NormalizedExecuteTossRefundContactInput,
): Promise<PhaseResult<true>> {
  return client.$transaction(async (tx) => {
    const ownership = await discoverTossContactOwnership(tx, input.commandId);
    if (!ownership) return result(commandNotFound());
    const locked = await lockAndLoadTossContactState(tx, ownership, input.commandId);
    if (!locked) return result(commandNotFound());
    const classification = classifyTossContactDurableState(locked);
    return classification.kind === "result"
      ? result(classification.result)
      : next(true);
  });
}

async function phaseAClassification(
  tx: Prisma.TransactionClient,
  input: NormalizedExecuteTossRefundContactInput,
  env: TossContactEnv,
): Promise<PhaseResult<TossContactAuthority>> {
  const credential = tossContactPrerequisites(env);
  if (!isConfiguredContactCredential(credential)) return result(credential);
  const ownership = await discoverTossContactOwnership(tx, input.commandId);
  if (!ownership) return result(commandNotFound());
  const locked = await lockAndLoadTossContactState(tx, ownership, input.commandId);
  if (!locked) return result(commandNotFound());
  const stateFailure = phaseAStateFailure(locked, input);
  if (stateFailure) return result(stateFailure);
  if (!bindingMatchesCredential(locked, credential)) return result(credentialMismatch());
  const requestFacts = authorityRequestFacts(locked);
  if (!requestFacts) return result(ledgerFailure());
  return next(Object.freeze({
    ...ownership,
    commandId: input.commandId,
    paymentKey: requestFacts.paymentKey,
    requestAmount: locked.context.target.amount,
    conservativeNoLaterThanLookupTimestamp: locked.capturedAt.getTime(),
    credential,
    authorization: tossBasicAuthorization(credential.readSecretKey()),
    request: requestFacts.request,
  }));
}

function phaseAStateFailure(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  input: NormalizedExecuteTossRefundContactInput,
): ExecuteTossRefundContactResult | null {
  const fence = exactCurrentContactFence(locked, input);
  if (fence) return fenceFailure(fence);
  const classification = classifyTossContactDurableState(locked);
  if (classification.kind === "result") return classification.result;
  return matchesFreshTossContactAuthorization(locked) ? null : ledgerFailure();
}

async function lookupThenContact(
  dependencies: TossRefundContactDependencies,
  client: PrismaClient,
  input: NormalizedExecuteTossRefundContactInput,
  authority: TossContactAuthority,
  env: TossContactEnv,
): Promise<ExecuteTossRefundContactResult> {
  const lookup = await safeLookup(dependencies.lookup, authority);
  if (lookup.kind === "unavailable") return eligibilityUnavailable();
  if (lookup.kind === "rejected") return eligibilityRejected();
  const extracted = extractTossRefundEligibilityResponse(lookup.body, authority);
  if (extracted.kind === "rejected") return eligibilityRejected();
  if (extracted.kind === "ineligible") return paymentIneligible();
  const phaseD = await markTossRefundContact(client, input, authority, extracted.facts, env);
  if (phaseD.kind === "result") return phaseD.result;
  return invokeCancellation(dependencies, client, input, authority, phaseD.request);
}

async function safeLookup(
  lookup: TossRefundLookupPort,
  authority: TossContactAuthority,
) {
  try {
    return await lookup(authority.paymentKey, authority.authorization);
  } catch {
    return Object.freeze({ kind: "unavailable" as const });
  }
}

function bindingMatchesCredential(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
  credential: ConfiguredTossRefundCredential,
): boolean {
  return locked.binding !== null && sameBindingCredential(locked.binding, credential);
}

function authorityRequestFacts(
  locked: NonNullable<Awaited<ReturnType<typeof lockAndLoadTossContactState>>>,
): Readonly<{ paymentKey: string; request: DurableTossRefundRequest }> | null {
  const paymentKey = exactTossPaymentKey(locked.context.aggregate.payment.providerPaymentKey);
  const request = deriveDurableTossRefundRequest(locked.context);
  return paymentKey && request ? Object.freeze({ paymentKey, request }) : null;
}

async function invokeCancellation(
  dependencies: TossRefundContactDependencies,
  client: PrismaClient,
  input: NormalizedExecuteTossRefundContactInput,
  authority: TossContactAuthority,
  request: DurableTossRefundRequest,
): Promise<ExecuteTossRefundContactResult> {
  const wire = deriveTossRefundCancellationWireRequest({
    paymentKey: authority.paymentKey,
    providerOperationKey: request.providerOperationKey,
    cancelAmount: authority.requestAmount,
  });
  let transport: TossRefundCancellationTransportResult;
  try {
    transport = await dependencies.cancellation(Object.freeze({
      authorization: authority.authorization,
      wire,
    }));
  } catch {
    transport = Object.freeze({ kind: "unknown" });
  }
  return completeCancellation(
    transport, client, input, authority,
  );
}

async function completeCancellation(
  transport: TossRefundCancellationTransportResult,
  client: PrismaClient,
  input: NormalizedExecuteTossRefundContactInput,
  authority: TossContactAuthority,
): Promise<ExecuteTossRefundContactResult> {
  if (transport.kind === "rejected") return responseRejected();
  if (transport.kind === "unknown") return outcomeUnknown();
  const normalized = normalizeTossRefundCancellationSuccess(transport.body, {
    paymentKey: authority.paymentKey,
    fullAmount: authority.requestAmount,
  });
  return normalized.ok
    ? applyTossContactSuccess(client, input, authority.credential, normalized.candidate)
    : outcomeUnknown();
}

function next<T>(value: T): PhaseResult<T> { return Object.freeze({ kind: "next", value }); }
function result<T>(value: ExecuteTossRefundContactResult): PhaseResult<T> {
  return Object.freeze({ kind: "result", result: value });
}

const commandNotFound = () => contactFailure("COMMAND_NOT_FOUND_OR_INELIGIBLE", "Refund execution command is not eligible.");
const ledgerFailure = () => contactFailure("REFUND_LEDGER_INCONSISTENT", "Refund execution aggregate is inconsistent.");
const credentialMismatch = () => contactFailure("CREDENTIAL_BINDING_MISMATCH", "Toss refund credential binding does not match.");
const eligibilityUnavailable = () => contactFailure("CONTACT_ELIGIBILITY_UNAVAILABLE", "Toss contact eligibility is unavailable.");
const eligibilityRejected = () => contactFailure("CONTACT_ELIGIBILITY_REJECTED", "Toss contact eligibility response was rejected.");
const paymentIneligible = () => contactFailure("TOSS_PAYMENT_NOT_ELIGIBLE", "Toss payment is not eligible for contact.");
const outcomeUnknown = () => contactFailure("TOSS_CONTACT_OUTCOME_UNKNOWN", "Toss contact outcome is unknown.");
const responseRejected = () => contactFailure("TOSS_CONTACT_RESPONSE_REJECTED", "Toss contact response was rejected.");
const fenceFailure = (code: "LEASE_EXPIRED" | "LEASE_FENCE_MISMATCH") => contactFailure(
  code, code === "LEASE_EXPIRED" ? "Refund execution lease has expired." : "Refund execution lease fence does not match.",
);
