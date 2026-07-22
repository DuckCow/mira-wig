import { types as nodeTypes } from "node:util";

export const REFUND_SANDBOX_CANARY_APPROVAL_FORMAT =
  "mira-refund-sandbox-canary-approval/v1";
export const REFUND_SANDBOX_CANARY_EVIDENCE_FORMAT =
  "mira-refund-sandbox-canary-evidence/v1";

export const REFUND_SANDBOX_CANARY_APPROVAL_GATES = Object.freeze([
  "RELEASE_IMMUTABILITY_VERIFIED",
  "ISOLATED_GCP_ENVIRONMENT_VERIFIED",
  "CLOUD_RUN_JOB_CONFIGURATION_VERIFIED",
  "MANUAL_ONLY_NO_SCHEDULER_VERIFIED",
  "NO_EXECUTION_OVERRIDES_VERIFIED",
  "IAM_SEPARATION_VERIFIED",
  "PINNED_SANDBOX_SECRET_VERIFIED",
  "ISOLATED_DATABASE_AND_TARGET_VERIFIED",
  "CONCURRENT_ADMISSION_VERIFIED",
  "SEQUENTIAL_DUPLICATE_SAFETY_VERIFIED",
  "OBSERVABILITY_VERIFIED",
  "ALERT_DELIVERY_VERIFIED",
  "STAFFED_WINDOW_VERIFIED",
  "EMERGENCY_STOP_VERIFIED",
  "PROVIDER_FREE_PREFLIGHT_VERIFIED",
  "DURABLE_SINGLE_USE_APPROVAL_CONSUMPTION_VERIFIED",
  "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
  "POST_EXECUTION_CONTAINMENT_VERIFIED",
] as const);

export const REFUND_SANDBOX_CANARY_SOURCE_KINDS = Object.freeze([
  "SOURCE_BUILD_ATTESTATION",
  "ARTIFACT_REGISTRY_EVIDENCE",
  "CLOUD_RUN_JOB_EVIDENCE",
  "IAM_POLICY_EVIDENCE",
  "CLOUD_SQL_EVIDENCE",
  "SECRET_VERSION_EVIDENCE",
  "ADMISSION_TEST_EVIDENCE",
  "DUPLICATE_SAFETY_TEST_EVIDENCE",
  "ALERT_DELIVERY_EVIDENCE",
  "STAFFED_WINDOW_APPROVAL",
  "PREFLIGHT_EXECUTION_EVIDENCE",
  "EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE",
  "EMERGENCY_STOP_EVIDENCE",
  "CONTAINMENT_PLAN_EVIDENCE",
  "SINGLE_USE_CONSUMPTION_EVIDENCE",
] as const);

export type RefundSandboxCanaryApprovalGate =
  (typeof REFUND_SANDBOX_CANARY_APPROVAL_GATES)[number];
export type RefundSandboxCanarySourceKind =
  (typeof REFUND_SANDBOX_CANARY_SOURCE_KINDS)[number];
export type RefundSandboxCanaryOperatingMode =
  | "DISTINCT_HUMAN_OPERATORS"
  | "SINGLE_OPERATOR_EXCEPTION";

export type RefundSandboxCanaryEvidenceReadinessDecision = Readonly<{
  formatVersion: typeof REFUND_SANDBOX_CANARY_APPROVAL_FORMAT;
  code: "SANDBOX_CANARY_APPROVAL_BLOCKED"
    | "SANDBOX_CANARY_EVIDENCE_READY_FOR_TRUSTED_ISSUER";
  executionAuthorization: "NOT_ISSUED";
  provenanceTrust: "NOT_VERIFIED_BY_PURE_EVALUATOR";
  scheduledOperation: "BLOCKED";
  liveOperation: "BLOCKED";
  intendedExecutionLimit: 1;
  triggerMode: "MANUAL_ONLY";
  operatorSeparation: "VERIFIED_DISTINCT_HUMANS"
    | "ABSENT_SINGLE_OPERATOR_EXCEPTION"
    | "UNDETERMINED";
  gates: readonly Readonly<{
    id: RefundSandboxCanaryApprovalGate;
    status: "READY" | "BLOCKED";
  }>[];
  blockers: readonly (RefundSandboxCanaryApprovalGate | "APPROVAL_EVIDENCE_INVALID")[];
}>;

type RefundSandboxCanaryGateState = Readonly<{
  id: RefundSandboxCanaryApprovalGate;
  status: "READY" | "BLOCKED";
}>;

type SectionName = "release" | "platform" | "job" | "iam" | "secret" | "database"
  | "target" | "admission" | "sequentialSafety" | "observability" | "staffing"
  | "emergencyStop" | "preflight" | "consumption" | "approval" | "containment";
type ExactEvidence = Readonly<{
  operatingMode: RefundSandboxCanaryOperatingMode;
  provenance: Record<string, unknown>;
  sources: ReadonlyMap<RefundSandboxCanarySourceKind, Record<string, unknown>>;
  sections: ReadonlyMap<SectionName, Record<string, unknown>>;
}>;

const OUTER_KEYS = Object.freeze([
  "formatVersion", "operatingMode", "provenance", "release", "platform", "job", "iam",
  "secret", "database", "target", "admission", "sequentialSafety", "observability",
  "staffing", "emergencyStop", "preflight", "consumption", "approval", "containment",
]);
const PROVENANCE_KEYS = Object.freeze([
  "evidenceFormatVersion", "producerKind", "producerVersion", "bundleId", "bundleDigest",
  "issuedAtMs", "sourceRecords", "subjectBindingDigest", "provenanceVerificationExpectation",
]);
const SOURCE_KEYS = Object.freeze([
  "sourceKind", "sourceRecordId", "sourceDigest", "observedAtMs", "subjectDigest",
  "evidenceBindingDigest", "producerReference",
]);
const SECTION_KEYS = new Map<SectionName, readonly string[]>([
  ["release", ["bindingDigest", "gitCommitSha", "canaryImageDigest", "preflightImageDigest",
    "artifactRepository", "canaryJobUid", "canaryApprovedGeneration",
    "canaryObservedGeneration", "canaryApprovedEtag", "canaryObservedEtag",
    "preflightJobUid", "preflightApprovedGeneration", "preflightObservedGeneration",
    "preflightApprovedEtag", "preflightObservedEtag", "canaryJobBindingDigest",
    "preflightJobBindingDigest", "packageLockDigest", "migrationDigest", "sourceBuildEvidenceRecordId",
    "sourceBuildEvidenceDigest", "artifactEvidenceRecordId", "artifactEvidenceDigest"]],
  ["platform", ["bindingDigest", "projectIdentity", "region", "isolatedProject",
    "artifactRegistry", "cloudRunJobs", "cloudSqlPostgres", "secretManager", "cloudLogging",
    "cloudMonitoring", "noProductionDevelopmentAcceptanceData", "noCustomerPii"]],
  ["job", ["bindingDigest", "releaseBindingDigest", "targetBindingDigest", "triggerMode",
    "taskCount", "parallelism", "maxRetries", "taskTimeoutSeconds", "internalBudgetSeconds",
    "containerCount", "schedulerTargetCount", "imageDigestPinned", "entrypointPinned",
    "argumentsPinned", "noShellInterpolation", "liveUnreachable", "evidenceRecordId",
    "evidenceDigest"]],
  ["iam", ["operatingMode", "deployHumanSubjectId", "executeHumanSubjectId",
    "credentialOwnerHumanSubjectId", "deployPrincipalId", "executePrincipalId",
    "credentialOwnerPrincipalId", "preflightRuntimePrincipalId", "canaryRuntimePrincipalId",
    "separateAuthenticatedDeployAndExecutePrincipals", "sharedLoginOrPrincipal",
    "executorHasRunWithOverrides", "executorCanUpdateJob", "executorCanReadSecrets",
    "executorHasBroadCloudRunAuthority", "executorHasDirectDatabaseAccess",
    "deployerCanExecute", "executorCanDeploy",
    "runtimeCanDeployOrModifyIam", "defaultOrSharedRuntimeServiceAccount",
    "serviceAccountKeyPresent", "schedulerIdentityExists", "evidenceRecordId",
    "evidenceDigest"]],
  ["secret", ["bindingDigest", "provider", "mode", "resourceIdentity", "numericVersion",
    "observedNumericVersion", "usesLatest", "sharedProviderSecret", "sharedEnvironmentSecret",
    "liveCredential", "googleApplicationCredentialsPresent", "runtimeAccessLimitedToExactSecrets",
    "evidenceRecordId", "evidenceDigest"]],
  ["database", ["bindingDigest", "environment", "databaseIdentity", "region",
    "exactP3EEnvironmentIdentity", "syntheticOnly", "migrationDigest", "preflightRole",
    "canaryRole", "rolesDistinct", "preflightReadOnly", "canaryNotSuperuser",
    "canaryDoesNotOwnDatabase", "canaryCannotModifySchemaOrMigrations", "evidenceRecordId",
    "evidenceDigest"]],
  ["target", ["bindingDigest", "targetCount", "commandId", "commandRefundAttemptId",
    "refundAttemptId", "refundAttemptPaymentId", "paymentId", "providerOperationBindingId",
    "commandProviderOperationBindingId", "provider", "mode", "commandAmountMinor",
    "refundAmountMinor", "paymentCurrency", "refundCurrency", "syntheticOnly",
    "customerPiiPresent", "initialCommandState", "initialRefundAttemptState", "selectorMode",
    "providerSandboxEvidenceRecordId", "providerOperationLimit", "broadSelectorFallback"]],
  ["admission", ["mechanism", "implementationStatus", "lockAuthorityId",
    "lockKeyDerivationVersion", "dedicatedConnection", "heldForFullProviderCapableExecution",
    "acquisitionBeforeSecretRead", "acquisitionBeforeAdapterConstruction",
    "acquisitionBeforeProviderLookup", "acquisitionBeforeProviderCancellation", "losingResult",
    "losingSecretReadCount", "losingProviderRequestCount", "losingFinancialMutationCount",
    "concurrentTestInvocationCount", "concurrentWinnerCount", "concurrentLoserCount",
    "evidenceRecordId", "evidenceDigest", "releaseBindingDigest", "jobBindingDigest",
    "targetBindingDigest"]],
  ["sequentialSafety", ["commandId", "initialCommandState", "leaseGenerationFencing",
    "leaseTokenFencing", "dispatchOrdinalUniqueness", "commandDispatchCas",
    "contactMarkerBeforeProviderCancellation", "immutableProviderOperationBinding",
    "idempotencyEvidenceBinding", "recoveryStateClassification",
    "unknownOutcomeMapsToPossibleContact", "blindRetryProhibited",
    "firstExecutionBlocksSecondProviderAction", "secondInvocationProviderOperationCount",
    "sequentialTestInvocationCount", "evidenceRecordId", "evidenceDigest",
    "releaseBindingDigest", "jobBindingDigest", "targetBindingDigest"]],
  ["observability", ["executionLogs", "retentionConfigured", "monitoringIncidentPolicy",
    "boundedFailureAlerts", "taskTimeoutAlert", "missingFinalResultAlert", "possibleContactAlert",
    "manualReviewAlert", "overlapSkippedNotification", "credentialConfigurationAlert",
    "notificationChannels", "emailChannelTested", "secondaryChannelTested",
    "sensitiveLabelsExcluded", "evidenceRecordId", "evidenceDigest"]],
  ["staffing", ["ownersAssigned", "ownersReachable", "unattendedExecutionForbidden",
    "preflightWindowMinutes", "continuousObservation", "postExecutionWindowMinutes",
    "noSecondCanaryDuringWindow", "noConcurrentRefundMaintenanceOrMigration",
    "noCredentialRotationDuringWindow", "criticalAcknowledgementMinutes",
    "investigationStartMinutes", "possibleContactPlanMinutes", "evidenceRecordId",
    "evidenceDigest"]],
  ["emergencyStop", ["canCancelExecution", "canRemoveInvocationAuthority",
    "canRemoveSecretAccessAfterStop", "preservesLogsAndDatabaseEvidence",
    "providerFreeObservationsAvailable", "possibleContactClassification",
    "providerRevocationNotInferred", "evidenceRecordId", "evidenceDigest"]],
  ["preflight", ["completed", "noTossSecretBinding",
    "dedicatedRuntimeIdentity", "readOnlyDatabaseRole", "providerAdapterUnreachable",
    "providerNetworkUnreachable", "noFinancialMutation", "checksComplete", "preflightJobUid",
    "preflightApprovedGeneration", "preflightObservedGeneration", "preflightApprovedEtag",
    "preflightObservedEtag", "imageDigest", "migrationDigest", "completedAtMs",
    "evidenceRecordId", "evidenceDigest", "sourceRecordId", "sourceDigest",
    "releaseBindingDigest", "canaryJobBindingDigest", "preflightJobBindingDigest"]],
  ["consumption", ["mechanism", "implementationStatus", "durableStoreAuthority", "approvalId",
    "independentTestStatus", "releaseBindingDigest", "canaryJobBindingDigest",
    "preflightJobBindingDigest", "imageBindingDigest",
    "secretGenerationBindingDigest", "targetBindingDigest", "consumeBeforeProviderCapableExecution",
    "consumeBeforeSecretRead", "atomicCompareAndSet", "unconsumedToConsumedOnly",
    "secondConsumptionRejected", "consumptionPersistsOnSuccess", "consumptionPersistsOnFailure",
    "consumptionPersistsOnCancellation", "consumptionPersistsOnTimeout",
    "consumptionPersistsOnAmbiguousOutcome", "executionLimit", "evidenceRecordId",
    "evidenceDigest", "implementationTestProvenance"]],
  ["approval", ["approvalId", "approvalEvidenceRecordId", "approvalEvidenceDigest",
    "approvalSourceRecordId", "approvalSourceDigest", "approvalMode",
    "approvingHumanSubjectId", "authenticatedPrincipalId", "postPreflightDeliberateApproval",
    "approvedAtMs", "expiresAtMs", "preflightEvidenceRecordId", "preflightEvidenceDigest",
    "preflightCompletedAtMs", "releaseBindingDigest", "canaryJobBindingDigest",
    "preflightJobBindingDigest", "imageBindingDigest", "secretGenerationBindingDigest",
    "targetBindingDigest", "riskAcceptanceReference", "intendedExecutionLimit"]],
  ["containment", ["approvalId", "targetBindingDigest", "automaticSecondExecutionForbidden",
    "invocationAuthorityRemovedAfterExecution", "schedulerRemainsAbsent",
    "jobConfigurationRetainedForAudit", "executionIdentityRecorded", "releaseIdentityRecorded",
    "secretAccessRemovedAfterSafeStop", "evidenceRetained",
    "manualAndReconciliationSnapshotCaptured", "possibleContactBlocksNextCanary",
    "blindRetryForbidden", "noSecondExecutionBeforeReconciliation", "evidenceRecordId",
    "evidenceDigest"]],
]);
const MAX_APPROVAL_LIFETIME_MS = 60 * 60 * 1_000;
const SINGLE_OPERATOR_REQUIRED_GATES = Object.freeze([
  "IAM_SEPARATION_VERIFIED",
  "MANUAL_ONLY_NO_SCHEDULER_VERIFIED",
  "NO_EXECUTION_OVERRIDES_VERIFIED",
  "ISOLATED_DATABASE_AND_TARGET_VERIFIED",
  "PROVIDER_FREE_PREFLIGHT_VERIFIED",
  "EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED",
  "POST_EXECUTION_CONTAINMENT_VERIFIED",
] as const satisfies readonly RefundSandboxCanaryApprovalGate[]);

export function evaluateRefundSandboxCanaryEvidenceReadiness(
  value: unknown,
  authoritativeNowMs: unknown,
): RefundSandboxCanaryEvidenceReadinessDecision {
  const evidence = safelyParseEvidence(value);
  if (!evidence || !nonnegativeSafeInteger(authoritativeNowMs)) return invalidDecision();
  const provenanceConsistent = provenanceInternallyConsistent(evidence);
  const ready = REFUND_SANDBOX_CANARY_APPROVAL_GATES.map((id) => ({
    id,
    status: provenanceConsistent && GATE_CHECKS[id](evidence, authoritativeNowMs)
      ? "READY" as const : "BLOCKED" as const,
  }));
  const blockers = ready.filter((gate) => gate.status === "BLOCKED").map((gate) => gate.id);
  const separationMode = operatorModeFromFinalGates(evidence.operatingMode, ready);
  return decision(separationMode, ready, blockers);
}

export function currentRefundSandboxCanaryApprovalDecision():
RefundSandboxCanaryEvidenceReadinessDecision {
  const gates = REFUND_SANDBOX_CANARY_APPROVAL_GATES.map((id) => ({
    id, status: "BLOCKED" as const,
  }));
  return decision("UNDETERMINED", gates, REFUND_SANDBOX_CANARY_APPROVAL_GATES);
}

const GATE_CHECKS: Readonly<Record<RefundSandboxCanaryApprovalGate,
(evidence: ExactEvidence, now: number) => boolean>> = Object.freeze({
  RELEASE_IMMUTABILITY_VERIFIED: (e) => releaseReady(e),
  ISOLATED_GCP_ENVIRONMENT_VERIFIED: (e) => platformReady(e),
  CLOUD_RUN_JOB_CONFIGURATION_VERIFIED: (e) => jobReady(e),
  MANUAL_ONLY_NO_SCHEDULER_VERIFIED: (e) => manualOnlyReady(e),
  NO_EXECUTION_OVERRIDES_VERIFIED: (e) => noOverridesReady(e),
  IAM_SEPARATION_VERIFIED: (e) => iamReady(e),
  PINNED_SANDBOX_SECRET_VERIFIED: (e) => secretReady(e),
  ISOLATED_DATABASE_AND_TARGET_VERIFIED: (e) => databaseReady(e) && targetReady(e),
  CONCURRENT_ADMISSION_VERIFIED: (e) => admissionReady(e),
  SEQUENTIAL_DUPLICATE_SAFETY_VERIFIED: (e) => sequentialReady(e),
  OBSERVABILITY_VERIFIED: (e) => observabilityReady(e),
  ALERT_DELIVERY_VERIFIED: (e) => alertReady(e),
  STAFFED_WINDOW_VERIFIED: (e) => staffingReady(e),
  EMERGENCY_STOP_VERIFIED: (e) => emergencyReady(e),
  PROVIDER_FREE_PREFLIGHT_VERIFIED: (e) => preflightReady(e),
  DURABLE_SINGLE_USE_APPROVAL_CONSUMPTION_VERIFIED: (e) => consumptionReady(e),
  EXPLICIT_SINGLE_EXECUTION_APPROVAL_VERIFIED: (e, now) => approvalReady(e, now),
  POST_EXECUTION_CONTAINMENT_VERIFIED: (e) => containmentReady(e),
});

function releaseReady(e: ExactEvidence): boolean {
  const r = section(e, "release");
  return all([sha(r.gitCommitSha, 40), sha256(r.bindingDigest), sha256(r.canaryImageDigest),
    r.preflightImageDigest === r.canaryImageDigest, nonempty(r.artifactRepository),
    boundedIdentifier(r.canaryJobUid), boundedIdentifier(r.preflightJobUid),
    r.canaryJobUid !== r.preflightJobUid,
    positiveSafeInteger(r.canaryApprovedGeneration),
    r.canaryObservedGeneration === r.canaryApprovedGeneration,
    boundedFingerprint(r.canaryApprovedEtag),
    r.canaryObservedEtag === r.canaryApprovedEtag,
    positiveSafeInteger(r.preflightApprovedGeneration),
    r.preflightObservedGeneration === r.preflightApprovedGeneration,
    boundedFingerprint(r.preflightApprovedEtag),
    r.preflightObservedEtag === r.preflightApprovedEtag,
    sha256(r.canaryJobBindingDigest), sha256(r.preflightJobBindingDigest),
    r.canaryJobBindingDigest !== r.preflightJobBindingDigest,
    sha256(r.packageLockDigest), sha256(r.migrationDigest),
    sourceMatches(e, "SOURCE_BUILD_ATTESTATION", r.sourceBuildEvidenceRecordId,
      r.sourceBuildEvidenceDigest),
    sourceMatches(e, "ARTIFACT_REGISTRY_EVIDENCE", r.artifactEvidenceRecordId,
      r.artifactEvidenceDigest), releasePreflightIdentityMatches(e, r)]);
}

function releasePreflightIdentityMatches(e: ExactEvidence, r: Record<string, unknown>): boolean {
  const p = section(e, "preflight");
  const source = e.sources.get("PREFLIGHT_EXECUTION_EVIDENCE");
  return all([p.preflightJobUid === r.preflightJobUid,
    p.preflightApprovedGeneration === r.preflightApprovedGeneration,
    p.preflightObservedGeneration === r.preflightObservedGeneration,
    p.preflightApprovedEtag === r.preflightApprovedEtag,
    p.preflightObservedEtag === r.preflightObservedEtag,
    p.imageDigest === r.preflightImageDigest, p.migrationDigest === r.migrationDigest,
    p.preflightJobBindingDigest === r.preflightJobBindingDigest,
    source?.evidenceBindingDigest === r.preflightJobBindingDigest,
    source?.sourceRecordId === p.sourceRecordId, source?.sourceDigest === p.sourceDigest,
    source?.observedAtMs === p.completedAtMs]);
}

function platformReady(e: ExactEvidence): boolean {
  const p = section(e, "platform");
  return all([sha256(p.bindingDigest), nonempty(p.projectIdentity), p.region === "asia-northeast3",
    p.isolatedProject === true, p.artifactRegistry === true, p.cloudRunJobs === true,
    p.cloudSqlPostgres === true, p.secretManager === true, p.cloudLogging === true,
    p.cloudMonitoring === true, p.noProductionDevelopmentAcceptanceData === true,
    p.noCustomerPii === true]);
}

function jobReady(e: ExactEvidence): boolean {
  const j = section(e, "job");
  return all([sha256(j.bindingDigest),
    j.bindingDigest === section(e, "release").canaryJobBindingDigest,
    j.releaseBindingDigest === section(e, "release").bindingDigest,
    j.targetBindingDigest === section(e, "target").bindingDigest,
    j.taskCount === 1, j.parallelism === 1,
    j.maxRetries === 0, j.taskTimeoutSeconds === 150, j.internalBudgetSeconds === 120,
    j.containerCount === 1, j.imageDigestPinned === true, j.entrypointPinned === true,
    j.argumentsPinned === true, j.noShellInterpolation === true, j.liveUnreachable === true,
    sourceMatches(e, "CLOUD_RUN_JOB_EVIDENCE", j.evidenceRecordId, j.evidenceDigest)]);
}

function manualOnlyReady(e: ExactEvidence): boolean {
  const j = section(e, "job");
  const i = section(e, "iam");
  return all([j.triggerMode === "MANUAL_ONLY", j.schedulerTargetCount === 0,
    j.maxRetries === 0, i.schedulerIdentityExists === false]);
}

function noOverridesReady(e: ExactEvidence): boolean {
  const i = section(e, "iam");
  return all([i.executorHasRunWithOverrides === false, i.executorCanUpdateJob === false]);
}

function iamReady(e: ExactEvidence): boolean {
  const i = section(e, "iam");
  const principals = [i.deployPrincipalId, i.executePrincipalId, i.credentialOwnerPrincipalId,
    i.preflightRuntimePrincipalId, i.canaryRuntimePrincipalId];
  const common = all([i.operatingMode === e.operatingMode, principals.every(nonempty),
    new Set(principals).size === principals.length,
    i.separateAuthenticatedDeployAndExecutePrincipals === true,
    i.sharedLoginOrPrincipal === false, i.executorHasRunWithOverrides === false,
    i.executorCanUpdateJob === false, i.executorHasBroadCloudRunAuthority === false,
    i.executorCanReadSecrets === false,
    i.executorHasDirectDatabaseAccess === false, i.deployerCanExecute === false,
    i.executorCanDeploy === false, i.runtimeCanDeployOrModifyIam === false,
    i.defaultOrSharedRuntimeServiceAccount === false, i.serviceAccountKeyPresent === false,
    i.schedulerIdentityExists === false,
    sourceMatches(e, "IAM_POLICY_EVIDENCE", i.evidenceRecordId, i.evidenceDigest)]);
  return common && humanSeparationReady(i, e.operatingMode);
}

function humanSeparationReady(
  i: Record<string, unknown>, mode: RefundSandboxCanaryOperatingMode,
): boolean {
  if (!all([nonempty(i.deployHumanSubjectId), nonempty(i.executeHumanSubjectId),
    nonempty(i.credentialOwnerHumanSubjectId)])) return false;
  if (mode === "SINGLE_OPERATOR_EXCEPTION") {
    return i.deployHumanSubjectId === i.executeHumanSubjectId;
  }
  return all([i.deployHumanSubjectId !== i.executeHumanSubjectId,
    i.credentialOwnerHumanSubjectId !== i.deployHumanSubjectId,
    i.credentialOwnerHumanSubjectId !== i.executeHumanSubjectId]);
}

function operatorModeFromFinalGates(
  mode: RefundSandboxCanaryOperatingMode,
  gates: readonly RefundSandboxCanaryGateState[],
): RefundSandboxCanaryOperatingMode | "UNDETERMINED" {
  const ready = new Set(gates.filter((gate) => gate.status === "READY").map((gate) => gate.id));
  if (mode === "DISTINCT_HUMAN_OPERATORS") {
    return ready.has("IAM_SEPARATION_VERIFIED") ? mode : "UNDETERMINED";
  }
  return SINGLE_OPERATOR_REQUIRED_GATES.every((gate) => ready.has(gate))
    ? mode : "UNDETERMINED";
}

function secretReady(e: ExactEvidence): boolean {
  const s = section(e, "secret");
  return all([sha256(s.bindingDigest), s.provider === "TOSS", s.mode === "SANDBOX",
    nonempty(s.resourceIdentity), positiveSafeInteger(s.numericVersion),
    s.observedNumericVersion === s.numericVersion, s.usesLatest === false,
    s.sharedProviderSecret === false, s.sharedEnvironmentSecret === false,
    s.liveCredential === false, s.googleApplicationCredentialsPresent === false,
    s.runtimeAccessLimitedToExactSecrets === true,
    sourceMatches(e, "SECRET_VERSION_EVIDENCE", s.evidenceRecordId, s.evidenceDigest)]);
}

function databaseReady(e: ExactEvidence): boolean {
  const d = section(e, "database");
  return all([sha256(d.bindingDigest), d.environment === "P3E_SANDBOX",
    nonempty(d.databaseIdentity), d.region === "asia-northeast3",
    d.exactP3EEnvironmentIdentity === true, d.syntheticOnly === true,
    d.migrationDigest === section(e, "release").migrationDigest,
    nonempty(d.preflightRole), nonempty(d.canaryRole), d.preflightRole !== d.canaryRole,
    d.rolesDistinct === true, d.preflightReadOnly === true, d.canaryNotSuperuser === true,
    d.canaryDoesNotOwnDatabase === true, d.canaryCannotModifySchemaOrMigrations === true,
    sourceMatches(e, "CLOUD_SQL_EVIDENCE", d.evidenceRecordId, d.evidenceDigest)]);
}

function targetReady(e: ExactEvidence): boolean {
  const t = section(e, "target");
  return all([sha256(t.bindingDigest), t.targetCount === 1, nonempty(t.commandId),
    t.commandRefundAttemptId === t.refundAttemptId, nonempty(t.refundAttemptId),
    t.refundAttemptPaymentId === t.paymentId, nonempty(t.paymentId),
    t.providerOperationBindingId === t.commandProviderOperationBindingId,
    nonempty(t.providerOperationBindingId), t.provider === "TOSS", t.mode === "SANDBOX",
    positiveSafeInteger(t.commandAmountMinor), t.commandAmountMinor === t.refundAmountMinor,
    upperCurrency(t.paymentCurrency), t.paymentCurrency === t.refundCurrency,
    t.syntheticOnly === true, t.customerPiiPresent === false,
    t.initialCommandState === "READY", t.initialRefundAttemptState === "PROCESSING",
    t.selectorMode === "EXACT_COMMAND_ONLY", nonempty(t.providerSandboxEvidenceRecordId),
    t.providerOperationLimit === 1, t.broadSelectorFallback === false]);
}

function admissionReady(e: ExactEvidence): boolean {
  const a = section(e, "admission");
  const invocationCount = a.concurrentTestInvocationCount;
  const winnerCount = a.concurrentWinnerCount;
  const loserCount = a.concurrentLoserCount;
  return all([a.mechanism === "POSTGRES_NONBLOCKING_ADVISORY_LOCK",
    a.implementationStatus === "IMPLEMENTED_AND_INDEPENDENTLY_TESTED", nonempty(a.lockAuthorityId),
    nonempty(a.lockKeyDerivationVersion), a.dedicatedConnection === true,
    a.heldForFullProviderCapableExecution === true, a.acquisitionBeforeSecretRead === true,
    a.acquisitionBeforeAdapterConstruction === true, a.acquisitionBeforeProviderLookup === true,
    a.acquisitionBeforeProviderCancellation === true, a.losingResult === "OVERLAP_SKIPPED",
    a.losingSecretReadCount === 0, a.losingProviderRequestCount === 0,
    a.losingFinancialMutationCount === 0, safeIntegerAtLeast(invocationCount, 2),
    winnerCount === 1, safeIntegerAtLeast(loserCount, 1),
    admissionCountsReconcile(invocationCount, winnerCount, loserCount), bindingsMatch(e, a),
    sourceMatches(e, "ADMISSION_TEST_EVIDENCE", a.evidenceRecordId, a.evidenceDigest)]);
}

function sequentialReady(e: ExactEvidence): boolean {
  const s = section(e, "sequentialSafety");
  return all([s.commandId === section(e, "target").commandId,
    s.initialCommandState === "READY", s.leaseGenerationFencing === true,
    s.leaseTokenFencing === true, s.dispatchOrdinalUniqueness === true,
    s.commandDispatchCas === true, s.contactMarkerBeforeProviderCancellation === true,
    s.immutableProviderOperationBinding === true, s.idempotencyEvidenceBinding === true,
    s.recoveryStateClassification === true, s.unknownOutcomeMapsToPossibleContact === true,
    s.blindRetryProhibited === true, s.firstExecutionBlocksSecondProviderAction === true,
    s.secondInvocationProviderOperationCount === 0,
    safeIntegerAtLeast(s.sequentialTestInvocationCount, 2), bindingsMatch(e, s),
    sourceMatches(e, "DUPLICATE_SAFETY_TEST_EVIDENCE", s.evidenceRecordId,
      s.evidenceDigest)]);
}

function observabilityReady(e: ExactEvidence): boolean {
  const o = section(e, "observability");
  return all([o.executionLogs === true, o.retentionConfigured === true,
    o.monitoringIncidentPolicy === true, o.boundedFailureAlerts === true,
    o.taskTimeoutAlert === true, o.missingFinalResultAlert === true,
    o.possibleContactAlert === true, o.manualReviewAlert === true,
    o.overlapSkippedNotification === true, o.credentialConfigurationAlert === true,
    o.sensitiveLabelsExcluded === true]);
}

function alertReady(e: ExactEvidence): boolean {
  const o = section(e, "observability");
  return all([safeIntegerAtLeast(o.notificationChannels, 2), o.emailChannelTested === true,
    o.secondaryChannelTested === true,
    sourceMatches(e, "ALERT_DELIVERY_EVIDENCE", o.evidenceRecordId, o.evidenceDigest)]);
}

function staffingReady(e: ExactEvidence): boolean {
  const s = section(e, "staffing");
  return all([s.ownersAssigned === true, s.ownersReachable === true,
    s.unattendedExecutionForbidden === true, s.preflightWindowMinutes === 30,
    s.continuousObservation === true, s.postExecutionWindowMinutes === 60,
    s.noSecondCanaryDuringWindow === true,
    s.noConcurrentRefundMaintenanceOrMigration === true,
    s.noCredentialRotationDuringWindow === true, s.criticalAcknowledgementMinutes === 5,
    s.investigationStartMinutes === 10, s.possibleContactPlanMinutes === 30,
    sourceMatches(e, "STAFFED_WINDOW_APPROVAL", s.evidenceRecordId, s.evidenceDigest)]);
}

function emergencyReady(e: ExactEvidence): boolean {
  const x = section(e, "emergencyStop");
  return all([x.canCancelExecution === true, x.canRemoveInvocationAuthority === true,
    x.canRemoveSecretAccessAfterStop === true, x.preservesLogsAndDatabaseEvidence === true,
    x.providerFreeObservationsAvailable === true, x.possibleContactClassification === true,
    x.providerRevocationNotInferred === true,
    sourceMatches(e, "EMERGENCY_STOP_EVIDENCE", x.evidenceRecordId, x.evidenceDigest)]);
}

function preflightReady(e: ExactEvidence): boolean {
  const p = section(e, "preflight");
  const r = section(e, "release");
  const source = e.sources.get("PREFLIGHT_EXECUTION_EVIDENCE");
  return all([p.completed === true, p.noTossSecretBinding === true,
    p.dedicatedRuntimeIdentity === true, p.readOnlyDatabaseRole === true,
    p.providerAdapterUnreachable === true, p.providerNetworkUnreachable === true,
    p.noFinancialMutation === true, p.checksComplete === true,
    p.preflightJobUid === r.preflightJobUid,
    p.preflightApprovedGeneration === r.preflightApprovedGeneration,
    p.preflightObservedGeneration === r.preflightObservedGeneration,
    p.preflightApprovedGeneration === p.preflightObservedGeneration,
    p.preflightApprovedEtag === r.preflightApprovedEtag,
    p.preflightObservedEtag === r.preflightObservedEtag,
    p.preflightApprovedEtag === p.preflightObservedEtag,
    p.imageDigest === r.preflightImageDigest, p.imageDigest === r.canaryImageDigest,
    p.migrationDigest === r.migrationDigest, nonnegativeSafeInteger(p.completedAtMs),
    p.evidenceRecordId === p.sourceRecordId, p.evidenceDigest === p.sourceDigest,
    p.releaseBindingDigest === r.bindingDigest,
    p.canaryJobBindingDigest === r.canaryJobBindingDigest,
    p.preflightJobBindingDigest === r.preflightJobBindingDigest,
    sourceMatches(e, "PREFLIGHT_EXECUTION_EVIDENCE", p.sourceRecordId, p.sourceDigest),
    source?.evidenceBindingDigest === r.preflightJobBindingDigest,
    source?.observedAtMs === p.completedAtMs]);
}

function consumptionReady(e: ExactEvidence): boolean {
  const c = section(e, "consumption");
  const a = section(e, "approval");
  const source = e.sources.get("SINGLE_USE_CONSUMPTION_EVIDENCE");
  return all([c.mechanism === "POSTGRES_ATOMIC_APPROVAL_CONSUMPTION",
    c.implementationStatus === "IMPLEMENTED_AND_INDEPENDENTLY_TESTED",
    c.independentTestStatus === "INDEPENDENT_TEST_PASSED",
    nonempty(c.durableStoreAuthority), c.approvalId === a.approvalId,
    consumptionBindingsMatch(e, c), c.consumeBeforeProviderCapableExecution === true,
    c.consumeBeforeSecretRead === true, c.atomicCompareAndSet === true,
    c.unconsumedToConsumedOnly === true, c.secondConsumptionRejected === true,
    c.consumptionPersistsOnSuccess === true, c.consumptionPersistsOnFailure === true,
    c.consumptionPersistsOnCancellation === true, c.consumptionPersistsOnTimeout === true,
    c.consumptionPersistsOnAmbiguousOutcome === true, c.executionLimit === 1,
    nonempty(c.implementationTestProvenance),
    sourceMatches(e, "SINGLE_USE_CONSUMPTION_EVIDENCE", c.evidenceRecordId,
      c.evidenceDigest), source?.evidenceBindingDigest === c.evidenceDigest]);
}

function approvalReady(e: ExactEvidence, now: number): boolean {
  const a = section(e, "approval");
  if (!approvalTimeReady(a, now)) return false;
  const i = section(e, "iam");
  const p = section(e, "preflight");
  const source = e.sources.get("EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE");
  const preflightSource = e.sources.get("PREFLIGHT_EXECUTION_EVIDENCE");
  const common = all([nonempty(a.approvalId), a.approvalMode === e.operatingMode,
    nonempty(a.approvingHumanSubjectId), nonempty(a.authenticatedPrincipalId),
    a.postPreflightDeliberateApproval === true,
    a.approvalEvidenceRecordId === a.approvalSourceRecordId,
    a.approvalEvidenceDigest === a.approvalSourceDigest,
    a.preflightEvidenceRecordId === p.evidenceRecordId,
    a.preflightEvidenceDigest === p.evidenceDigest,
    a.preflightCompletedAtMs === p.completedAtMs,
    strictlyAfter(a.approvedAtMs, a.preflightCompletedAtMs),
    timestampAtOrAfter(preflightSource?.observedAtMs, a.preflightCompletedAtMs),
    a.releaseBindingDigest === section(e, "release").bindingDigest,
    a.canaryJobBindingDigest === section(e, "release").canaryJobBindingDigest,
    a.preflightJobBindingDigest === section(e, "release").preflightJobBindingDigest,
    a.imageBindingDigest === section(e, "release").canaryImageDigest,
    a.secretGenerationBindingDigest === section(e, "secret").bindingDigest,
    a.targetBindingDigest === section(e, "target").bindingDigest,
    a.intendedExecutionLimit === 1,
    sourceMatches(e, "EXPLICIT_SINGLE_EXECUTION_APPROVAL_EVIDENCE",
      a.approvalSourceRecordId, a.approvalSourceDigest),
    source?.evidenceBindingDigest === a.approvalEvidenceDigest,
    timestampAtOrAfter(source?.observedAtMs, a.approvedAtMs)]);
  return common && operatorApprovalReady(a, i, e.operatingMode);
}

function operatorApprovalReady(
  a: Record<string, unknown>, i: Record<string, unknown>, mode: RefundSandboxCanaryOperatingMode,
): boolean {
  if (a.approvingHumanSubjectId !== i.executeHumanSubjectId
    || a.authenticatedPrincipalId !== i.executePrincipalId) return false;
  return mode === "DISTINCT_HUMAN_OPERATORS" || nonempty(a.riskAcceptanceReference);
}

function approvalTimeReady(a: Record<string, unknown>, now: number): boolean {
  if (!nonnegativeSafeInteger(a.approvedAtMs) || !nonnegativeSafeInteger(a.expiresAtMs)) {
    return false;
  }
  const lifetime = a.expiresAtMs - a.approvedAtMs;
  return all([a.approvedAtMs <= now, a.expiresAtMs > now, a.expiresAtMs > a.approvedAtMs,
    lifetime > 0, Number.isSafeInteger(lifetime), lifetime <= MAX_APPROVAL_LIFETIME_MS]);
}

function containmentReady(e: ExactEvidence): boolean {
  const c = section(e, "containment");
  return all([c.approvalId === section(e, "approval").approvalId,
    c.targetBindingDigest === section(e, "target").bindingDigest,
    c.automaticSecondExecutionForbidden === true,
    c.invocationAuthorityRemovedAfterExecution === true, c.schedulerRemainsAbsent === true,
    c.jobConfigurationRetainedForAudit === true, c.executionIdentityRecorded === true,
    c.releaseIdentityRecorded === true, c.secretAccessRemovedAfterSafeStop === true,
    c.evidenceRetained === true, c.manualAndReconciliationSnapshotCaptured === true,
    c.possibleContactBlocksNextCanary === true, c.blindRetryForbidden === true,
    c.noSecondExecutionBeforeReconciliation === true,
    sourceMatches(e, "CONTAINMENT_PLAN_EVIDENCE", c.evidenceRecordId, c.evidenceDigest)]);
}

function provenanceInternallyConsistent(e: ExactEvidence): boolean {
  const p = e.provenance;
  if (p.subjectBindingDigest !== section(e, "release").bindingDigest) return false;
  for (const source of e.sources.values()) {
    if (source.subjectDigest !== p.subjectBindingDigest) return false;
  }
  return true;
}

function admissionCountsReconcile(
  invocationCount: unknown, winnerCount: unknown, loserCount: unknown,
): boolean {
  return nonnegativeSafeInteger(invocationCount) && nonnegativeSafeInteger(winnerCount)
    && nonnegativeSafeInteger(loserCount) && loserCount === invocationCount - winnerCount;
}

function bindingsMatch(e: ExactEvidence, value: Record<string, unknown>): boolean {
  return all([value.releaseBindingDigest === section(e, "release").bindingDigest,
    value.jobBindingDigest === section(e, "job").bindingDigest,
    value.targetBindingDigest === section(e, "target").bindingDigest]);
}

function consumptionBindingsMatch(e: ExactEvidence, c: Record<string, unknown>): boolean {
  const release = section(e, "release");
  return all([c.releaseBindingDigest === release.bindingDigest,
    c.canaryJobBindingDigest === release.canaryJobBindingDigest,
    c.preflightJobBindingDigest === release.preflightJobBindingDigest,
    c.targetBindingDigest === section(e, "target").bindingDigest,
    c.imageBindingDigest === release.canaryImageDigest,
    c.secretGenerationBindingDigest === section(e, "secret").bindingDigest]);
}

function sourceMatches(
  e: ExactEvidence, kind: RefundSandboxCanarySourceKind, id: unknown, digest: unknown,
): boolean {
  const source = e.sources.get(kind);
  return source !== undefined && source.sourceRecordId === id && source.sourceDigest === digest;
}

function safelyParseEvidence(value: unknown): ExactEvidence | null {
  try {
    return parseEvidence(value);
  } catch {
    return null;
  }
}

function parseEvidence(value: unknown): ExactEvidence | null {
  const outer = exactRecord(value, OUTER_KEYS);
  if (!outer || outer.formatVersion !== REFUND_SANDBOX_CANARY_APPROVAL_FORMAT) return null;
  const operatingMode = parseMode(outer.operatingMode);
  const provenance = exactRecord(outer.provenance, PROVENANCE_KEYS);
  if (!operatingMode || !provenance || !provenanceShapeReady(provenance)) return null;
  const sources = parseSources(provenance.sourceRecords);
  const sections = parseSections(outer);
  return sources && sections ? { operatingMode, provenance, sources, sections } : null;
}

function provenanceShapeReady(p: Record<string, unknown>): boolean {
  return all([p.evidenceFormatVersion === REFUND_SANDBOX_CANARY_EVIDENCE_FORMAT,
    p.producerKind === "EXTERNAL_EVIDENCE_PRODUCER", nonempty(p.producerVersion),
    nonempty(p.bundleId), sha256(p.bundleDigest), nonnegativeSafeInteger(p.issuedAtMs),
    sha256(p.subjectBindingDigest),
    p.provenanceVerificationExpectation === "TRUSTED_ISSUER_MUST_REVERIFY"]);
}

function parseSources(value: unknown): ReadonlyMap<
RefundSandboxCanarySourceKind, Record<string, unknown>
> | null {
  const values = exactArray(value);
  if (!values || values.length !== REFUND_SANDBOX_CANARY_SOURCE_KINDS.length) return null;
  const sources = new Map<RefundSandboxCanarySourceKind, Record<string, unknown>>();
  const ids = new Set<string>();
  for (const [index, valueEntry] of values.entries()) {
    const parsed = parseSource(valueEntry, REFUND_SANDBOX_CANARY_SOURCE_KINDS[index]);
    if (!parsed || sources.has(parsed.kind) || ids.has(parsed.id)) return null;
    sources.set(parsed.kind, parsed.source);
    ids.add(parsed.id);
  }
  return sources;
}

function parseSource(
  value: unknown,
  expectedKind: RefundSandboxCanarySourceKind,
): Readonly<{
  kind: RefundSandboxCanarySourceKind;
  id: string;
  source: Record<string, unknown>;
}> | null {
  const source = exactRecord(value, SOURCE_KEYS);
  if (!source || !sourceShapeReady(source)) return null;
  const kind = parseSourceKind(source.sourceKind);
  if (!kind || kind !== expectedKind || !nonempty(source.sourceRecordId)) return null;
  return { kind, id: source.sourceRecordId, source };
}

function sourceShapeReady(source: Record<string, unknown>): boolean {
  return all([nonempty(source.sourceRecordId), sha256(source.sourceDigest),
    nonnegativeSafeInteger(source.observedAtMs), sha256(source.subjectDigest),
    sha256(source.evidenceBindingDigest), nonempty(source.producerReference)]);
}

function parseSections(outer: Record<string, unknown>): ReadonlyMap<
SectionName, Record<string, unknown>
> | null {
  const result = new Map<SectionName, Record<string, unknown>>();
  for (const [name, keys] of SECTION_KEYS) {
    const value = exactRecord(outer[name], keys);
    if (!value) return null;
    result.set(name, value);
  }
  return result;
}

function section(e: ExactEvidence, name: SectionName): Record<string, unknown> {
  return e.sections.get(name) ?? Object.freeze({});
}

function decision(
  mode: RefundSandboxCanaryOperatingMode | "UNDETERMINED",
  gates: readonly Readonly<{ id: RefundSandboxCanaryApprovalGate; status: "READY" | "BLOCKED" }>[],
  blockers: readonly RefundSandboxCanaryApprovalGate[],
): RefundSandboxCanaryEvidenceReadinessDecision {
  return Object.freeze({
    formatVersion: REFUND_SANDBOX_CANARY_APPROVAL_FORMAT,
    code: blockers.length === 0 ? "SANDBOX_CANARY_EVIDENCE_READY_FOR_TRUSTED_ISSUER"
      : "SANDBOX_CANARY_APPROVAL_BLOCKED",
    executionAuthorization: "NOT_ISSUED",
    provenanceTrust: "NOT_VERIFIED_BY_PURE_EVALUATOR",
    scheduledOperation: "BLOCKED", liveOperation: "BLOCKED", intendedExecutionLimit: 1,
    triggerMode: "MANUAL_ONLY",
    operatorSeparation: mode === "DISTINCT_HUMAN_OPERATORS" ? "VERIFIED_DISTINCT_HUMANS"
      : mode === "SINGLE_OPERATOR_EXCEPTION" ? "ABSENT_SINGLE_OPERATOR_EXCEPTION"
        : "UNDETERMINED",
    gates: Object.freeze(gates.map((gate) => Object.freeze({ ...gate }))),
    blockers: Object.freeze([...blockers]),
  });
}

function invalidDecision(): RefundSandboxCanaryEvidenceReadinessDecision {
  const invalidBlocker = "APPROVAL_EVIDENCE_INVALID" as const;
  return Object.freeze({
    formatVersion: REFUND_SANDBOX_CANARY_APPROVAL_FORMAT,
    code: "SANDBOX_CANARY_APPROVAL_BLOCKED",
    executionAuthorization: "NOT_ISSUED",
    provenanceTrust: "NOT_VERIFIED_BY_PURE_EVALUATOR",
    scheduledOperation: "BLOCKED", liveOperation: "BLOCKED", intendedExecutionLimit: 1,
    triggerMode: "MANUAL_ONLY", operatorSeparation: "UNDETERMINED",
    gates: Object.freeze([]), blockers: Object.freeze([invalidBlocker]),
  });
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  try {
    if (!plainRecord(value)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (!all([ownKeys.every((key) => typeof key === "string"), ownKeys.length === keys.length,
      keys.every((key) => ownKeys.includes(key))])) return null;
    const entries: Array<readonly [string, unknown]> = [];
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!dataDescriptor(descriptor, true)) return null;
      entries.push([key, descriptorValue(descriptor)]);
    }
    return Object.fromEntries(entries);
  } catch {
    return null;
  }
}

function exactArray(value: unknown): unknown[] | null {
  try {
    if (!exactArrayContainer(value)) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = dataDescriptor(lengthDescriptor, false)
      ? descriptorValue(lengthDescriptor) : null;
    if (!nonnegativeSafeInteger(length)) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expected = [...Array.from({ length }, (_unused, index) => String(index)), "length"];
    if (!all([keys.every((key) => typeof key === "string"), keys.length === expected.length,
      expected.every((key) => keys.includes(key))])) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!dataDescriptor(descriptor, true)) return null;
      result.push(descriptorValue(descriptor));
    }
    return result;
  } catch {
    return null;
  }
}

function exactArrayContainer(value: unknown): value is unknown[] {
  try {
    return !nodeTypes.isProxy(value) && Array.isArray(value)
      && Reflect.getPrototypeOf(value) === Array.prototype;
  } catch {
    return false;
  }
}

function plainRecord(value: unknown): value is object {
  if (value === null || typeof value !== "object") return false;
  try {
    return !nodeTypes.isProxy(value) && !Array.isArray(value)
      && Reflect.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function dataDescriptor(
  value: PropertyDescriptor | undefined, enumerable: boolean,
): value is PropertyDescriptor & Readonly<{ value: unknown }> {
  return value !== undefined && value.enumerable === enumerable
    && Object.prototype.hasOwnProperty.call(value, "value");
}

function descriptorValue(value: { readonly value?: unknown }): unknown { return value.value; }

function parseMode(value: unknown): RefundSandboxCanaryOperatingMode | null {
  return value === "DISTINCT_HUMAN_OPERATORS" || value === "SINGLE_OPERATOR_EXCEPTION"
    ? value : null;
}

function parseSourceKind(value: unknown): RefundSandboxCanarySourceKind | null {
  if (typeof value !== "string") return null;
  for (const kind of REFUND_SANDBOX_CANARY_SOURCE_KINDS) if (kind === value) return kind;
  return null;
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value
    && Array.from(value).length <= 512;
}
function sha(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/u.test(value);
}
function sha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}
function upperCurrency(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{3}$/u.test(value);
}
function boundedIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,127}$/u.test(value);
}
function boundedFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:=+/-]{0,255}$/u.test(value);
}
function nonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function positiveSafeInteger(value: unknown): value is number {
  return nonnegativeSafeInteger(value) && value > 0;
}
function safeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return nonnegativeSafeInteger(value) && value >= minimum;
}
function strictlyAfter(later: unknown, earlier: unknown): boolean {
  return nonnegativeSafeInteger(later) && nonnegativeSafeInteger(earlier) && later > earlier;
}
function timestampAtOrAfter(later: unknown, earlier: unknown): boolean {
  return nonnegativeSafeInteger(later) && nonnegativeSafeInteger(earlier) && later >= earlier;
}
function all(values: readonly boolean[]): boolean { return values.every(Boolean); }
