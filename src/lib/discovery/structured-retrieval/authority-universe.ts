import type { DiscoveryContext } from "../types";
import type {
  Stage0AllowedCanonicalPair,
  Stage0AuthorityUniverseFixture,
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

function contextBindingIsValid(binding: Stage0ContextBinding): boolean {
  if (
    !isNonblankRuntimeString(binding.marketCode) ||
    !isNonblankRuntimeString(binding.locale) ||
    !isNonblankRuntimeString(binding.audienceNamespace)
  ) {
    return false;
  }

  return (
    binding.queryLanguage.mode === "AUTO" ||
    (binding.queryLanguage.mode === "DECLARED" &&
      isNonblankRuntimeString(binding.queryLanguage.languageTag))
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

function pairIsValid(pair: Stage0AllowedCanonicalPair): boolean {
  return (
    isNonblankRuntimeString(pair.variantId) &&
    isNonblankRuntimeString(pair.canonicalStyleId)
  );
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
  if (!pairs.every(pairIsValid)) {
    return {
      status: "STAGE0_REJECTED",
      reason: "STAGE0_MEMBERSHIP_INVALID",
    };
  }

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

export function validateStage0AuthorityUniverse(
  proof: Stage0AuthorityUniverseFixture,
  callerContext: DiscoveryContext,
): Stage0Validation {
  if (
    proof.fixtureOnly !== true ||
    proof.synthetic !== true ||
    proof.stage0ScopeVersion !==
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.stage0Scope ||
    proof.fixtureSnapshotVersion !==
      D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS.fixtureSnapshot ||
    !contextBindingIsValid(proof.context)
  ) {
    return {
      status: "STAGE0_REJECTED",
      reason: "STAGE0_PROVENANCE_INVALID",
    };
  }

  const expectedContext = contextBinding(callerContext);
  if (!sameContext(proof.context, expectedContext)) {
    return {
      status: "STAGE0_REJECTED",
      reason: "STAGE0_CONTEXT_MISMATCH",
    };
  }
  const rejectedMembership = membershipRejection(
    proof.allowedCanonicalPairs,
  );
  if (rejectedMembership !== null) {
    return rejectedMembership;
  }

  const allowedCanonicalPairs = [...proof.allowedCanonicalPairs]
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
