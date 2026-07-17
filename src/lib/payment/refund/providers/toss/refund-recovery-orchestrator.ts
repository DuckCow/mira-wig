import type { PrismaClient } from "@prisma/client";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import {
  isConfiguredRecoveryCredential,
  tossRecoveryPrerequisites,
  type TossRecoveryEnv,
} from "./refund-recovery-config";
import {
  normalizeTossRefundRecoveryInput,
  recoveryFailure,
  recoverySuccess,
  type RecoverTossRefundExecutionInput,
  type RecoverTossRefundExecutionResult,
  type NormalizedTossRefundRecoveryInput,
} from "./refund-recovery-contract";
import { acquireTossRecoveryFence } from "./refund-recovery-fence";
import {
  normalizeTossRefundRecoveryLookup,
} from "./refund-recovery-lookup";
import {
  applyTossRecoveryLookupSuccess,
} from "./refund-recovery-result-application";
import { parkTossRecoveryProviderConflict } from "./refund-recovery-conflict-parking";
import { classifyTossRecoveryDurableState } from "./refund-recovery-state";
import {
  discoverTossContactOwnership,
  lockAndLoadTossContactState,
} from "./refund-contact-state";
import type { TossRefundLookupPort } from "./refund-lookup-http";
import type { TossRefundCancellationPort } from "./refund-cancellation-http";
import { admitTossRecoveryOrdinalTwo } from "./refund-recovery-ordinal-admission";
import { continueTossRecoveryContact } from "./refund-recovery-contact-continuation";

export type TossRefundRecoveryDependencies = Readonly<{
  lookup: TossRefundLookupPort;
  cancellation?: TossRefundCancellationPort;
}>;

type StageZero =
  | Readonly<{ kind: "CONTINUE" }>
  | Readonly<{ kind: "RESULT"; result: RecoverTossRefundExecutionResult }>;

export function createTossRefundRecoveryOperation(
  dependencies: TossRefundRecoveryDependencies,
) {
  return async (
    client: PrismaClient,
    input: RecoverTossRefundExecutionInput,
    env: TossRecoveryEnv = process.env,
  ): Promise<RecoverTossRefundExecutionResult> => {
    const normalized = normalizeTossRefundRecoveryInput(input);
    if (!normalized.ok) return normalized;
    return runNormalizedRecovery(dependencies, client, normalized.input, env);
  };
}

async function runNormalizedRecovery(
  dependencies: TossRefundRecoveryDependencies,
  client: PrismaClient,
  input: NormalizedTossRefundRecoveryInput,
  env: TossRecoveryEnv,
): Promise<RecoverTossRefundExecutionResult> {
  const stageZero = await classifyBeforeGates(client, input);
  if (stageZero.kind === "RESULT") return stageZero.result;
  const credential = tossRecoveryPrerequisites(env);
  if (!isConfiguredRecoveryCredential(credential)) return credential;
  const fence = await acquireTossRecoveryFence(client, input, credential);
  if (fence.kind === "RESULT") return fence.result;
  const transport = await performRecoveryLookup(
    dependencies.lookup,
    fence.handle.paymentKey,
    tossBasicAuthorization(credential.readSecretKey()),
  );
  const lookup = normalizeTossRefundRecoveryLookup(
    transport.kind === "response"
      ? Object.freeze({ kind: "response", body: new TextEncoder().encode(transport.body) })
      : transport,
    Object.freeze({
      paymentKey: fence.handle.paymentKey,
      fullAmount: fence.handle.fullAmount,
      localReceivedAt: fence.handle.fenceCapturedAtEpochMs,
    }),
  );
  return resolveRecoveryLookup(
    dependencies,
    client,
    fence.handle,
    credential,
    lookup,
    env,
  );
}

async function resolveRecoveryLookup(
  dependencies: TossRefundRecoveryDependencies,
  client: PrismaClient,
  handle: Extract<Awaited<ReturnType<typeof acquireTossRecoveryFence>>, { kind: "ACQUIRED" }>["handle"],
  credential: Extract<ReturnType<typeof tossRecoveryPrerequisites>, { readSecretKey(): string }>,
  lookup: ReturnType<typeof normalizeTossRefundRecoveryLookup>,
  env: TossRecoveryEnv,
): Promise<RecoverTossRefundExecutionResult> {
  if (lookup.kind === "EXACT_SUCCESS") {
    return applyTossRecoveryLookupSuccess(client, handle, credential, lookup.success);
  }
  if (lookup.kind === "CONFLICTING_PROVIDER_STATE") {
    return parkTossRecoveryProviderConflict(client, handle, credential);
  }
  if (lookup.kind === "STILL_ELIGIBLE_AND_UNCANCELLED") {
    const admission = await admitTossRecoveryOrdinalTwo(
      client,
      handle,
      credential,
      lookup.eligibility,
      env,
    );
    if (admission.kind === "RESULT") return admission.result;
    return continueTossRecoveryContact(
      dependencies.cancellation ?? unknownCancellation,
      client,
      admission.handle,
      credential,
    );
  }
  return staticLookupResult(lookup.kind);
}

const unknownCancellation: TossRefundCancellationPort = () => Promise.resolve({ kind: "unknown" });

async function performRecoveryLookup(
  lookup: TossRefundLookupPort,
  paymentKey: string,
  authorization: string,
) {
  try {
    return await lookup(paymentKey, authorization);
  } catch {
    return Object.freeze({ kind: "unavailable" as const });
  }
}

function staticLookupResult(
  kind: "PROVIDER_PROCESSING" | "LOOKUP_UNAVAILABLE" | "LOOKUP_REJECTED",
): RecoverTossRefundExecutionResult {
  if (kind === "PROVIDER_PROCESSING") return providerProcessing();
  return kind === "LOOKUP_UNAVAILABLE" ? lookupUnavailable() : lookupRejected();
}

async function classifyBeforeGates(
  client: PrismaClient,
  input: NormalizedTossRefundRecoveryInput,
): Promise<StageZero> {
  return client.$transaction(async (tx) => {
    const ownership = await discoverTossContactOwnership(tx, input.commandId);
    if (!ownership) return result(commandNotFound());
    const locked = await lockAndLoadTossContactState(tx, ownership, input.commandId);
    if (!locked) return result(commandNotFound());
    const durable = classifyTossRecoveryDurableState(locked);
    if (durable.kind === "FINALITY") {
      return result(recoverySuccess(input.commandId, true));
    }
    if (durable.kind === "MANUAL_REVIEW") return result(manualReview());
    if (durable.kind === "INCONSISTENT") return result(ledgerFailure());
    if (durable.kind === "CONTACTED_WITHOUT_EVIDENCE") {
      return Object.freeze({ kind: "CONTINUE" });
    }
    return result(commandNotFound());
  });
}

function result(value: RecoverTossRefundExecutionResult): StageZero {
  return Object.freeze({ kind: "RESULT", result: value });
}

const commandNotFound = () => recoveryFailure(
  "COMMAND_NOT_FOUND_OR_INELIGIBLE",
  "Refund execution command is not eligible.",
);
const manualReview = () => recoveryFailure(
  "RECOVERY_MANUAL_REVIEW_REQUIRED",
  "Toss refund recovery requires manual review.",
);
const ledgerFailure = () => recoveryFailure(
  "REFUND_LEDGER_INCONSISTENT",
  "Refund execution aggregate is inconsistent.",
);
const providerProcessing = () => recoveryFailure(
  "RECOVERY_PROVIDER_PROCESSING",
  "Toss refund recovery remains in provider processing.",
);
const lookupUnavailable = () => recoveryFailure(
  "RECOVERY_LOOKUP_UNAVAILABLE",
  "Toss refund recovery lookup is unavailable.",
);
const lookupRejected = () => recoveryFailure(
  "RECOVERY_LOOKUP_REJECTED",
  "Toss refund recovery lookup was rejected.",
);
