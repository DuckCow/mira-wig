import type {
  TossRefundCancellationPort,
  TossRefundCancellationContact,
  TossRefundCancellationTransportResult,
} from "../../src/lib/payment/refund/providers/toss/refund-cancellation-http";
import type {
  TossRefundLookupHttpResult,
  TossRefundLookupPort,
} from "../../src/lib/payment/refund/providers/toss/refund-lookup-http";
import type { H1Scenario } from "./contracts";
import { fingerprintTossRefundWireRequest } from "../../src/lib/payment/refund/providers/toss/refund-wire-fingerprint";
import type { TossRefundCancellationWireRequest } from "../../src/lib/payment/refund/providers/toss/refund-wire-request";

export type ProviderCallKind = "GET" | "POST";
export type BudgetRecord = Readonly<{
  scenarioId: H1Scenario;
  kind: ProviderCallKind;
  phase: "INTENT" | "COMPLETED";
  sequence: number;
  request: Readonly<{
    path: string;
    canonicalBody: string | null;
    operationKey: string | null;
    wireFingerprint: string | null;
  }>;
}>;

const LIMITS: Readonly<Record<H1Scenario, Readonly<{ GET: number; POST: number }>>> = Object.freeze({
  S1: Object.freeze({ GET: 3, POST: 1 }),
  S2: Object.freeze({ GET: 4, POST: 1 }),
  S3: Object.freeze({ GET: 3, POST: 2 }),
  S4: Object.freeze({ GET: 3, POST: 2 }),
  S5: Object.freeze({ GET: 4, POST: 1 }),
  S6: Object.freeze({ GET: 3, POST: 0 }),
});
const RUN_LIMIT = Object.freeze({ GET: 20, POST: 7 });

export class ProviderCallBudget {
  readonly #records: BudgetRecord[] = [];
  #blocked = false;

  constructor(
    readonly record: (entry: BudgetRecord, result?: unknown) => Promise<void> = () => Promise.resolve(),
    initialRecords: readonly BudgetRecord[] = [],
  ) {
    this.#records.push(...initialRecords);
  }

  counts(scenarioId?: H1Scenario): Readonly<{ GET: number; POST: number }> {
    const completed = this.#records.filter((entry) => entry.phase === "COMPLETED"
      && (!scenarioId || entry.scenarioId === scenarioId));
    return Object.freeze({
      GET: completed.filter((entry) => entry.kind === "GET").length,
      POST: completed.filter((entry) => entry.kind === "POST").length,
    });
  }

  async invoke<T>(scenarioId: H1Scenario, kind: ProviderCallKind, call: () => Promise<T>): Promise<T> {
    const request = emptyProtectedRequest(kind);
    return this.invokeProtected(scenarioId, kind, request, call);
  }

  wrapLookup(scenarioId: H1Scenario, port: TossRefundLookupPort): TossRefundLookupPort {
    return (paymentKey, authorization): Promise<TossRefundLookupHttpResult> => this.invokeProtected(
      scenarioId,
      "GET",
      emptyProtectedRequest(`/v1/payments/${encodeURIComponent(paymentKey)}`),
      () => port(paymentKey, authorization),
    );
  }

  wrapCancellation(scenarioId: H1Scenario, port: TossRefundCancellationPort): TossRefundCancellationPort {
    return (contact: TossRefundCancellationContact): Promise<TossRefundCancellationTransportResult> => this.invokeProtected(
      scenarioId,
      "POST",
      protectedPostRequest(contact.wire, JSON.stringify(contact.wire.body)),
      () => port(contact),
    );
  }

  private plannedCounts(scenarioId?: H1Scenario): Readonly<{ GET: number; POST: number }> {
    const planned = this.#records.filter((entry) => entry.phase === "INTENT"
      && (!scenarioId || entry.scenarioId === scenarioId));
    return Object.freeze({
      GET: planned.filter((entry) => entry.kind === "GET").length,
      POST: planned.filter((entry) => entry.kind === "POST").length,
    });
  }

  async invokeProtected<T>(
    scenarioId: H1Scenario,
    kind: ProviderCallKind,
    request: BudgetRecord["request"],
    call: () => Promise<T>,
  ): Promise<T> {
    if (this.#blocked) throw new Error("PROVIDER_BUDGET_BLOCKED");
    const scenario = this.plannedCounts(scenarioId);
    const run = this.plannedCounts();
    if (scenario[kind] >= LIMITS[scenarioId][kind] || run[kind] >= RUN_LIMIT[kind]) {
      this.#blocked = true;
      throw new Error("PROVIDER_BUDGET_EXCEEDED");
    }
    const sequence = this.#records.filter((entry) => entry.phase === "INTENT").length + 1;
    const intent = Object.freeze({ scenarioId, kind, phase: "INTENT" as const, sequence, request });
    await this.record(intent);
    this.#records.push(intent);
    const result = await call();
    const completed = Object.freeze({ scenarioId, kind, phase: "COMPLETED" as const, sequence, request });
    await this.record(completed, result);
    this.#records.push(completed);
    return result;
  }
}

export function budgetRecordsFromPayload(value: unknown): readonly BudgetRecord[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) throw new Error("PROVIDER_BUDGET_LEDGER_INVALID");
  const records: BudgetRecord[] = [];
  for (const entry of value) records.push(parseBudgetRecord(entry));
  return Object.freeze(records);
}

function parseBudgetRecord(value: unknown): BudgetRecord {
  if (!isRecord(value) || !isScenario(value.scenarioId)) throw invalidBudgetLedger();
  if (!isKind(value.kind) || !isPhase(value.phase)) throw invalidBudgetLedger();
  if (typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence)) throw invalidBudgetLedger();
  if (!isRequest(value.request)) throw invalidBudgetLedger();
  return Object.freeze({
    scenarioId: value.scenarioId,
    kind: value.kind,
    phase: value.phase,
    sequence: value.sequence,
    request: Object.freeze({
      path: value.request.path,
      canonicalBody: value.request.canonicalBody,
      operationKey: value.request.operationKey,
      wireFingerprint: value.request.wireFingerprint,
    }),
  });
}

function isKind(value: unknown): value is ProviderCallKind {
  return value === "GET" || value === "POST";
}

function isPhase(value: unknown): value is BudgetRecord["phase"] {
  return value === "INTENT" || value === "COMPLETED";
}

function isRequest(value: unknown): value is BudgetRecord["request"] {
  return isRecord(value) && typeof value.path === "string"
    && nullableString(value.canonicalBody)
    && nullableString(value.operationKey)
    && nullableString(value.wireFingerprint);
}

export function protectedPostRequest(
  wire: TossRefundCancellationWireRequest,
  canonicalBody: string,
): BudgetRecord["request"] {
  const prefix = "/v1/payments/";
  const suffix = "/cancel";
  if (!wire.path.startsWith(prefix) || !wire.path.endsWith(suffix)) {
    throw new Error("PROVIDER_REQUEST_PATH_INVALID");
  }
  const paymentKey = decodeURIComponent(wire.path.slice(prefix.length, -suffix.length));
  return Object.freeze({
    path: wire.path,
    canonicalBody,
    operationKey: wire.idempotencyKey,
    wireFingerprint: fingerprintTossRefundWireRequest({
      paymentKey,
      providerOperationKey: wire.idempotencyKey,
      cancelAmount: wire.body.cancelAmount,
    }),
  });
}

function emptyProtectedRequest(path: string): BudgetRecord["request"] {
  return Object.freeze({ path, canonicalBody: null, operationKey: null, wireFingerprint: null });
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function invalidBudgetLedger(): Error {
  return new Error("PROVIDER_BUDGET_LEDGER_INVALID");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScenario(value: unknown): value is H1Scenario {
  return value === "S1" || value === "S2" || value === "S3"
    || value === "S4" || value === "S5" || value === "S6";
}
