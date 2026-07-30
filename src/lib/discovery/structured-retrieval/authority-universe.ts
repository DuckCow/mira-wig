import type { DiscoveryContext } from "../types";
import type {
  Stage0AllowedCanonicalPair,
  Stage0ContextBinding,
  Stage0Validation,
} from "./types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "./versions";

function isNonblankRuntimeString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.trim() === value
  );
}

function contextBinding(context: DiscoveryContext): Stage0ContextBinding {
  const queryLanguage =
    context.queryLanguage.mode === "AUTO"
      ? { mode: "AUTO" as const }
      : {
          mode: "DECLARED" as const,
          languageTag: context.queryLanguage.languageTag.value,
        };
  return {
    marketCode: context.marketCode,
    locale: context.locale.value,
    queryLanguage,
    audienceNamespace: context.audienceNamespace.value,
  };
}

function isRuntimeObject(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function contextBindingIsValid(
  binding: unknown,
): binding is Stage0ContextBinding {
  if (!isRuntimeObject(binding)) {
    return false;
  }
  const queryLanguage = binding.queryLanguage;
  if (!isRuntimeObject(queryLanguage)) {
    return false;
  }
  if (
    !isNonblankRuntimeString(binding.marketCode) ||
    !isNonblankRuntimeString(binding.locale) ||
    !isNonblankRuntimeString(binding.audienceNamespace)
  ) {
    return false;
  }

  return (
    queryLanguage.mode === "AUTO" ||
    (queryLanguage.mode === "DECLARED" &&
      isNonblankRuntimeString(queryLanguage.languageTag))
  );
}

function sameContext(
  left: Stage0ContextBinding,
  right: Stage0ContextBinding,
): boolean {
  if (
    left.marketCode !== right.marketCode ||
    left.locale !== right.locale ||
    left.audienceNamespace !== right.audienceNamespace ||
    left.queryLanguage.mode !== right.queryLanguage.mode
  ) {
    return false;
  }

  return (
    left.queryLanguage.mode === "AUTO" ||
    (right.queryLanguage.mode === "DECLARED" &&
      left.queryLanguage.languageTag === right.queryLanguage.languageTag)
  );
}

function pairIsValid(
  pair: unknown,
): pair is Stage0AllowedCanonicalPair {
  return (
    isRuntimeObject(pair) &&
    isNonblankRuntimeString(pair.variantId) &&
    isNonblankRuntimeString(pair.canonicalStyleId)
  );
}

function isRuntimeArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function canonicalPairOrder(
  left: Stage0AllowedCanonicalPair,
  right: Stage0AllowedCanonicalPair,
): number {
  const variantOrder = left.variantId.localeCompare(right.variantId);
  return variantOrder !== 0
    ? variantOrder
    : left.canonicalStyleId.localeCompare(right.canonicalStyleId);
}

function copyContext(binding: Stage0ContextBinding): Stage0ContextBinding {
  return {
    marketCode: binding.marketCode,
    locale: binding.locale,
    queryLanguage:
      binding.queryLanguage.mode === "AUTO"
        ? { mode: "AUTO" }
        : {
            mode: "DECLARED",
            languageTag: binding.queryLanguage.languageTag,
          },
    audienceNamespace: binding.audienceNamespace,
  };
}

interface Stage0MembershipAnalysis {
  readonly duplicatePair: boolean;
  readonly conflictingParent: boolean;
}

function analyzeStage0Membership(
  pairs: readonly Stage0AllowedCanonicalPair[],
): Stage0MembershipAnalysis {
  const parentSets = new Map<string, Set<string>>();
  const pairKeys = new Set<string>();
  let duplicatePair = false;
  for (const pair of pairs) {
    const pairKey = JSON.stringify([
      pair.variantId,
      pair.canonicalStyleId,
    ]);
    if (pairKeys.has(pairKey)) {
      duplicatePair = true;
    }
    pairKeys.add(pairKey);

    const parents = parentSets.get(pair.variantId) ?? new Set<string>();
    parents.add(pair.canonicalStyleId);
    parentSets.set(pair.variantId, parents);
  }
  return {
    duplicatePair,
    conflictingParent: [...parentSets.values()].some(
      (parents) => parents.size > 1,
    ),
  };
}

function membershipRejection(
  pairs: readonly Stage0AllowedCanonicalPair[],
): Stage0Validation | null {
  const analysis = analyzeStage0Membership(pairs);
  if (analysis.conflictingParent) {
    return {
      status: "STAGE0_REJECTED",
      reason: "CONFLICTING_STAGE0_STYLE_PARENT",
    };
  }
  return analysis.duplicatePair
    ? {
        status: "STAGE0_REJECTED",
        reason: "DUPLICATE_STAGE0_MEMBERSHIP",
      }
    : null;
}

interface RuntimeStage0ProofContainer {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly stage0ScopeVersion: string;
  readonly fixtureSnapshotVersion: string;
  readonly context: Stage0ContextBinding;
  readonly allowedCanonicalPairs: readonly unknown[];
}

function proofContainerIsValid(
  proof: unknown,
): proof is RuntimeStage0ProofContainer {
  return (
    isRuntimeObject(proof) &&
    proof.fixtureOnly === true &&
    proof.synthetic === true &&
    proof.stage0ScopeVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.stage0Scope &&
    proof.fixtureSnapshotVersion ===
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot &&
    contextBindingIsValid(proof.context) &&
    isRuntimeArray(proof.allowedCanonicalPairs)
  );
}

export function validateStage0AuthorityUniverse(
  proof: unknown,
  callerContext: DiscoveryContext,
): Stage0Validation {
  if (!proofContainerIsValid(proof)) {
    return {
      status: "STAGE0_REJECTED",
      reason: "STAGE0_PROVENANCE_INVALID",
    };
  }

  const validPairs = proof.allowedCanonicalPairs.filter(pairIsValid);
  if (validPairs.length !== proof.allowedCanonicalPairs.length) {
    return {
      status: "STAGE0_REJECTED",
      reason: "STAGE0_MEMBERSHIP_INVALID",
    };
  }
  const expectedContext = contextBinding(callerContext);
  if (!sameContext(proof.context, expectedContext)) {
    return {
      status: "STAGE0_REJECTED",
      reason: "STAGE0_CONTEXT_MISMATCH",
    };
  }
  const rejectedMembership = membershipRejection(validPairs);
  if (rejectedMembership !== null) {
    return rejectedMembership;
  }

  const allowedCanonicalPairs = [...validPairs]
    .sort(canonicalPairOrder)
    .map((pair) => ({
      variantId: pair.variantId,
      canonicalStyleId: pair.canonicalStyleId,
    }));
  const context = copyContext(proof.context);
  return {
    status: "VALIDATED",
    stage0ScopeVersion: proof.stage0ScopeVersion,
    fixtureSnapshotVersion: proof.fixtureSnapshotVersion,
    context,
    allowedCanonicalPairs,
    accountabilityKey: JSON.stringify([
      proof.stage0ScopeVersion,
      proof.fixtureSnapshotVersion,
      context,
      allowedCanonicalPairs,
    ]),
  };
}
