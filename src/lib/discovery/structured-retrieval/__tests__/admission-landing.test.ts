import { describe, expect, it } from "vitest";

import type { ConstraintDecision } from "../../types";
import { DISCOVERY_COMPONENT_VERSIONS } from "../../versions";
import { validateStage0AuthorityUniverse } from "../authority-universe";
import { admitStructuredCandidate } from "../candidate-admission";
import { evaluateStructuredCandidateEvidence } from "../evidence-evaluation";
import { enumerateStructuredCandidateFixtures } from "../fixture-candidate-source";
import { verifyStructuredLanding } from "../landing";
import { buildStructuredRequestPlan } from "../request-plan";
import { runStructuredCategoricalFixtureSlice } from "../structured-slice";
import type {
  AdmitStructuredCandidateInput,
  StructuredAdmissionResult,
  StructuredCandidateFixture,
  StructuredCandidateSourceAttribution,
  StructuredEligibilitySummaryFixture,
  StructuredLandingIntent,
  StructuredProductEvidenceFixture,
} from "../types";
import { D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS } from "../versions";
import {
  candidateFixture,
  candidateSnapshot,
  categoricalPolicy,
  evidenceFixture,
  eligibilitySummary,
  governedConstraint,
  parserResult,
  stage0Proof,
  STYLE_A,
  structuredInput,
  TEXTURE_ATTRIBUTE_ID,
  VARIANT_B,
} from "./fixtures";

function runOne(
  candidate: StructuredCandidateFixture,
  evidenceFixtures: readonly StructuredProductEvidenceFixture[],
  eligibilitySummaries: readonly StructuredEligibilitySummaryFixture[],
) {
  const constraint = governedConstraint();
  return runStructuredCategoricalFixtureSlice(
    structuredInput({
      parserResult: parserResult([constraint]),
      policies: [categoricalPolicy(constraint)],
      stage0Proof: stage0Proof([
        {
          variantId: candidate.variantId,
          canonicalStyleId: candidate.canonicalStyleId,
        },
      ]),
      candidateSnapshot: candidateSnapshot([candidate]),
      evidenceFixtures,
      eligibilitySummaries,
    }),
  );
}

function rejectionReason(
  result: ReturnType<typeof runStructuredCategoricalFixtureSlice>,
): string | null {
  if (
    result.status !== "COMPLETED" ||
    result.admissionRejections.length !== 1
  ) {
    return null;
  }
  return result.admissionRejections[0]?.reason ?? null;
}

function directAdmissionInput(
  constraint = governedConstraint(),
): AdmitStructuredCandidateInput {
  const policy = categoricalPolicy(constraint);
  const context = structuredInput().context;
  const candidate = candidateFixture();
  const requestPlan = buildStructuredRequestPlan(
    parserResult([constraint]),
    context,
    [policy],
  );
  if (requestPlan.status !== "APPLICABLE") {
    throw new TypeError("Synthetic request plan must apply");
  }
  const stage0 = validateStage0AuthorityUniverse(
    stage0Proof(),
    context,
  );
  if (stage0.status !== "VALIDATED") {
    throw new TypeError("Synthetic Stage-0 proof must validate");
  }
  const enumeration = enumerateStructuredCandidateFixtures(
    candidateSnapshot([candidate]),
    stage0,
  );
  if (enumeration.status !== "SCOPED_CANDIDATES") {
    throw new TypeError("Synthetic candidate must enumerate");
  }
  const evidenceEvaluation = evaluateStructuredCandidateEvidence(
    requestPlan,
    context,
    candidate,
    [evidenceFixture(candidate, constraint)],
  );
  if (evidenceEvaluation.status !== "EVALUATED") {
    throw new TypeError("Synthetic evidence must evaluate");
  }

  return {
    requestPlan,
    context,
    stage0Proof: stage0,
    candidate,
    candidateSourceAttribution: enumeration.attribution,
    evidenceEvaluation,
    eligibilitySummaries: [eligibilitySummary(candidate)],
    d5Versions: {
      normalizer: DISCOVERY_COMPONENT_VERSIONS.normalizer,
      parser: DISCOVERY_COMPONENT_VERSIONS.parser,
      constraintRules: DISCOVERY_COMPONENT_VERSIONS.constraintRules,
      lexicon: "fixture:d6-b1-lexicon/v0.1-provisional",
      ontology: "fixture:d6-b1-ontology/v0.1-provisional",
    },
    d6Versions: {
      ...D6_B1_STRUCTURED_RETRIEVAL_COMPONENT_VERSIONS,
    },
  };
}

function directRejectionReason(
  result: StructuredAdmissionResult,
): string | null {
  return result.status === "ADMISSION_REJECTED"
    ? result.reason
    : null;
}

function sourceAttributionWith(
  baseline: StructuredCandidateSourceAttribution,
  overrides: Partial<StructuredCandidateSourceAttribution>,
  accountabilityKey?: string,
): StructuredCandidateSourceAttribution {
  const fixtureSnapshotVersion =
    overrides.fixtureSnapshotVersion ??
    baseline.fixtureSnapshotVersion;
  const candidateSourceVersion =
    overrides.candidateSourceVersion ??
    baseline.candidateSourceVersion;
  const scopedMembership =
    overrides.scopedMembership ?? baseline.scopedMembership;
  const enumeratedCandidateIdentities =
    overrides.enumeratedCandidateIdentities ??
    baseline.enumeratedCandidateIdentities;
  return {
    fixtureSnapshotVersion,
    candidateSourceVersion,
    scopedMembership,
    enumeratedCandidateIdentities,
    accountabilityKey:
      accountabilityKey ??
      JSON.stringify([
        fixtureSnapshotVersion,
        candidateSourceVersion,
        scopedMembership,
        enumeratedCandidateIdentities,
      ]),
  };
}

describe("D6-B1 evidence rejection boundary", () => {
  it("rejects duplicate, wrong-attribute, and NOT_REPRESENTABLE evidence instead of making it unknown", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const valid = evidenceFixture(candidate, constraint);
    const duplicate = evidenceFixture(candidate, constraint, "HUMAN_CURATED_FROM_EVIDENCE");
    const wrongAttribute = evidenceFixture(candidate, constraint, "VERIFIED_OR_MEASURED", {
      attributeId: TEXTURE_ATTRIBUTE_ID,
    });
    const notRepresentable = evidenceFixture(
      candidate,
      constraint,
      "NOT_REPRESENTABLE",
    );
    const eligibility = [eligibilitySummary(candidate)];

    expect(
      rejectionReason(runOne(candidate, [valid, duplicate], eligibility)),
    ).toBe("DUPLICATE_CANDIDATE_ATTRIBUTE_EVIDENCE");
    expect(
      rejectionReason(runOne(candidate, [wrongAttribute], eligibility)),
    ).toBe("EVIDENCE_ATTRIBUTE_IDENTITY_MISMATCH");
    expect(
      rejectionReason(runOne(candidate, [notRepresentable], eligibility)),
    ).toBe("EVIDENCE_NOT_REPRESENTABLE");
  });

  it("ignores unrelated candidate and target-attribute evidence", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const valid = evidenceFixture(candidate, constraint);
    const baseline = runOne(
      candidate,
      [valid],
      [eligibilitySummary(candidate)],
    );
    const unrelatedCandidate = evidenceFixture(
      candidateFixture("fixture:variant:unrelated", "fixture:style:unrelated"),
      constraint,
    );
    const unrelatedTarget = evidenceFixture(candidate, constraint, "CONFLICTING", {
      targetConstraintId: "constraint:unrelated",
      attributeId: TEXTURE_ATTRIBUTE_ID,
    });

    expect(
      runOne(
        candidate,
        [unrelatedTarget, valid, unrelatedCandidate],
        [eligibilitySummary(candidate)],
      ),
    ).toEqual(baseline);
  });
});

describe("D6-B1 eligibility admission", () => {
  it.each([
    {
      name: "missing",
      summaries: (): readonly StructuredEligibilitySummaryFixture[] => [],
      reason: "ELIGIBILITY_SUMMARY_MISSING",
    },
    {
      name: "duplicate",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate),
        eligibilitySummary(candidate, {
          fixtureReason: "fixture:eligible:duplicate",
        }),
      ],
      reason: "ELIGIBILITY_SUMMARY_DUPLICATE",
    },
    {
      name: "stale",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, {
          eligibilitySnapshotVersion: "fixture:stale",
        }),
      ],
      reason: "ELIGIBILITY_SUMMARY_STALE",
    },
    {
      name: "market mismatch",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { marketCode: "US" }),
      ],
      reason: "ELIGIBILITY_MARKET_MISMATCH",
    },
    {
      name: "wrong variant with matching style",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, {
          variantId: "fixture:variant:mismatch",
        }),
      ],
      reason: "ELIGIBILITY_SUMMARY_MISSING",
    },
    {
      name: "style mismatch",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, {
          canonicalStyleId: "fixture:style:mismatch",
        }),
      ],
      reason: "ELIGIBILITY_STYLE_MISMATCH",
    },
    {
      name: "unknown",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { outcome: "UNKNOWN_FIXTURE" }),
      ],
      reason: "ELIGIBILITY_SUMMARY_UNKNOWN",
    },
    {
      name: "ineligible",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { outcome: "INELIGIBLE_FIXTURE" }),
      ],
      reason: "ELIGIBILITY_SUMMARY_INELIGIBLE",
    },
    {
      name: "negative amount",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { selectedVariantAmount: -1 }),
      ],
      reason: "SELECTED_VARIANT_AMOUNT_INVALID",
    },
    {
      name: "fractional amount",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { selectedVariantAmount: 1.5 }),
      ],
      reason: "SELECTED_VARIANT_AMOUNT_INVALID",
    },
    {
      name: "null amount",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { selectedVariantAmount: null }),
      ],
      reason: "SELECTED_VARIANT_AMOUNT_INVALID",
    },
    {
      name: "null currency",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { currency: null }),
      ],
      reason: "SELECTED_VARIANT_CURRENCY_INVALID",
    },
    {
      name: "invalid currency",
      summaries: (candidate: StructuredCandidateFixture) => [
        eligibilitySummary(candidate, { currency: "krw" }),
      ],
      reason: "SELECTED_VARIANT_CURRENCY_INVALID",
    },
  ])("rejects $name eligibility explicitly", ({ summaries, reason }) => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const result = runOne(
      candidate,
      [evidenceFixture(candidate, constraint)],
      summaries(candidate),
    );

    expect(rejectionReason(result)).toBe(reason);
    if (result.status === "COMPLETED") {
      expect(result.counts.admissionAttempts).toBe(1);
      expect(result.counts.admissionRejected).toBe(1);
    }
  });

  it("rejects invalid eligibility fixture markers", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const summary = eligibilitySummary(candidate);
    Object.defineProperty(summary, "synthetic", { value: false });

    expect(
      rejectionReason(
        runOne(
          candidate,
          [evidenceFixture(candidate, constraint)],
          [summary],
        ),
      ),
    ).toBe("ELIGIBILITY_PROVENANCE_INVALID");
  });

  it("admits two exact variants that share one canonical style", () => {
    const constraint = governedConstraint();
    const first = candidateFixture();
    const second = candidateFixture(VARIANT_B, STYLE_A);
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([constraint]),
        policies: [categoricalPolicy(constraint)],
        stage0Proof: stage0Proof([
          {
            variantId: first.variantId,
            canonicalStyleId: first.canonicalStyleId,
          },
          {
            variantId: second.variantId,
            canonicalStyleId: second.canonicalStyleId,
          },
        ]),
        candidateSnapshot: candidateSnapshot([first, second]),
        evidenceFixtures: [
          evidenceFixture(first, constraint),
          evidenceFixture(second, constraint),
        ],
        eligibilitySummaries: [
          eligibilitySummary(first),
          eligibilitySummary(second),
        ],
      }),
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.counts.asserted).toBe(2);
      expect(result.counts.admissionRejected).toBe(0);
    }
  });

  it("ignores an unrelated same-style eligibility summary", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const unrelated = candidateFixture(VARIANT_B, candidate.canonicalStyleId);
    const result = runOne(
      candidate,
      [evidenceFixture(candidate, constraint)],
      [
        eligibilitySummary(unrelated),
        eligibilitySummary(candidate),
      ],
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.counts.asserted).toBe(1);
      expect(result.counts.admissionRejected).toBe(0);
    }
  });

  it("performs exactly one admission attempt per scoped candidate", () => {
    const constraint = governedConstraint();
    const admitted = candidateFixture(
      "fixture:variant:a",
      "fixture:style:a",
    );
    const rejected = candidateFixture(
      "fixture:variant:b",
      "fixture:style:b",
    );
    const result = runStructuredCategoricalFixtureSlice(
      structuredInput({
        parserResult: parserResult([constraint]),
        policies: [categoricalPolicy(constraint)],
        stage0Proof: stage0Proof([
          {
            variantId: rejected.variantId,
            canonicalStyleId: rejected.canonicalStyleId,
          },
          {
            variantId: admitted.variantId,
            canonicalStyleId: admitted.canonicalStyleId,
          },
        ]),
        candidateSnapshot: candidateSnapshot([rejected, admitted]),
        evidenceFixtures: [
          evidenceFixture(admitted, constraint),
          evidenceFixture(rejected, constraint, "NOT_REPRESENTABLE"),
        ],
        eligibilitySummaries: [
          eligibilitySummary(admitted),
          eligibilitySummary(rejected),
        ],
      }),
    );

    expect(result.status).toBe("COMPLETED");
    if (result.status === "COMPLETED") {
      expect(result.counts.enumeratedCandidates).toBe(2);
      expect(result.counts.admissionAttempts).toBe(2);
      expect(result.counts.asserted).toBe(1);
      expect(result.counts.admissionRejected).toBe(1);
      const outputIds = [
        ...result.assertedCandidates.map(
          (entry) => entry.displayedVariantId,
        ),
        ...result.admissionRejections.map((entry) => entry.variantId),
      ];
      expect(new Set(outputIds).size).toBe(2);
    }
  });
});

describe("D6-B1 exported admission choke point", () => {
  it("preserves the complete confirmed product tuple", () => {
    const input = directAdmissionInput(
      governedConstraint(undefined, { confirmed: true }),
    );
    const result = admitStructuredCandidate(input);

    expect(result.status).toBe("ADMITTED");
    if (result.status === "ADMITTED") {
      expect(result.candidate.productDecisions[0]).toMatchObject({
        relaxation: "CONFIRMATION_REQUIRED",
        reasons: [
          "CONFIRMATION_CHANGED_INTENT_ONLY",
          "EVIDENCE_QUALIFIED_MATCH",
        ],
      });
    }
  });

  it("rejects every forged query-decision field and mismatched or non-required policy", () => {
    const baseline = directAdmissionInput();
    const decision = baseline.requestPlan.queryDecisions[0];
    const policy = baseline.requestPlan.policies[0];
    if (decision === undefined || policy === undefined) {
      throw new TypeError("Synthetic admission tuple must exist");
    }
    const forgedDecisions: readonly {
      readonly name: string;
      readonly decision: ConstraintDecision;
    }[] = [
      {
        name: "subject",
        decision: {
          ...decision,
          subject: {
            kind: "FIXTURE_PRODUCT",
            fixtureProductId: baseline.candidate.variantId,
          },
        },
      },
      {
        name: "authority",
        decision: {
          ...decision,
          authorityOutcome: {
            kind: "OUTSIDE_DISCOVERY_AUTHORITY",
          },
        },
      },
      {
        name: "gate",
        decision: { ...decision, gate: "ASSERT_MATCH" },
      },
      {
        name: "score",
        decision: {
          ...decision,
          score: "PREFERENCE_ALLOWED",
        },
      },
      {
        name: "speech",
        decision: { ...decision, speechRequirements: [] },
      },
      {
        name: "partition",
        decision: { ...decision, partition: "UNKNOWN" },
      },
      {
        name: "relaxation",
        decision: {
          ...decision,
          relaxation: "NOT_APPLICABLE",
        },
      },
      {
        name: "routes",
        decision: {
          ...decision,
          fallbackRoutes: ["CLARIFICATION"],
        },
      },
      {
        name: "reasons",
        decision: {
          ...decision,
          reasons: ["PRODUCT_EVIDENCE_UNKNOWN"],
        },
      },
      {
        name: "diagnostics",
        decision: {
          ...decision,
          diagnostics: ["SYNTHETIC_TOLERANCE_APPLIED"],
        },
      },
    ];

    for (const forged of forgedDecisions) {
      expect(
        directRejectionReason(
          admitStructuredCandidate({
            ...baseline,
            requestPlan: {
              ...baseline.requestPlan,
              queryDecisions: [forged.decision],
            },
          }),
        ),
        forged.name,
      ).toBe("REQUEST_PLAN_INVARIANT_FAILED");
    }

    const forgedPolicies = [
      {
        ...policy,
        targetConstraintId: "constraint:forged",
      },
      {
        ...policy,
        attributeId: TEXTURE_ATTRIBUTE_ID,
      },
      {
        ...policy,
        disposition: "PREFERENCE" as const,
      },
    ];
    for (const forgedPolicy of forgedPolicies) {
      expect(
        directRejectionReason(
          admitStructuredCandidate({
            ...baseline,
            requestPlan: {
              ...baseline.requestPlan,
              policies: [forgedPolicy],
            },
          }),
        ),
      ).toBe("REQUEST_PLAN_INVARIANT_FAILED");
    }
  });

  it("rejects every forged required-product decision field", () => {
    const baseline = directAdmissionInput();
    const decision = baseline.evidenceEvaluation.productDecisions[0];
    if (decision === undefined) {
      throw new TypeError("Synthetic product decision must exist");
    }
    const forgedDecisions: readonly {
      readonly name: string;
      readonly decision: ConstraintDecision;
    }[] = [
      {
        name: "constraint identity",
        decision: {
          ...decision,
          constraintId: "constraint:forged",
        },
      },
      {
        name: "product identity",
        decision: {
          ...decision,
          subject: {
            kind: "FIXTURE_PRODUCT",
            fixtureProductId: "fixture:variant:forged",
          },
        },
      },
      {
        name: "authority",
        decision: {
          ...decision,
          authorityOutcome: {
            kind: "OUTSIDE_DISCOVERY_AUTHORITY",
          },
        },
      },
      {
        name: "gate",
        decision: { ...decision, gate: "DO_NOT_GATE" },
      },
      {
        name: "score",
        decision: {
          ...decision,
          score: "PREFERENCE_ALLOWED",
        },
      },
      {
        name: "speech",
        decision: {
          ...decision,
          speechRequirements: ["NO_PRODUCT_ASSERTION"],
        },
      },
      {
        name: "partition",
        decision: { ...decision, partition: "UNKNOWN" },
      },
      {
        name: "relaxation",
        decision: {
          ...decision,
          relaxation: "NOT_APPLICABLE",
        },
      },
      {
        name: "routes",
        decision: {
          ...decision,
          fallbackRoutes: ["CLARIFICATION"],
        },
      },
      {
        name: "reasons",
        decision: {
          ...decision,
          reasons: ["PRODUCT_EVIDENCE_UNKNOWN"],
        },
      },
      {
        name: "diagnostics",
        decision: {
          ...decision,
          diagnostics: ["SYNTHETIC_TOLERANCE_APPLIED"],
        },
      },
    ];

    for (const forged of forgedDecisions) {
      expect(
        directRejectionReason(
          admitStructuredCandidate({
            ...baseline,
            evidenceEvaluation: {
              ...baseline.evidenceEvaluation,
              productDecisions: [forged.decision],
            },
          }),
        ),
        forged.name,
      ).toBe("PRODUCT_DECISION_SET_INVALID");
    }
  });

  it("rejects forged candidate and source accountability independently", () => {
    const baseline = directAdmissionInput();
    const markerCandidates = [
      { ...baseline.candidate },
      { ...baseline.candidate },
    ];
    Object.defineProperty(markerCandidates[0], "fixtureOnly", {
      value: false,
    });
    Object.defineProperty(markerCandidates[1], "synthetic", {
      value: false,
    });
    const candidateCases: readonly StructuredCandidateFixture[] = [
      ...markerCandidates,
      {
        ...baseline.candidate,
        fixtureSnapshotVersion: "fixture:stale",
      },
      {
        ...baseline.candidate,
        candidateSourceVersion: "fixture:stale",
      },
    ];
    for (const candidate of candidateCases) {
      expect(
        directRejectionReason(
          admitStructuredCandidate({ ...baseline, candidate }),
        ),
      ).toBe("CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID");
    }

    const candidateIdentity = {
      variantId: baseline.candidate.variantId,
      canonicalStyleId: baseline.candidate.canonicalStyleId,
    };
    const outOfScopeIdentity = {
      variantId: "fixture:variant:z",
      canonicalStyleId: "fixture:style:z",
    };
    const attributionCases = [
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        { scopedMembership: [] },
      ),
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        {
          enumeratedCandidateIdentities: [
            {
              ...candidateIdentity,
              canonicalStyleId: "fixture:style:forged",
            },
          ],
        },
      ),
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        {
          enumeratedCandidateIdentities: [
            candidateIdentity,
            candidateIdentity,
          ],
        },
      ),
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        {
          enumeratedCandidateIdentities: [
            candidateIdentity,
            outOfScopeIdentity,
          ],
        },
      ),
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        { enumeratedCandidateIdentities: [] },
      ),
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        { fixtureSnapshotVersion: "fixture:stale" },
      ),
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        { candidateSourceVersion: "fixture:stale" },
      ),
      sourceAttributionWith(
        baseline.candidateSourceAttribution,
        {},
        "fixture:forged-accountability-key",
      ),
    ];
    for (const candidateSourceAttribution of attributionCases) {
      expect(
        directRejectionReason(
          admitStructuredCandidate({
            ...baseline,
            candidateSourceAttribution,
          }),
        ),
      ).toBe("CANDIDATE_SOURCE_ACCOUNTABILITY_INVALID");
    }

    expect(
      directRejectionReason(
        admitStructuredCandidate({
          ...baseline,
          candidate: candidateFixture(
            "fixture:variant:outside",
            "fixture:style:outside",
          ),
        }),
      ),
    ).toBe("CANDIDATE_OUTSIDE_STAGE0_SCOPE");
  });
});

describe("D6-B1 landing integrity", () => {
  it("preserves selected variant, style, amount, and currency without repair", () => {
    const candidate = candidateFixture();
    const constraint = governedConstraint();
    const eligibility = eligibilitySummary(candidate, {
      selectedVariantAmount: 91234,
      currency: "KRW",
    });
    const result = runOne(
      candidate,
      [evidenceFixture(candidate, constraint)],
      [eligibility],
    );
    if (result.status !== "COMPLETED") {
      throw new TypeError("Synthetic structured run must complete");
    }
    const admitted = result.assertedCandidates[0];
    if (admitted === undefined) {
      throw new TypeError("Synthetic structured candidate must assert");
    }

    expect(admitted).toMatchObject({
      displayedVariantId: candidate.variantId,
      displayedStyleId: candidate.canonicalStyleId,
      priceBasis: "SELECTED_VARIANT",
      amount: 91234,
      currency: "KRW",
    });
    expect(
      verifyStructuredLanding(
        admitted.landingIntent,
        candidate,
        eligibility,
      ),
    ).toEqual({ status: "VERIFIED" });

    const mismatches: readonly StructuredLandingIntent[] = [
      {
        ...admitted.landingIntent,
        displayedVariantId: "fixture:variant:mismatch",
      },
      {
        ...admitted.landingIntent,
        displayedStyleId: "fixture:style:mismatch",
      },
      { ...admitted.landingIntent, amount: 1 },
      { ...admitted.landingIntent, currency: "USD" },
    ];
    for (const intent of mismatches) {
      const before = JSON.stringify(intent);
      expect(
        verifyStructuredLanding(intent, candidate, eligibility),
      ).toEqual({
        status: "LANDING_INTEGRITY_MISMATCH",
        reason: "LANDING_INTEGRITY_MISMATCH",
      });
      expect(JSON.stringify(intent)).toBe(before);
    }
  });
});
