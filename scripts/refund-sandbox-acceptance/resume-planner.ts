import {
  canonicalS3HistoryState,
  canonicalS3Record,
  canonicalS3Requests,
  prepareS3History,
  sameBudgetRequest,
  type BudgetRecord,
  type CanonicalS3Call,
  type PairedS3History,
  type ParsedS3Record,
  type S3Continuation,
  type S3DurableState,
  type S3HistoryClassification,
  type S3HistoryExpectation,
  type S3Step,
} from "./budget-ledger";
import { deriveTossRefundOperationKey } from "../../src/lib/payment/refund/providers/toss/refund-operation-key";
import type { H1Command } from "./contracts";
import type { ProviderFixture } from "./fixture-manifest";
import type { H1LedgerPhase } from "./run-ledger";

export type ResumeAction =
  | "RESUME_SETUP"
  | "GET_ONLY"
  | "REPORT_ONLY"
  | "HUMAN_POST_DECISION_REQUIRED"
  | "STOP_REVIEW_REQUIRED";

export type S3CommandAuthority = S3CommandAuthorityValue;
export type S3ContinuationCapability = S3ContinuationCapabilityValue;
export type S3CapabilityRuntimeState = S3DurableState & Readonly<{ budgetContext: object }>;
export type ConsumedS3ContinuationCapability = Readonly<{
  capability: object;
  call: CanonicalS3Call;
}>;

export type S3CommandPlan =
  | Readonly<{
    kind: "CONTINUE_WITH_PROVIDER_CALLS";
    continuation: S3Continuation;
    authority: S3CommandAuthority;
  }>
  | Readonly<{ kind: "FINALIZE_COMPLETE_PROOF" }>
  | Readonly<{ kind: "RETURN"; code: "REPORT_ONLY" | "HUMAN_POST_DECISION_REQUIRED" | "S3_REVIEW_REQUIRED" }>
  | Readonly<{ kind: "MARK_HUMAN_POST_DECISION_REQUIRED" }>
  | Readonly<{ kind: "TERMINALIZE" }>
  | Readonly<{ kind: "REJECT"; code: "EXECUTE_PHASE_INVALID" | "RESUME_POST_NOT_AUTHORIZED" | "RESUME_REVIEW_REQUIRED" }>;
export type S3CommandDecision = Readonly<{
  history: S3HistoryClassification;
  plan: S3CommandPlan;
}>;

type S3PlannedAction = Exclude<S3CommandPlan, Readonly<{
  kind: "CONTINUE_WITH_PROVIDER_CALLS";
  continuation: S3Continuation;
  authority: S3CommandAuthority;
}>> | Readonly<{ kind: "CONTINUE_WITH_PROVIDER_CALLS"; continuation: S3Continuation }>;
type S3StateBinding = Readonly<{
  runId: string;
  revision: number;
  phase: H1LedgerPhase;
  historyState: string;
  completedPrefix: 0 | 1 | 2 | 3 | 4;
}>;
type S3CommandAuthorityState = {
  expectation: S3HistoryExpectation;
  continuation: S3Continuation;
  humanDecisionAuthorized: boolean;
  expected: S3StateBinding;
  issued: boolean;
  terminal: boolean;
};
type S3CapabilityState = {
  authority: S3CommandAuthority;
  budgetContext: object;
  binding: S3StateBinding;
  step: S3Step;
  expectedCall: CanonicalS3Call;
  consumed: boolean;
  completionRecorded: boolean;
};

class S3CommandAuthorityValue {
  readonly #runtimeBrand = "S3_COMMAND_AUTHORITY";

  runtimeBrand(): string {
    return this.#runtimeBrand;
  }
}

class S3ContinuationCapabilityValue {
  readonly #runtimeBrand = "S3_CONTINUATION_CAPABILITY";

  runtimeBrand(): string {
    return this.#runtimeBrand;
  }
}

const S3_COMMAND_AUTHORITIES = new WeakMap<S3CommandAuthority, S3CommandAuthorityState>();
const S3_CONTINUATION_CAPABILITIES = new WeakMap<object, S3CapabilityState>();

type StepState = Readonly<{ previousIndex: number; transactionIdentityHmac: string | null }>;
type StepEvaluation = Readonly<{ kind: "CONTINUE"; state: StepState }>
  | Readonly<{ kind: "TERMINAL"; classification: S3HistoryClassification }>;
type CompletionMatch = Readonly<{ kind: "MATCH"; completion: ParsedS3Record }>
  | Readonly<{ kind: "TERMINAL"; classification: S3HistoryClassification }>;

export function planResume(phase: H1LedgerPhase, lookupStillEligible = false): ResumeAction {
  if (phase === "POST_INTENT_RECORDED") {
    return lookupStillEligible ? "HUMAN_POST_DECISION_REQUIRED" : "GET_ONLY";
  }
  const actions: Partial<Record<H1LedgerPhase, ResumeAction>> = {
    PLANNED: "RESUME_SETUP",
    BOOTSTRAPPED: "RESUME_SETUP",
    POST_RESPONSE_RECORDED: "GET_ONLY",
    LOCAL_COMMIT_COMPLETE: "REPORT_ONLY",
    SEALED: "REPORT_ONLY",
    DB_CLEANED: "REPORT_ONLY",
    HUMAN_POST_DECISION_REQUIRED: "HUMAN_POST_DECISION_REQUIRED",
    REVIEW_REQUIRED: "STOP_REVIEW_REQUIRED",
  };
  return actions[phase] ?? "STOP_REVIEW_REQUIRED";
}

export function classifyS3History(
  value: unknown,
  expectation: S3HistoryExpectation,
): S3HistoryClassification {
  const canonical = canonicalS3Requests(expectation);
  if (!canonical) return malformedHistory();
  const prepared = prepareS3History(value);
  if (prepared.kind === "EMPTY") return Object.freeze({ kind: "EMPTY", completedSteps: 0 });
  if (prepared.kind === "MALFORMED") return malformedHistory();
  return classifyPairedHistory(prepared, canonical);
}

export function createS3HistoryExpectation(
  runId: string,
  fixture: ProviderFixture,
): S3HistoryExpectation {
  return Object.freeze({
    paymentKey: fixture.paymentKey,
    providerOperationKey: deriveTossRefundOperationKey(`h1:${runId}:S3`),
    cancelAmount: fixture.amount,
  });
}

export function assertExactS3ReplayCallHistory(
  records: unknown,
  expectation: S3HistoryExpectation,
): void {
  if (classifyS3History(records, expectation).kind !== "COMPLETE_SUCCESS") {
    throw new Error("S3_REPLAY_PROBE_FAILED");
  }
}

export function s3ContinuationStart(
  continuation: S3Continuation,
  history: S3HistoryClassification,
): 1 | 2 | 3 | 4 | 5 {
  if (continuation === "FULL_SEQUENCE") {
    if (history.kind === "EMPTY") return 1;
    if (successfulPrefix(history, 1)) return 2;
  }
  if (continuation === "POST_REPLAY" && successfulPrefix(history, 2)) return 3;
  if (continuation === "FINAL_LOOKUP" && successfulPrefix(history, 3)) return 4;
  if (continuation === "DURABLE_PROOF" && history.kind === "COMPLETE_SUCCESS") return 5;
  throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
}

export function planS3Command(
  command: Extract<H1Command, "execute" | "resume" | "resume-post">,
  state: S3DurableState,
  expectation: S3HistoryExpectation,
  localReplayCommitted: boolean,
): S3CommandDecision {
  const history = classifyS3History(state.history, expectation);
  const action = selectS3Action(command, state.phase, history, localReplayCommitted);
  if (action.kind !== "CONTINUE_WITH_PROVIDER_CALLS") {
    return Object.freeze({ history, plan: action });
  }
  const authority = createS3CommandAuthority(state, expectation, history, action.continuation);
  return Object.freeze({
    history,
    plan: Object.freeze({
      kind: "CONTINUE_WITH_PROVIDER_CALLS",
      continuation: action.continuation,
      authority,
    }),
  });
}

export function issueS3ContinuationCapability(
  authority: S3CommandAuthority,
  state: S3CapabilityRuntimeState,
): S3ContinuationCapability {
  const authorization = S3_COMMAND_AUTHORITIES.get(authority);
  if (!authorization || authorization.issued || authorization.terminal) {
    throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
  }
  const binding = bindS3State(state, authorization.expectation);
  if (!sameS3StateBinding(binding, authorization.expected)) throw staleS3Capability();
  const step = nextAuthorizedStep(authorization.continuation, binding.completedPrefix);
  const expectedCall = canonicalS3Requests(authorization.expectation)?.[step - 1];
  if (!expectedCall || humanDecisionMissing(authorization, step)) {
    throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
  }
  const capability = Object.preventExtensions(new S3ContinuationCapabilityValue());
  S3_CONTINUATION_CAPABILITIES.set(capability, {
    authority,
    budgetContext: state.budgetContext,
    binding,
    step,
    expectedCall,
    consumed: false,
    completionRecorded: false,
  });
  authorization.issued = true;
  return capability;
}

export function consumeS3ContinuationCapability(
  value: unknown,
  input: Readonly<{
    state: S3CapabilityRuntimeState;
    kind: BudgetRecord["kind"];
  }>,
): ConsumedS3ContinuationCapability {
  const capability = runtimeS3Capability(value);
  const entry = S3_CONTINUATION_CAPABILITIES.get(capability);
  if (!entry || entry.consumed || entry.budgetContext !== input.state.budgetContext) {
    throw new Error("S3_CONTINUATION_CAPABILITY_INVALID");
  }
  const authorization = S3_COMMAND_AUTHORITIES.get(entry.authority);
  if (!authorization || authorization.terminal) throw new Error("S3_CONTINUATION_CAPABILITY_INVALID");
  const current = bindS3State(input.state, authorization.expectation);
  const currentCall = canonicalS3Requests(authorization.expectation)?.[entry.step - 1];
  if (!sameS3StateBinding(current, entry.binding)
    || !matchesIssuedS3Call(currentCall, entry.expectedCall, input.kind)) throw staleS3Capability();
  entry.consumed = true;
  return Object.freeze({ capability, call: currentCall });
}

export function completeS3ContinuationCapability(
  capability: object,
  state: S3CapabilityRuntimeState,
): void {
  const entry = S3_CONTINUATION_CAPABILITIES.get(capability);
  if (!entry || !entry.consumed || entry.completionRecorded
    || entry.budgetContext !== state.budgetContext) {
    throw new Error("S3_CONTINUATION_CAPABILITY_INVALID");
  }
  const authorization = S3_COMMAND_AUTHORITIES.get(entry.authority);
  if (!authorization) throw new Error("S3_CONTINUATION_CAPABILITY_INVALID");
  entry.completionRecorded = true;
  authorization.issued = false;
  const current = bindS3StateOrNull(state, authorization.expectation);
  if (!current || current.completedPrefix !== entry.step) {
    authorization.terminal = true;
    return;
  }
  authorization.expected = current;
}

function selectS3Action(
  command: Extract<H1Command, "execute" | "resume" | "resume-post">,
  phase: H1LedgerPhase,
  history: S3HistoryClassification,
  localReplayCommitted: boolean,
): S3PlannedAction {
  if (phase === "REVIEW_REQUIRED") {
    return Object.freeze({ kind: "RETURN", code: "S3_REVIEW_REQUIRED" });
  }
  if (terminalHistory(history)) return Object.freeze({ kind: "TERMINALIZE" });
  if (localReplayCommitted || reportOnlyPhase(phase)) {
    return Object.freeze({ kind: "RETURN", code: "REPORT_ONLY" });
  }
  if (command === "resume-post") return planS3ResumePost(phase, history);
  if (command === "execute") return planS3Execute(phase, history);
  return planS3Resume(phase, history);
}

function createS3CommandAuthority(
  state: S3DurableState,
  expectation: S3HistoryExpectation,
  history: S3HistoryClassification,
  continuation: S3Continuation,
): S3CommandAuthority {
  s3ContinuationStart(continuation, history);
  const authority = Object.preventExtensions(new S3CommandAuthorityValue());
  S3_COMMAND_AUTHORITIES.set(authority, {
    expectation: Object.freeze({ ...expectation }),
    continuation,
    humanDecisionAuthorized: continuation !== "POST_REPLAY"
      || state.phase === "HUMAN_POST_DECISION_REQUIRED",
    expected: bindS3State(state, expectation),
    issued: false,
    terminal: false,
  });
  return authority;
}

function bindS3State(
  state: S3DurableState,
  expectation: S3HistoryExpectation,
): S3StateBinding {
  const binding = bindS3StateOrNull(state, expectation);
  if (!binding) throw staleS3Capability();
  return binding;
}

function bindS3StateOrNull(
  state: S3DurableState,
  expectation: S3HistoryExpectation,
): S3StateBinding | null {
  const historyState = canonicalS3HistoryState(state.history);
  const completedPrefix = completedPrefixFor(classifyS3History(state.history, expectation));
  if (!historyState || completedPrefix === null) return null;
  return Object.freeze({
    runId: state.runId,
    revision: state.revision,
    phase: state.phase,
    historyState,
    completedPrefix,
  });
}

function completedPrefixFor(
  history: S3HistoryClassification,
): 0 | 1 | 2 | 3 | 4 | null {
  if (history.kind === "EMPTY" || history.kind === "SUCCESSFUL_PREFIX"
    || history.kind === "COMPLETE_SUCCESS") return history.completedSteps;
  return null;
}

function sameS3StateBinding(first: S3StateBinding, second: S3StateBinding): boolean {
  return first.runId === second.runId && first.revision === second.revision
    && first.phase === second.phase && first.historyState === second.historyState
    && first.completedPrefix === second.completedPrefix;
}

function matchesIssuedS3Call(
  current: CanonicalS3Call | undefined,
  issued: CanonicalS3Call,
  kind: BudgetRecord["kind"],
): current is CanonicalS3Call {
  return Boolean(current && kind === issued.kind && current.kind === issued.kind
    && sameBudgetRequest(current.request, issued.request));
}

function nextAuthorizedStep(
  continuation: S3Continuation,
  completedPrefix: 0 | 1 | 2 | 3 | 4,
): S3Step {
  const start = continuationStartPrefix(continuation);
  if (completedPrefix < start || completedPrefix >= 4) {
    throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
  }
  if (continuation === "FINAL_LOOKUP" && completedPrefix !== 3) {
    throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
  }
  return asS3Step(completedPrefix + 1) ?? invalidS3Step();
}

function continuationStartPrefix(continuation: S3Continuation): 0 | 1 | 2 | 3 {
  if (continuation === "FULL_SEQUENCE") return 0;
  if (continuation === "POST_REPLAY") return 2;
  if (continuation === "FINAL_LOOKUP") return 3;
  throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
}

function humanDecisionMissing(authorization: S3CommandAuthorityState, step: S3Step): boolean {
  return step === 3 && authorization.continuation === "POST_REPLAY"
    && !authorization.humanDecisionAuthorized;
}

function runtimeS3Capability(value: unknown): object {
  if (typeof value !== "object" || value === null
    || !S3_CONTINUATION_CAPABILITIES.has(value)) {
    throw new Error("S3_CONTINUATION_CAPABILITY_INVALID");
  }
  return value;
}

function staleS3Capability(): Error {
  return new Error("S3_CONTINUATION_CAPABILITY_STALE");
}

function invalidS3Step(): never {
  throw new Error("S3_CONTINUATION_NOT_AUTHORIZED");
}

function classifyPairedHistory(
  history: PairedS3History,
  canonical: readonly CanonicalS3Call[],
): S3HistoryClassification {
  let state: StepState = Object.freeze({ previousIndex: -1, transactionIdentityHmac: null });
  for (let value = 1; value <= history.maximum; value += 1) {
    const step = asS3Step(value);
    if (!step) return malformedHistory();
    const evaluation = evaluateStep(history, canonical, step, state);
    if (evaluation.kind === "TERMINAL") return evaluation.classification;
    state = evaluation.state;
  }
  if (history.records.length !== history.maximum * 2) return malformedHistory();
  return completedHistory(history.maximum);
}

function evaluateStep(
  history: PairedS3History,
  canonical: readonly CanonicalS3Call[],
  step: S3Step,
  state: StepState,
): StepEvaluation {
  const match = matchCompletedStep(history, canonical, step, state);
  if (match.kind === "TERMINAL") return match;
  const evidence = match.completion.record.completionEvidence;
  if (!evidence || !completionBelongsToStep(evidence.classification, step)) {
    return terminalStep(malformedHistory());
  }
  if (!successfulCompletion(evidence.classification, step)
    || identityMismatch(state.transactionIdentityHmac, evidence.transactionIdentityHmac)) {
    return terminalStep(failedStep(history, step));
  }
  return Object.freeze({
    kind: "CONTINUE",
    state: Object.freeze({
      previousIndex: match.completion.index,
      transactionIdentityHmac: evidence.transactionIdentityHmac ?? state.transactionIdentityHmac,
    }),
  });
}

function matchCompletedStep(
  history: PairedS3History,
  canonical: readonly CanonicalS3Call[],
  step: S3Step,
  state: StepState,
): CompletionMatch {
  const intent = history.intents.get(step);
  const expected = canonical[step - 1];
  if (!intent || intent.index <= state.previousIndex || !canonicalS3Record(intent.record, expected)) {
    return terminalStep(malformedHistory());
  }
  const completion = history.completions.get(step);
  if (!completion) return terminalStep(incompleteStep(history, step));
  if (completion.index <= intent.index
    || !sameBudgetRequest(completion.record.request, intent.record.request)
    || !canonicalS3Record(completion.record, expected)) return terminalStep(malformedHistory());
  return Object.freeze({ kind: "MATCH", completion });
}

function planS3ResumePost(
  phase: H1LedgerPhase,
  history: S3HistoryClassification,
): S3PlannedAction {
  const authorized = phase === "HUMAN_POST_DECISION_REQUIRED"
    && history.kind === "SUCCESSFUL_PREFIX" && history.completedSteps === 2;
  return authorized
    ? Object.freeze({ kind: "CONTINUE_WITH_PROVIDER_CALLS", continuation: "POST_REPLAY" })
    : Object.freeze({ kind: "REJECT", code: "RESUME_POST_NOT_AUTHORIZED" });
}

function planS3Execute(phase: H1LedgerPhase, history: S3HistoryClassification): S3PlannedAction {
  if (history.kind === "COMPLETE_SUCCESS") {
    return Object.freeze({ kind: "FINALIZE_COMPLETE_PROOF" });
  }
  const resumable = history.kind === "EMPTY"
    || history.kind === "SUCCESSFUL_PREFIX" && history.completedSteps === 1;
  return (phase === "PLANNED" || phase === "BOOTSTRAPPED") && resumable
    ? Object.freeze({ kind: "CONTINUE_WITH_PROVIDER_CALLS", continuation: "FULL_SEQUENCE" })
    : Object.freeze({ kind: "REJECT", code: "EXECUTE_PHASE_INVALID" });
}

function planS3Resume(phase: H1LedgerPhase, history: S3HistoryClassification): S3PlannedAction {
  const action = planResume(phase);
  if (action === "REPORT_ONLY") return Object.freeze({ kind: "RETURN", code: "REPORT_ONLY" });
  if (action === "HUMAN_POST_DECISION_REQUIRED") {
    return Object.freeze({ kind: "RETURN", code: "HUMAN_POST_DECISION_REQUIRED" });
  }
  if (history.kind === "COMPLETE_SUCCESS") {
    return Object.freeze({ kind: "FINALIZE_COMPLETE_PROOF" });
  }
  if (history.kind === "EMPTY") return planEmptyResume(action);
  if (history.kind === "SUCCESSFUL_PREFIX") return planPrefixResume(phase, action, history.completedSteps);
  return Object.freeze({ kind: "REJECT", code: "RESUME_REVIEW_REQUIRED" });
}

function planEmptyResume(action: ResumeAction): S3PlannedAction {
  return action === "RESUME_SETUP"
    ? Object.freeze({ kind: "CONTINUE_WITH_PROVIDER_CALLS", continuation: "FULL_SEQUENCE" })
    : Object.freeze({ kind: "REJECT", code: "RESUME_REVIEW_REQUIRED" });
}

function planPrefixResume(
  phase: H1LedgerPhase,
  action: ResumeAction,
  completedSteps: 1 | 2 | 3,
): S3PlannedAction {
  if (completedSteps === 1) return planEmptyResume(action);
  if (completedSteps === 2 && phase === "POST_RESPONSE_RECORDED") {
    return Object.freeze({ kind: "MARK_HUMAN_POST_DECISION_REQUIRED" });
  }
  if (completedSteps === 3 && action === "GET_ONLY") {
    return Object.freeze({ kind: "CONTINUE_WITH_PROVIDER_CALLS", continuation: "FINAL_LOOKUP" });
  }
  return Object.freeze({ kind: "REJECT", code: "RESUME_REVIEW_REQUIRED" });
}

function incompleteStep(history: PairedS3History, step: S3Step): S3HistoryClassification {
  return step === history.maximum && history.records.length === history.maximum * 2 - 1
    ? Object.freeze({ kind: "INCOMPLETE", incompleteStep: step }) : malformedHistory();
}

function failedStep(history: PairedS3History, step: S3Step): S3HistoryClassification {
  return step === history.maximum
    ? Object.freeze({ kind: "FAILED", failedStep: step }) : malformedHistory();
}

function completedHistory(maximum: number): S3HistoryClassification {
  if (maximum === 4) return Object.freeze({ kind: "COMPLETE_SUCCESS", completedSteps: 4 });
  if (maximum === 1 || maximum === 2 || maximum === 3) {
    return Object.freeze({ kind: "SUCCESSFUL_PREFIX", completedSteps: maximum });
  }
  return malformedHistory();
}

function terminalStep(
  classification: S3HistoryClassification,
): Readonly<{ kind: "TERMINAL"; classification: S3HistoryClassification }> {
  return Object.freeze({ kind: "TERMINAL", classification });
}

function completionBelongsToStep(classification: string, step: S3Step): boolean {
  if (step === 1) return classification.startsWith("INITIAL_GET_");
  if (step === 2 || step === 3) return classification.startsWith("POST_");
  return classification.startsWith("FINAL_GET_");
}

function successfulCompletion(classification: string, step: S3Step): boolean {
  if (step === 1) return classification === "INITIAL_GET_ELIGIBLE";
  if (step === 2 || step === 3) return classification === "POST_ACCEPTED";
  return classification === "FINAL_GET_EXACT_SUCCESS";
}

function identityMismatch(first: string | null, second: string | null): boolean {
  return Boolean(first && second && first !== second);
}

function successfulPrefix(
  history: S3HistoryClassification,
  completedSteps: 1 | 2 | 3,
): boolean {
  return history.kind === "SUCCESSFUL_PREFIX" && history.completedSteps === completedSteps;
}

function terminalHistory(history: S3HistoryClassification): history is Extract<
  S3HistoryClassification,
  Readonly<{ kind: "FAILED" | "INCOMPLETE" | "MALFORMED" }>
> {
  return history.kind === "FAILED" || history.kind === "INCOMPLETE" || history.kind === "MALFORMED";
}

function reportOnlyPhase(phase: H1LedgerPhase): boolean {
  return phase === "LOCAL_COMMIT_COMPLETE" || phase === "SEALED" || phase === "DB_CLEANED";
}

function malformedHistory(): S3HistoryClassification {
  return Object.freeze({ kind: "MALFORMED" });
}

function asS3Step(value: number): S3Step | null {
  return value === 1 || value === 2 || value === 3 || value === 4 ? value : null;
}
