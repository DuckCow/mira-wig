import { createHash } from "node:crypto";
import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { isRecord } from "@/lib/payment/providers/eximbay/validation";
import {
  persistResolution,
  ResolutionRollbackError,
} from "../../execution-result-persistence";
import {
  buildResolutionPlan,
  hasRefundProviderIdentityConflict,
  type ResolutionPlan,
} from "../../execution-result-plan";
import { createEximbayCancelPlan, type EximbayCancelPlan } from "./cancel-wire";
import {
  executeEximbayCancel,
  type EximbayCancelContactResult,
  type EximbayCancelTransport,
} from "./cancel-contact";
import {
  deriveEximbayDispatchAuthority,
  hasExactContactMarker,
  hasLawfulEximbayR2Origin,
  type EximbayDispatchAuthority,
} from "./lifecycle-authority";
import {
  discoverEximbayLifecycleOwnership,
  lockAndLoadEximbayLifecycleState,
  type LockedEximbayLifecycleState,
} from "./lifecycle-state";
import {
  createEximbayRefundPreflightConfig,
  type EximbayRefundPreflightConfigInput,
} from "./preflight-contract";
import { EXIMBAY_REFUND_LOOKUP_OFFSETS_MS } from "./refund-lookup";

const INPUT_FIELDS = ["commandId", "dispatchAttempt", "leaseGeneration", "leaseToken"] as const;

export type ExecuteEximbayRefundContactInput = Readonly<{
  commandId: string;
  dispatchAttempt: 1 | 2;
  leaseGeneration: number;
  leaseToken: string;
}>;

export type ExecuteEximbayRefundContactResult =
  | Readonly<{ ok: true; state: "SUCCEEDED" | "WAITING_EVIDENCE" | "PARKED"; replayed: boolean }>
  | Readonly<{ ok: false; code: string; message: string }>;

export type EximbayRefundContactDependencies = Readonly<{
  config: EximbayRefundPreflightConfigInput;
  cancel: EximbayCancelTransport;
}>;

type ContactPermit = Readonly<{
  input: ExecuteEximbayRefundContactInput;
  authority: EximbayDispatchAuthority;
  plan: EximbayCancelPlan;
}>;

export function createEximbayRefundContactExecutor(
  dependencies: EximbayRefundContactDependencies,
) {
  const config = createEximbayRefundPreflightConfig(dependencies.config);
  return async (
    client: PrismaClient,
    rawInput: ExecuteEximbayRefundContactInput,
  ): Promise<ExecuteEximbayRefundContactResult> => {
    const input = normalizeInput(rawInput);
    if (!input) return failure("INVALID_INPUT", "Eximbay refund contact input is invalid.");
    let marker: ContactPermit | ExecuteEximbayRefundContactResult;
    try {
      marker = await client.$transaction(async (tx) => {
        const ownership = await discoverEximbayLifecycleOwnership(tx, input.commandId);
        if (!ownership) return commandMissing();
        const state = await lockAndLoadEximbayLifecycleState(tx, ownership, input.commandId);
        if (!state) return commandMissing();
        return markLockedContact(tx, state, input, config);
      });
    } catch (error) {
      if (error instanceof ContactRollbackError || isPersistenceConflict(error)) {
        return failure("PERSISTENCE_CONFLICT", "Eximbay contact marker conflicted.");
      }
      throw error;
    }
    if ("ok" in marker) return marker;
    const contacted = await executeEximbayCancel(
      marker.plan,
      marker.authority.cancel,
      dependencies.cancel,
    );
    return applyContactResult(client, marker, contacted, config);
  };
}

async function applyContactResult(
  client: PrismaClient,
  permit: ContactPermit,
  contacted: EximbayCancelContactResult,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): Promise<ExecuteEximbayRefundContactResult> {
  try {
    return await client.$transaction(async (tx) => {
      const ownership = await discoverEximbayLifecycleOwnership(tx, permit.input.commandId);
      if (!ownership) return commandMissing();
      const state = await lockAndLoadEximbayLifecycleState(tx, ownership, permit.input.commandId);
      if (!state) return commandMissing();
      return applyLockedContactResult(tx, state, permit, contacted, config);
    });
  } catch (error) {
    if (error instanceof ResolutionRollbackError || isPersistenceConflict(error)) {
      return failure("PERSISTENCE_CONFLICT", "Eximbay contact result persistence conflicted.");
    }
    throw error;
  }
}

async function markLockedContact(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  input: ExecuteEximbayRefundContactInput,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): Promise<ContactPermit | ExecuteEximbayRefundContactResult> {
  const durable = classifyDurable(state, input.dispatchAttempt);
  if (durable) return durable;
  const authority = deriveEximbayDispatchAuthority(state, config, input.dispatchAttempt);
  if (!authority || !hasLawfulEximbayR2Origin(state, authority, config)
    || !markingFenceMatches(state, authority, input)) return ledgerFailure();
  const updated = await tx.refundExecutionDispatchAttempt.updateMany({
    where: {
      id: authority.dispatch.id,
      commandId: input.commandId,
      ordinal: input.dispatchAttempt,
      state: RefundExecutionDispatchAttemptState.AUTHORIZED,
      contactMarkedAt: null,
    },
    data: {
      state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
      contactMarkedAt: state.capturedAt,
    },
  });
  if (updated.count !== 1) throw new ContactRollbackError();
  return contactPermit(input, authority, state.capturedAt);
}

function contactPermit(
  input: ExecuteEximbayRefundContactInput,
  authority: EximbayDispatchAuthority,
  contactMarkedAt: Date,
): ContactPermit {
  return Object.freeze({
    input,
    authority: Object.freeze({
      ...authority,
      dispatch: Object.freeze({
        ...authority.dispatch,
        state: RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED,
        contactMarkedAt,
      }),
    }),
    plan: createEximbayCancelPlan(authority.cancel),
  });
}

async function applyLockedContactResult(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  permit: ContactPermit,
  contacted: EximbayCancelContactResult,
  config: ReturnType<typeof createEximbayRefundPreflightConfig>,
): Promise<ExecuteEximbayRefundContactResult> {
  if (state.context.target.status === RefundAttemptStatus.SUCCEEDED
    && state.context.command.status === RefundExecutionCommandStatus.DONE) {
    return Object.freeze({ ok: true, state: "SUCCEEDED", replayed: true });
  }
  const authority = deriveEximbayDispatchAuthority(
    state,
    config,
    permit.input.dispatchAttempt,
  );
  if (!authority || !hasExactContactMarker(authority)
    || !resultFenceMatches(state, authority, permit)) return ledgerFailure();
  return contacted.kind === "succeeded"
    ? persistSuccess(tx, state, permit, contacted)
    : persistUnknown(tx, state, permit, contacted.code);
}

async function persistSuccess(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  permit: ContactPermit,
  contacted: Extract<EximbayCancelContactResult, { kind: "succeeded" }>,
): Promise<ExecuteEximbayRefundContactResult> {
  const observation = Object.freeze({
    outcome: RefundExecutionEvidenceOutcome.SUCCEEDED,
    observedProviderRefundId: contacted.success.providerRefundTransactionId,
    reportedAmount: contacted.success.refundAmount,
    reportedCurrency: permit.authority.cancel.currency,
    safeCode: null,
    safeMessage: null,
    observedAt: new Date(state.capturedAt.getTime()),
  });
  const identityConflict = await hasRefundProviderIdentityConflict(
    tx,
    state.context.target,
    observation,
  );
  const plan = buildResolutionPlan(
    state.context.aggregate,
    state.context.target,
    observation,
    state.capturedAt,
    identityConflict,
  );
  if ("ok" in plan) return ledgerFailure();
  const persisted = await persistResolution(
    tx,
    state.context,
    persistenceInput(permit, observation),
    plan,
    state.capturedAt,
    {
      dispatchAttemptId: permit.authority.dispatch.id,
      authorizingLeaseGeneration: permit.authority.dispatch.leaseGeneration,
    },
  );
  if (!persisted.ok) return ledgerFailure();
  const disposition = plan.commandStatus === RefundExecutionCommandStatus.DONE
    && plan.attemptStatus === RefundAttemptStatus.SUCCEEDED ? "SUCCEEDED" : "PARKED";
  return Object.freeze({ ok: true, state: disposition, replayed: false });
}

async function persistUnknown(
  tx: Prisma.TransactionClient,
  state: LockedEximbayLifecycleState,
  permit: ContactPermit,
  code: string,
): Promise<ExecuteEximbayRefundContactResult> {
  const observation = Object.freeze({
    outcome: RefundExecutionEvidenceOutcome.UNKNOWN,
    observedProviderRefundId: null,
    reportedAmount: null,
    reportedCurrency: null,
    safeCode: "PROVIDER_OUTCOME_UNKNOWN",
    safeMessage: null,
    observedAt: new Date(state.capturedAt.getTime()),
  });
  const plan: ResolutionPlan = {
    application: RefundExecutionEvidenceApplication.PARKED,
    diagnostic: { safeCode: "PROVIDER_OUTCOME_UNKNOWN", safeMessage: null },
    attemptStatus: RefundAttemptStatus.PROCESSING,
    commandStatus: RefundExecutionCommandStatus.WAITING_EVIDENCE,
    orderStatus: OrderStatus.REFUND_PENDING,
    processedAt: null,
    failedAt: null,
    providerRefundId: null,
    transitionReason: null,
  };
  const persisted = await persistResolution(
    tx,
    state.context,
    persistenceInput(permit, observation),
    plan,
    state.capturedAt,
    {
      dispatchAttemptId: permit.authority.dispatch.id,
      authorizingLeaseGeneration: permit.authority.dispatch.leaseGeneration,
    },
  );
  if (!persisted.ok) return ledgerFailure();
  const due = new Date(
    permit.authority.dispatch.contactMarkedAt!.getTime() + EXIMBAY_REFUND_LOOKUP_OFFSETS_MS[0],
  );
  const updated = await tx.refundExecutionCommand.updateMany({
    where: {
      id: permit.input.commandId,
      status: RefundExecutionCommandStatus.WAITING_EVIDENCE,
      dispatchAttempt: permit.input.dispatchAttempt,
      leaseGeneration: permit.input.leaseGeneration,
      leaseOwner: null,
      leaseUntil: null,
      leaseTokenHash: null,
    },
    data: {
      availableAt: due,
      lastSafeErrorCode: `EXIMBAY_CANCEL_${safeDiagnostic(code)}`,
      lastSafeErrorMessage: "Eximbay cancel outcome requires refund-id reconciliation.",
    },
  });
  if (updated.count !== 1) throw new ResolutionRollbackError();
  return Object.freeze({ ok: true, state: "WAITING_EVIDENCE", replayed: false });
}

function persistenceInput(
  permit: ContactPermit,
  observation: Parameters<typeof persistResolution>[2]["observation"],
) {
  return Object.freeze({
    commandId: permit.input.commandId,
    dispatchAttempt: permit.input.dispatchAttempt,
    leaseGeneration: permit.input.leaseGeneration,
    leaseToken: permit.input.leaseToken,
    observation,
  });
}

function markingFenceMatches(
  state: LockedEximbayLifecycleState,
  authority: EximbayDispatchAuthority,
  input: ExecuteEximbayRefundContactInput,
): boolean {
  return markingCommandFenceMatches(state, input)
    && state.history.dispatchAttempts.length === input.dispatchAttempt
    && authority.dispatch.state === RefundExecutionDispatchAttemptState.AUTHORIZED
    && authority.dispatch.contactMarkedAt === null
    && priorDispatchesContacted(state);
}

function markingCommandFenceMatches(
  state: LockedEximbayLifecycleState,
  input: ExecuteEximbayRefundContactInput,
): boolean {
  const command = state.context.command;
  return command.status === RefundExecutionCommandStatus.LEASED
    && command.dispatchAttempt === input.dispatchAttempt
    && command.leaseGeneration === input.leaseGeneration
    && command.leaseTokenHash === digest(input.leaseToken)
    && command.leaseUntil !== null
    && command.leaseUntil.getTime() > state.capturedAt.getTime();
}

function priorDispatchesContacted(state: LockedEximbayLifecycleState): boolean {
  return state.history.dispatchAttempts.slice(0, -1).every((row) => (
    row.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
      && row.contactMarkedAt !== null
  ));
}

function resultFenceMatches(
  state: LockedEximbayLifecycleState,
  authority: EximbayDispatchAuthority,
  permit: ContactPermit,
): boolean {
  return resultCommandFenceMatches(state, permit)
    && authority.dispatch.id === permit.authority.dispatch.id
    && authority.dispatch.contactMarkedAt?.getTime()
      === permit.authority.dispatch.contactMarkedAt?.getTime()
    && state.evidence.every((row) => row.dispatchAttemptId !== authority.dispatch.id);
}

function resultCommandFenceMatches(
  state: LockedEximbayLifecycleState,
  permit: ContactPermit,
): boolean {
  const command = state.context.command;
  return command.status === RefundExecutionCommandStatus.LEASED
    && command.dispatchAttempt === permit.input.dispatchAttempt
    && command.leaseGeneration === permit.input.leaseGeneration
    && command.leaseTokenHash === digest(permit.input.leaseToken);
}

function classifyDurable(
  state: LockedEximbayLifecycleState,
  ordinal: number,
): ExecuteEximbayRefundContactResult | null {
  if (state.context.target.status === RefundAttemptStatus.SUCCEEDED
    && state.context.command.status === RefundExecutionCommandStatus.DONE) {
    return Object.freeze({ ok: true, state: "SUCCEEDED", replayed: true });
  }
  const dispatch = state.history.dispatchAttempts.find((row) => row.ordinal === ordinal);
  if (dispatch?.state === RefundExecutionDispatchAttemptState.CONTACT_MAY_HAVE_OCCURRED
    && dispatch.contactMarkedAt !== null) {
    return failure(
      "CONTACT_RECOVERY_REQUIRED",
      "Eximbay contact was already marked; refund-id reconciliation is required.",
    );
  }
  return null;
}

function normalizeInput(value: unknown): ExecuteEximbayRefundContactInput | null {
  if (!isRecord(value) || !hasExactInputFields(value) || !inputValuesValid(value)) return null;
  return Object.freeze({
    commandId: value.commandId,
    dispatchAttempt: value.dispatchAttempt,
    leaseGeneration: value.leaseGeneration,
    leaseToken: value.leaseToken,
  });
}

function hasExactInputFields(input: Record<string, unknown>): boolean {
  const keys = Reflect.ownKeys(input);
  return keys.length === INPUT_FIELDS.length
    && keys.every((key) => typeof key === "string"
      && INPUT_FIELDS.some((field) => field === key));
}

function inputValuesValid(input: Record<string, unknown>): input is Record<string, unknown> & {
  commandId: string;
  dispatchAttempt: 1 | 2;
  leaseGeneration: number;
  leaseToken: string;
} {
  return validContactIdentity(input)
    && validContactLease(input.leaseGeneration, input.leaseToken);
}

function validContactIdentity(input: Record<string, unknown>): boolean {
  return typeof input.commandId === "string" && Boolean(input.commandId.trim())
    && (input.dispatchAttempt === 1 || input.dispatchAttempt === 2)
    && typeof input.leaseToken === "string";
}

function validContactLease(generation: unknown, token: unknown): boolean {
  return typeof generation === "number" && Number.isSafeInteger(generation) && generation >= 1
    && typeof token === "string" && /^[0-9a-f]{64}$/u.test(token);
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeDiagnostic(code: string): string {
  return code.replace(/[^A-Z0-9_]/gu, "_").slice(0, 96) || "UNKNOWN";
}

function isPersistenceConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && error.code === "P2002";
}

class ContactRollbackError extends Error {}

function failure(code: string, message: string): ExecuteEximbayRefundContactResult {
  return Object.freeze({ ok: false, code, message });
}

const commandMissing = () => failure(
  "COMMAND_NOT_FOUND_OR_INELIGIBLE",
  "Eximbay refund command is not eligible.",
);
const ledgerFailure = () => failure(
  "REFUND_LEDGER_INCONSISTENT",
  "Eximbay refund aggregate is inconsistent.",
);
