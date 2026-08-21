import {
  RefundProviderContractError,
  normalizeRefundProviderObservation,
  normalizeRefundProviderRequest,
  type RefundProviderObservation,
  type RefundProviderPort,
  type RefundProviderRequest,
} from "../provider-port";

const PLAN_FIELDS: readonly string[] = ["providerOperationKey", "expectedRequest", "observation"];

export type DeterministicMockRefundPlan = Readonly<{
  providerOperationKey: string;
  expectedRequest: RefundProviderRequest;
  observation: RefundProviderObservation;
}>;

type StoredPlan = Readonly<{
  expectedRequest: RefundProviderRequest;
  observation: RefundProviderObservation;
}>;

export class InvalidMockRefundPlanError extends Error {
  readonly code = "INVALID_MOCK_REFUND_PLAN";

  constructor() {
    super("Deterministic MOCK refund plan is invalid.");
    this.name = "InvalidMockRefundPlanError";
  }
}

export class MockRefundPlanNotFoundError extends Error {
  readonly code = "MOCK_REFUND_PLAN_NOT_FOUND";

  constructor() {
    super("Deterministic MOCK refund plan was not found.");
    this.name = "MockRefundPlanNotFoundError";
  }
}

export class RefundProviderIdentityConflictError extends Error {
  readonly code = "REFUND_PROVIDER_IDENTITY_CONFLICT";

  constructor() {
    super("Refund provider operation identity conflicts with the configured request.");
    this.name = "RefundProviderIdentityConflictError";
  }
}

export class DeterministicMockRefundProvider implements RefundProviderPort {
  readonly #plans: Map<string, StoredPlan>;
  #physicalInvocationCount = 0;

  constructor(plans: readonly DeterministicMockRefundPlan[]) {
    this.#plans = buildPlanMap(plans);
  }

  get configuredOperationCount(): number {
    return this.#plans.size;
  }

  get physicalInvocationCount(): number {
    return this.#physicalInvocationCount;
  }

  refund(request: RefundProviderRequest): Promise<RefundProviderObservation> {
    const normalized = normalizeRefundProviderRequest(request);
    const plan = this.#plans.get(normalized.providerOperationKey);
    this.#physicalInvocationCount += 1;
    if (!plan) return Promise.reject(new MockRefundPlanNotFoundError());
    if (!sameRequest(plan.expectedRequest, normalized)) {
      return Promise.reject(new RefundProviderIdentityConflictError());
    }
    return Promise.resolve(normalizeRefundProviderObservation(plan.observation));
  }
}

function buildPlanMap(plans: readonly DeterministicMockRefundPlan[]): Map<string, StoredPlan> {
  const stored = new Map<string, StoredPlan>();
  for (const plan of plans) addPlan(stored, plan);
  return stored;
}

function addPlan(stored: Map<string, StoredPlan>, plan: DeterministicMockRefundPlan): void {
  if (!hasExactPlanFields(plan)) throw new InvalidMockRefundPlanError();
  const planKey = normalizePlanKey(plan.providerOperationKey);
  let expectedRequest: RefundProviderRequest;
  let observation: RefundProviderObservation;
  try {
    expectedRequest = normalizeRefundProviderRequest(plan.expectedRequest);
    observation = normalizeRefundProviderObservation(plan.observation);
  } catch (error) {
    if (error instanceof RefundProviderContractError) throw error;
    throw new InvalidMockRefundPlanError();
  }
  if (planKey !== expectedRequest.providerOperationKey || stored.has(planKey)) {
    throw new InvalidMockRefundPlanError();
  }
  stored.set(planKey, Object.freeze({ expectedRequest, observation }));
}

function normalizePlanKey(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new InvalidMockRefundPlanError();
  return value.trim();
}

function hasExactPlanFields(plan: DeterministicMockRefundPlan): boolean {
  const keys = Reflect.ownKeys(plan);
  return keys.length === PLAN_FIELDS.length
    && keys.every((key) => typeof key === "string" && PLAN_FIELDS.includes(key));
}

function sameRequest(left: RefundProviderRequest, right: RefundProviderRequest): boolean {
  return left.providerOperationKey === right.providerOperationKey
    && left.providerPaymentReference === right.providerPaymentReference
    && left.amount === right.amount
    && left.currency === right.currency;
}
