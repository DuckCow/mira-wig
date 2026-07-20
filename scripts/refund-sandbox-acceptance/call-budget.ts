import type {
  TossRefundCancellationPort,
  TossRefundCancellationContact,
  TossRefundCancellationTransportResult,
} from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import type {
  TossRefundLookupHttpResult,
  TossRefundLookupPort,
} from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import { isTossRefundPaymentKey } from "../../src/lib/payment/refund/providers/toss/refund-eligibility";
import {
  deriveTossRefundCancellationWireRequest,
  TOSS_REFUND_CANCEL_REASON,
  type TossRefundCancellationWireRequest,
} from "../../src/lib/payment/refund/providers/toss/refund-wire-request";
import type { H1ArtifactStore } from "./artifact-store";
import {
  createLedgerBudgetConfiguration,
  protectedGetRequest,
  protectedPostRequest,
  sameBudgetRequest,
  type BudgetRecord,
  type CanonicalS3Call,
  type ProviderCallKind,
  type S3CompletionEvidence,
  type S3DurableState,
} from "./budget-ledger";
import type { H1Scenario } from "./contracts";
import type { H1Ledger } from "./run-ledger";
import type { RunLedgerStore } from "./run-ledger";
import {
  completeS3ContinuationCapability,
  consumeS3ContinuationCapability,
  issueS3ContinuationCapability,
  type S3CapabilityRuntimeState,
  type S3CommandAuthority,
  type S3ContinuationCapability,
} from "./resume-planner";

export {
  budgetRecordsFromPayload,
  canonicalS3Record,
  canonicalS3Requests,
  protectedGetRequest,
  protectedPostRequest,
  sameBudgetRequest,
} from "./budget-ledger";
export type {
  BudgetRecord,
  CanonicalS3Call,
  ProviderCallKind,
  S3CompletionClassification,
  S3CompletionEvidence,
  S3Continuation,
  S3HistoryClassification,
  S3HistoryExpectation,
  S3Step,
} from "./budget-ledger";

const LIMITS: Readonly<Record<H1Scenario, Readonly<{ GET: number; POST: number }>>> = Object.freeze({
  S1: Object.freeze({ GET: 3, POST: 1 }),
  S2: Object.freeze({ GET: 4, POST: 1 }),
  S3: Object.freeze({ GET: 2, POST: 2 }),
  S4: Object.freeze({ GET: 3, POST: 2 }),
  S5: Object.freeze({ GET: 4, POST: 1 }),
  S6: Object.freeze({ GET: 3, POST: 0 }),
});
const RUN_LIMIT = Object.freeze({ GET: 20, POST: 7 });
const HEX_64 = /^[0-9a-f]{64}$/;
export const H1_CHANGED_CANCEL_REASON = "Mira merchant refund H1 changed-reason probe";

type AuthorizedS3Lookup = Readonly<{
  kind: "GET";
  request: BudgetRecord["request"];
  paymentKey: string;
}>;
type AuthorizedS3Cancellation = Readonly<{
  kind: "POST";
  request: BudgetRecord["request"];
  wire: TossRefundCancellationWireRequest;
}>;
type AuthorizedS3Invocation = AuthorizedS3Lookup | AuthorizedS3Cancellation;
type ReservedS3Intent = Readonly<{
  intent: BudgetRecord;
  capability: object;
  invocation: AuthorizedS3Invocation;
}>;

export class ProviderCallBudget {
  readonly #records: BudgetRecord[] = [];
  readonly #transactionIdentityHmac: ((value: string) => string) | undefined;
  readonly #loadS3State: (() => Promise<S3DurableState>) | undefined;
  readonly #s3BudgetContext = Object.freeze({});
  readonly #runProviderContact: <T>(contact: () => Promise<T>) => Promise<T>;
  #blocked = false;
  #serialization = Promise.resolve();

  constructor(
    readonly record: (entry: BudgetRecord, result?: unknown) => Promise<void> = () => Promise.resolve(),
    initialRecords: readonly BudgetRecord[] = [],
    transactionIdentityHmac?: (value: string) => string,
    loadS3State?: () => Promise<S3DurableState>,
    runProviderContact: <T>(contact: () => Promise<T>) => Promise<T> = (contact) => contact(),
  ) {
    this.#records.push(...initialRecords);
    this.#transactionIdentityHmac = transactionIdentityHmac;
    this.#loadS3State = loadS3State;
    this.#runProviderContact = runProviderContact;
  }

  counts(scenarioId?: H1Scenario): Readonly<{ GET: number; POST: number }> {
    return countsFor(this.#records, "COMPLETED", scenarioId);
  }

  intentCounts(scenarioId?: H1Scenario): Readonly<{ GET: number; POST: number }> {
    return countsFor(this.#records, "INTENT", scenarioId);
  }

  history(scenarioId?: H1Scenario): readonly BudgetRecord[] {
    return Object.freeze(this.#records.filter((entry) => (
      !scenarioId || entry.scenarioId === scenarioId
    )));
  }

  async authorizeS3Continuation(
    authority: S3CommandAuthority,
  ): Promise<S3ContinuationCapability> {
    return issueS3ContinuationCapability(authority, await this.loadS3RuntimeState());
  }

  protectS3TransactionIdentity(value: string): string {
    if (!this.#transactionIdentityHmac) throw new Error("S3_TRANSACTION_IDENTITY_PROTECTION_REQUIRED");
    const protectedIdentity = this.#transactionIdentityHmac(value);
    if (!HEX_64.test(protectedIdentity)) throw new Error("S3_TRANSACTION_IDENTITY_PROTECTION_INVALID");
    return protectedIdentity;
  }

  assertS3TransactionIdentityProtection(): void {
    if (!this.#transactionIdentityHmac) throw new Error("S3_TRANSACTION_IDENTITY_PROTECTION_REQUIRED");
  }

  async invoke<T>(scenarioId: H1Scenario, kind: ProviderCallKind, call: () => Promise<T>): Promise<T> {
    return this.invokeProtected(scenarioId, kind, emptyProtectedRequest(kind), call);
  }

  wrapLookup(scenarioId: H1Scenario, port: TossRefundLookupPort): TossRefundLookupPort {
    return (paymentKey, authorization): Promise<TossRefundLookupHttpResult> => this.invokeProtected(
      scenarioId, "GET", protectedGetRequest(paymentKey), () => port(paymentKey, authorization),
    );
  }

  wrapCancellation(scenarioId: H1Scenario, port: TossRefundCancellationPort): TossRefundCancellationPort {
    return (contact: TossRefundCancellationContact): Promise<TossRefundCancellationTransportResult> => this.invokeProtected(
      scenarioId, "POST", protectedPostRequest(contact.wire, JSON.stringify(contact.wire.body)),
      () => port(contact),
    );
  }

  async invokeProtected<T>(
    scenarioId: H1Scenario,
    kind: ProviderCallKind,
    request: BudgetRecord["request"],
    call: () => Promise<T>,
    completionEvidence?: (result: T) => S3CompletionEvidence,
    s3Capability?: unknown,
  ): Promise<T> {
    if (scenarioId === "S3" || s3Capability !== undefined) {
      throw new Error("S3_METHOD_SPECIFIC_BOUNDARY_REQUIRED");
    }
    const reservation = await this.reserveIntent(scenarioId, kind, request);
    const result = await this.#runProviderContact(call);
    const evidence = completionEvidence?.(result);
    const completed = Object.freeze({
      scenarioId, kind, phase: "COMPLETED" as const, sequence: reservation.intent.sequence, request,
      ...(evidence ? { completionEvidence: evidence } : {}),
    });
    await this.serialize(async () => {
      await this.record(completed, result);
      this.#records.push(completed);
    });
    return result;
  }

  async invokeAuthorizedS3Lookup(
    capability: unknown,
    port: TossRefundLookupPort,
    authorization: string,
    completionEvidence: (result: TossRefundLookupHttpResult) => S3CompletionEvidence,
  ): Promise<TossRefundLookupHttpResult> {
    const reservation = await this.reserveS3Intent("GET", capability);
    if (reservation.invocation.kind !== "GET") throw invalidS3Invocation();
    const paymentKey = reservation.invocation.paymentKey;
    const result = await this.#runProviderContact(
      () => port(paymentKey, authorization),
    );
    await this.completeS3Intent(reservation, result, completionEvidence(result));
    return result;
  }

  async invokeAuthorizedS3Cancellation(
    capability: unknown,
    port: TossRefundCancellationPort,
    authorization: string,
    completionEvidence: (result: TossRefundCancellationTransportResult) => S3CompletionEvidence,
  ): Promise<TossRefundCancellationTransportResult> {
    const reservation = await this.reserveS3Intent("POST", capability);
    if (reservation.invocation.kind !== "POST") throw invalidS3Invocation();
    const contact = Object.freeze({ authorization, wire: reservation.invocation.wire });
    const result = await this.#runProviderContact(() => port(contact));
    await this.completeS3Intent(reservation, result, completionEvidence(result));
    return result;
  }

  private reserveIntent(
    scenarioId: H1Scenario,
    kind: ProviderCallKind,
    request: BudgetRecord["request"],
  ): Promise<Readonly<{ intent: BudgetRecord }>> {
    return this.serialize(async () => {
      if (this.#blocked) throw new Error("PROVIDER_BUDGET_BLOCKED");
      const scenario = this.intentCounts(scenarioId);
      const run = this.intentCounts();
      if (scenario[kind] >= LIMITS[scenarioId][kind] || run[kind] >= RUN_LIMIT[kind]) {
        this.#blocked = true;
        throw new Error("PROVIDER_BUDGET_EXCEEDED");
      }
      const sequence = this.#records.filter((entry) => entry.phase === "INTENT").length + 1;
      const intent = Object.freeze({ scenarioId, kind, phase: "INTENT" as const, sequence, request });
      await this.record(intent);
      this.#records.push(intent);
      return Object.freeze({ intent });
    });
  }

  private reserveS3Intent(
    kind: ProviderCallKind,
    capability: unknown,
  ): Promise<ReservedS3Intent> {
    return this.serialize(async () => {
      const consumed = consumeS3ContinuationCapability(capability, {
        state: await this.loadS3RuntimeState(),
        kind,
      });
      const invocation = authorizedS3Invocation(consumed.call);
      if (this.#blocked) throw new Error("PROVIDER_BUDGET_BLOCKED");
      const scenario = this.intentCounts("S3");
      const run = this.intentCounts();
      if (scenario[kind] >= LIMITS.S3[kind] || run[kind] >= RUN_LIMIT[kind]) {
        this.#blocked = true;
        throw new Error("PROVIDER_BUDGET_EXCEEDED");
      }
      const sequence = this.#records.filter((entry) => entry.phase === "INTENT").length + 1;
      const intent = Object.freeze({
        scenarioId: "S3" as const,
        kind,
        phase: "INTENT" as const,
        sequence,
        request: invocation.request,
      });
      await this.record(intent);
      this.#records.push(intent);
      return Object.freeze({ intent, capability: consumed.capability, invocation });
    });
  }

  private completeS3Intent(
    reservation: ReservedS3Intent,
    result: unknown,
    completionEvidence: S3CompletionEvidence,
  ): Promise<void> {
    const completed = Object.freeze({
      scenarioId: "S3" as const,
      kind: reservation.intent.kind,
      phase: "COMPLETED" as const,
      sequence: reservation.intent.sequence,
      request: reservation.invocation.request,
      completionEvidence,
    });
    return this.serialize(async () => {
      await this.record(completed, result);
      this.#records.push(completed);
      completeS3ContinuationCapability(
        reservation.capability,
        await this.loadS3RuntimeState(),
      );
    });
  }

  private async loadS3RuntimeState(): Promise<S3CapabilityRuntimeState> {
    if (!this.#loadS3State) throw new Error("S3_DURABLE_STATE_SOURCE_REQUIRED");
    const state = await this.#loadS3State();
    return Object.freeze({ ...state, budgetContext: this.#s3BudgetContext });
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#serialization;
    let release = (): void => undefined;
    this.#serialization = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function authorizedS3Invocation(call: CanonicalS3Call): AuthorizedS3Invocation {
  return call.kind === "GET" ? authorizedS3Lookup(call) : authorizedS3Cancellation(call);
}

function authorizedS3Lookup(call: CanonicalS3Call): AuthorizedS3Lookup {
  if (call.kind !== "GET") throw invalidS3Invocation();
  const paymentKey = paymentKeyFromCanonicalPath(call.request.path, "");
  if (!sameBudgetRequest(call.request, protectedGetRequest(paymentKey))) {
    throw invalidS3Invocation();
  }
  return Object.freeze({ kind: "GET", request: call.request, paymentKey });
}

function authorizedS3Cancellation(call: CanonicalS3Call): AuthorizedS3Cancellation {
  if (call.kind !== "POST" || typeof call.request.operationKey !== "string"
    || typeof call.request.canonicalBody !== "string") throw invalidS3Invocation();
  const paymentKey = paymentKeyFromCanonicalPath(call.request.path, "/cancel");
  const body = parseCanonicalCancellationBody(call.request.canonicalBody);
  const wire = deriveTossRefundCancellationWireRequest({
    paymentKey,
    providerOperationKey: call.request.operationKey,
    cancelAmount: body.cancelAmount,
  });
  const rebuilt = protectedPostRequest(wire, JSON.stringify(wire.body));
  if (!sameBudgetRequest(call.request, rebuilt)) throw invalidS3Invocation();
  return Object.freeze({ kind: "POST", request: call.request, wire });
}

function paymentKeyFromCanonicalPath(path: string, suffix: "" | "/cancel"): string {
  const prefix = "/v1/payments/";
  if (!path.startsWith(prefix) || suffix && !path.endsWith(suffix)) throw invalidS3Invocation();
  const encoded = path.slice(prefix.length, suffix ? -suffix.length : undefined);
  try {
    const paymentKey = decodeURIComponent(encoded);
    if (!isTossRefundPaymentKey(paymentKey)
      || path !== `${prefix}${encodeURIComponent(paymentKey)}${suffix}`) throw invalidS3Invocation();
    return paymentKey;
  } catch (error) {
    if (error instanceof Error && error.message === "S3_AUTHORIZED_INVOCATION_INVALID") throw error;
    throw invalidS3Invocation();
  }
}

function parseCanonicalCancellationBody(
  value: string,
): Readonly<{ cancelAmount: number }> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.cancelReason !== TOSS_REFUND_CANCEL_REASON
      || typeof parsed.cancelAmount !== "number"
      || !hasExactCancellationBodyKeys(parsed)) throw invalidS3Invocation();
    return Object.freeze({ cancelAmount: parsed.cancelAmount });
  } catch (error) {
    if (error instanceof Error && error.message === "S3_AUTHORIZED_INVOCATION_INVALID") throw error;
    throw invalidS3Invocation();
  }
}

function hasExactCancellationBodyKeys(value: object): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === 2
    && keys.every((key) => key === "cancelReason" || key === "cancelAmount");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidS3Invocation(): Error {
  return new Error("S3_AUTHORIZED_INVOCATION_INVALID");
}

export async function createLedgerBudget(
  store: RunLedgerStore,
  initial: H1Ledger,
  artifacts: H1ArtifactStore,
  runProviderContact?: <T>(contact: () => Promise<T>) => Promise<T>,
): Promise<ProviderCallBudget> {
  const configuration = await createLedgerBudgetConfiguration(store, initial, artifacts);
  return new ProviderCallBudget(
    configuration.record,
    configuration.initialRecords,
    configuration.transactionIdentityHmac,
    configuration.loadS3State,
    runProviderContact,
  );
}

export function changedReasonDiffersOnlyByReason(wire: TossRefundCancellationWireRequest): boolean {
  const first = wire.body;
  const second = { cancelReason: H1_CHANGED_CANCEL_REASON, cancelAmount: first.cancelAmount };
  return first.cancelReason === TOSS_REFUND_CANCEL_REASON
    && first.cancelAmount === second.cancelAmount && first.cancelReason !== second.cancelReason;
}

function countsFor(
  records: readonly BudgetRecord[],
  phase: BudgetRecord["phase"],
  scenarioId?: H1Scenario,
): Readonly<{ GET: number; POST: number }> {
  const matching = records.filter((entry) => entry.phase === phase
    && (!scenarioId || entry.scenarioId === scenarioId));
  return Object.freeze({
    GET: matching.filter((entry) => entry.kind === "GET").length,
    POST: matching.filter((entry) => entry.kind === "POST").length,
  });
}

function emptyProtectedRequest(path: string): BudgetRecord["request"] {
  return Object.freeze({ path, canonicalBody: null, operationKey: null, wireFingerprint: null });
}
