import type { MarketCode } from "@/lib/market/types";

const localeCodeBrand: unique symbol = Symbol("LocaleCode");
const languageTagBrand: unique symbol = Symbol("LanguageTag");
const audienceNamespaceBrand: unique symbol = Symbol("AudienceNamespace");

export interface LocaleCode {
  readonly value: string;
  readonly [localeCodeBrand]: true;
}

export interface LanguageTag {
  readonly value: string;
  readonly [languageTagBrand]: true;
}

export interface AudienceNamespace {
  readonly value: string;
  readonly [audienceNamespaceBrand]: true;
}

export type QueryLanguage =
  | { readonly mode: "AUTO" }
  | { readonly mode: "DECLARED"; readonly languageTag: LanguageTag };

export interface DiscoveryContext {
  readonly marketCode: MarketCode;
  readonly locale: LocaleCode;
  readonly queryLanguage: QueryLanguage;
  readonly audienceNamespace: AudienceNamespace;
}

function validateOpaqueToken(value: string, fieldName: string): string {
  if (value.length === 0 || value.trim() !== value) {
    throw new RangeError(`${fieldName} must be a nonblank token without surrounding whitespace`);
  }

  return value;
}

function hideOpaqueBrand<T extends object>(token: T, brand: symbol): T {
  Object.defineProperty(token, brand, { enumerable: false });
  return token;
}

export function createLocaleCode(value: string): LocaleCode {
  return hideOpaqueBrand(
    {
      value: validateOpaqueToken(value, "locale"),
      [localeCodeBrand]: true,
    },
    localeCodeBrand,
  );
}

export function createLanguageTag(value: string): LanguageTag {
  return hideOpaqueBrand(
    {
      value: validateOpaqueToken(value, "languageTag"),
      [languageTagBrand]: true,
    },
    languageTagBrand,
  );
}

export function createAudienceNamespace(value: string): AudienceNamespace {
  return hideOpaqueBrand(
    {
      value: validateOpaqueToken(value, "audienceNamespace"),
      [audienceNamespaceBrand]: true,
    },
    audienceNamespaceBrand,
  );
}

export function createAutoQueryLanguage(): QueryLanguage {
  return { mode: "AUTO" };
}

export function createDeclaredQueryLanguage(languageTag: string): QueryLanguage {
  return { mode: "DECLARED", languageTag: createLanguageTag(languageTag) };
}

export interface RawQueryInput {
  readonly text: string;
}

export interface TextRange {
  readonly startInclusive: number;
  readonly endExclusive: number;
}

export interface NormalizedOffsetMapEntry {
  readonly normalizedRange: TextRange;
  readonly rawRange: TextRange;
}

export interface NormalizedQuery {
  readonly rawText: string;
  readonly comparisonText: string;
  readonly normalizationForm: "NFC";
  readonly coordinateSystem: "UTF16_CODE_UNIT";
  readonly inputState: "EMPTY" | "NON_EMPTY";
  readonly offsetMap: readonly NormalizedOffsetMapEntry[];
}

export type InterpretationState = "DECLARED" | "DERIVED" | "BRIDGED" | "UNRESOLVED";

export type AttributeBand =
  | "IDENTITY"
  | "CLAIM_BEARING"
  | "DIMENSIONAL_CONTINUOUS"
  | "STYLISTIC"
  | "OUTCOME_INTENT"
  | "AUTHORITY_ROUTE";

export type D5DecisionProfile =
  | "CLAIM_BEARING_MATERIAL"
  | "SENSITIVE_USE_CONTEXT"
  | "GOVERNED_STYLISTIC_CATEGORICAL";

export interface ExactIdentityConstraint {
  readonly kind: "EXACT_IDENTITY";
  readonly namespace: string;
  readonly value: string;
}

export interface CategoricalConstraint {
  readonly kind: "CATEGORICAL";
  readonly attributeId: string;
  readonly valueId: string;
}

export interface ContinuousConstraint {
  readonly kind: "CONTINUOUS";
  readonly dimensionId: string;
  readonly quantity: {
    readonly value: number;
    readonly unitId: string;
  };
}

export interface OutcomeIntentConstraint {
  readonly kind: "OUTCOME_INTENT";
  readonly conceptId: string;
}

export interface UnsupportedConstraint {
  readonly kind: "UNKNOWN_OR_UNSUPPORTED";
  readonly conceptId: string | null;
  readonly state: "UNSUPPORTED" | "AMBIGUOUS";
}

export interface AuthorityRouteConstraint {
  readonly kind: "AUTHORITY_ROUTE";
  readonly conceptId: string;
}

export type ConstraintValue =
  | ExactIdentityConstraint
  | CategoricalConstraint
  | ContinuousConstraint
  | OutcomeIntentConstraint
  | UnsupportedConstraint
  | AuthorityRouteConstraint;

export type ConstraintSource =
  | {
      readonly kind: "QUERY_SPAN";
      readonly spanId: string;
      readonly lexiconEntryId: string | null;
      readonly identityRecognizerId: string | null;
    }
  | {
      readonly kind: "USER_CONFIRMATION";
      readonly priorConstraintId: string;
    };

export interface InterpretedConstraint {
  readonly constraintId: string;
  readonly value: ConstraintValue;
  readonly source: ConstraintSource;
  readonly interpretationState: InterpretationState;
  readonly attributeBand: AttributeBand;
  readonly decisionProfile: D5DecisionProfile | null;
}

export type QuerySpanOwner =
  | "EXACT_IDENTITY"
  | "CONCEPT"
  | "NUMBER_WITH_UNIT"
  | "OUTCOME_INTENT"
  | "AUDIENCE_ROUTE"
  | "UNSUPPORTED";

export interface QuerySpan {
  readonly spanId: string;
  readonly constraintId: string;
  readonly rawRange: TextRange;
  readonly normalizedRange: TextRange;
  readonly rawText: string;
  readonly normalizedText: string;
  readonly owner: QuerySpanOwner;
  readonly conceptId: string | null;
  readonly lexiconEntryId: string | null;
  readonly identityRecognizerId: string | null;
  readonly languageTag: LanguageTag | null;
  readonly interpretationState: InterpretationState;
}

export interface UnsupportedConcept {
  readonly constraintId: string;
  readonly conceptId: string | null;
  readonly spanId: string;
  readonly state: "UNRESOLVED";
}

export interface Contradiction {
  readonly constraintId: string;
  readonly leftConstraintId: string;
  readonly rightConstraintId: string;
  readonly attributeId: string;
  readonly kind: "MUTUALLY_EXCLUSIVE_VALUES";
}

export type ParserDiagnosticCode =
  | "EMPTY_QUERY"
  | "AMBIGUOUS_SAME_PRECEDENCE_OVERLAP"
  | "CONFIRMATION_TARGET_OR_VALUE_MISMATCH"
  | "MIXED_LANGUAGE_SPANS_RESOLVED";

export interface ParserDiagnostic {
  readonly code: ParserDiagnosticCode;
  readonly spanIds: readonly string[];
}

export interface ParserResult {
  readonly normalizedQuery: NormalizedQuery;
  readonly spans: readonly QuerySpan[];
  readonly constraints: readonly InterpretedConstraint[];
  readonly unsupported: readonly UnsupportedConcept[];
  readonly contradictions: readonly Contradiction[];
  readonly diagnostics: readonly ParserDiagnostic[];
  readonly parserVersion: string;
  readonly lexiconVersion: string;
  readonly ontologyVersion: string;
}

export interface QueryLexiconEntry {
  readonly entryId: string;
  readonly surface: string;
  readonly matchPolicy: QueryLexiconMatchPolicy;
  readonly languageTag: LanguageTag | null;
  readonly owner: "CONCEPT" | "OUTCOME_INTENT" | "AUDIENCE_ROUTE" | "UNSUPPORTED";
  readonly conceptId: string;
  readonly attributeBand: AttributeBand;
  readonly decisionProfile: D5DecisionProfile | null;
  readonly interpretationState: InterpretationState;
  readonly value:
    | CategoricalConstraint
    | OutcomeIntentConstraint
    | UnsupportedConstraint
    | AuthorityRouteConstraint;
  readonly mutualExclusionGroup: string | null;
}

export type QueryLexiconMatchPolicy =
  | "SUBSTRING"
  | "WORD_LIKE_BOUNDARIES";

export interface QueryUnitEntry {
  readonly entryId: string;
  readonly surface: string;
  readonly languageTag: LanguageTag | null;
  readonly dimensionId: string;
  readonly unitId: string;
}

export interface QueryLexicon {
  readonly version: string;
  readonly ontologyVersion: string;
  readonly entries: readonly QueryLexiconEntry[];
  readonly units: readonly QueryUnitEntry[];
}

export interface ExactIdentityRecognition {
  readonly normalizedRange: TextRange;
  readonly namespace: string;
  readonly canonicalValue: string;
}

export interface ExactIdentityRecognizer {
  readonly recognizerId: string;
  readonly version: string;
  readonly recognize: (comparisonText: string) => readonly ExactIdentityRecognition[];
}

export interface QueryConfirmation {
  readonly confirmed: boolean;
  readonly targetConstraintId: string;
  readonly value: ConstraintValue;
}

export interface ParseQueryInput {
  readonly normalizedQuery: NormalizedQuery;
  readonly lexicon: QueryLexicon;
  readonly identityRecognizers: readonly ExactIdentityRecognizer[];
  readonly confirmations?: readonly QueryConfirmation[];
}

export type ProductEvidenceFixtureState =
  | "VERIFIED_OR_MEASURED"
  | "APPROVED_VENDOR_ATTESTED"
  | "UNAPPROVED_VENDOR_DECLARATION"
  | "HUMAN_CURATED_FROM_EVIDENCE"
  | "MODEL_INFERRED"
  | "MISSING"
  | "CONFLICTING"
  | "NOT_REPRESENTABLE"
  | "UNKNOWN_AUTHORITY";

export type ProductEvidenceValue =
  | ExactIdentityConstraint
  | {
      readonly kind: "CATEGORICAL";
      readonly valueId: string;
    }
  | {
      readonly kind: "MEASURED_QUANTITY";
      readonly quantity: {
        readonly value: number;
        readonly unitId: string;
      };
    };

export interface ProductEvidenceFixture {
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly fixtureProductId: string;
  readonly attributeId: string;
  readonly value: ProductEvidenceValue | null;
  readonly state: ProductEvidenceFixtureState;
  readonly syntheticEvidenceRef: string | null;
}

export interface ContinuousTolerancePolicyFixture {
  readonly kind: "CONTINUOUS_TOLERANCE";
  readonly synthetic: true;
  readonly dimensionId: string;
  readonly unitId: string;
  readonly lowerDelta: number;
  readonly upperDelta: number;
  readonly policyVersion: string;
}

export interface ClaimAuthorityPolicyFixture {
  readonly kind: "CLAIM_AUTHORITY";
  readonly synthetic: true;
  readonly status: "UNAVAILABLE";
}

export interface VendorAttestationPolicyFixture {
  readonly kind: "VENDOR_ATTESTATION";
  readonly synthetic: true;
  readonly permitted: boolean;
  readonly policyVersion: string;
}

export type CategoricalPolicyDisposition =
  | "REQUIRED"
  | "PREFERENCE"
  | "ROUTE"
  | "CLARIFICATION"
  | "UNSUPPORTED";

export interface CategoricalPolicyFixture {
  readonly kind: "CATEGORICAL_POLICY";
  readonly fixtureOnly: true;
  readonly synthetic: true;
  readonly targetConstraintId: string;
  readonly attributeId: string;
  readonly disposition: CategoricalPolicyDisposition;
  readonly policyVersion: string;
}

export type DecisionPolicyFixture =
  | ContinuousTolerancePolicyFixture
  | ClaimAuthorityPolicyFixture
  | VendorAttestationPolicyFixture
  | CategoricalPolicyFixture;

export type DecisionSubject =
  | { readonly kind: "QUERY" }
  | { readonly kind: "FIXTURE_PRODUCT"; readonly fixtureProductId: string };

export type ConstraintDecisionTarget =
  | {
      readonly kind: "INTERPRETED_CONSTRAINT";
      readonly decisionLevel: "QUERY";
      readonly constraint: InterpretedConstraint;
    }
  | {
      readonly kind: "INTERPRETED_CONSTRAINT";
      readonly decisionLevel: "FIXTURE_PRODUCT";
      readonly constraint: InterpretedConstraint;
    }
  | { readonly kind: "CONTRADICTION"; readonly contradiction: Contradiction };

export type QueryInterpretedConstraintDecisionTarget = Extract<
  ConstraintDecisionTarget,
  {
    readonly kind: "INTERPRETED_CONSTRAINT";
    readonly decisionLevel: "QUERY";
  }
>;

export type FixtureProductConstraintDecisionTarget = Extract<
  ConstraintDecisionTarget,
  {
    readonly kind: "INTERPRETED_CONSTRAINT";
    readonly decisionLevel: "FIXTURE_PRODUCT";
  }
>;

export type QueryConstraintDecisionTarget =
  | QueryInterpretedConstraintDecisionTarget
  | Extract<ConstraintDecisionTarget, { readonly kind: "CONTRADICTION" }>;

export type AuthorityOutcome =
  | {
      readonly kind: "PRESERVE_CALLER_CONTEXT";
      readonly audienceNamespace: AudienceNamespace;
    }
  | { readonly kind: "OUTSIDE_DISCOVERY_AUTHORITY" }
  | { readonly kind: "NOT_APPLICABLE" };

export type GateDecision =
  | "ASSERT_MATCH"
  | "REQUIRE_MATCH"
  | "DO_NOT_GATE"
  | "REQUIRE_CLARIFICATION"
  | "ROUTE_ONLY"
  | "UNSUPPORTED";

export type ScoreDecision = "NONE" | "PREFERENCE_ALLOWED";

export type SpeechRequirement =
  | "NO_PRODUCT_ASSERTION"
  | "DISCLOSE_EVIDENCE_BASIS"
  | "DISCLOSE_UNKNOWN"
  | "DISCLOSE_ROUTE_LIMITATION";

export type EvidencePartition = "ASSERTED" | "UNKNOWN" | "VIOLATING" | "WITHHELD" | "NOT_APPLICABLE";

export type RelaxationDecision =
  | "NEVER"
  | "CONFIRMATION_REQUIRED"
  | "NOT_APPLICABLE";

export type FallbackRoute =
  | "CLARIFICATION"
  | "EDUCATION_OR_CONSULTATION"
  | "AUDIENCE_SWITCH_OFFER"
  | "EXPLICIT_UNSUPPORTED"
  | "EXACT_IDENTITY_NOT_FOUND";

export type DiscoveryReasonCode =
  | "EXACT_IDENTITY_MATCH"
  | "EXACT_IDENTITY_NO_SUBSTITUTION"
  | "EVIDENCE_QUALIFIED_MATCH"
  | "EVIDENCE_QUALIFIED_MISMATCH"
  | "PRODUCT_EVIDENCE_UNKNOWN"
  | "PRODUCT_EVIDENCE_CONFLICT"
  | "CLAIM_AUTHORITY_UNAVAILABLE_ROUTE"
  | "UNSUPPORTED_CONCEPT"
  | "CONTRADICTORY_QUERY"
  | "CONFIRMATION_CHANGED_INTENT_ONLY"
  | "AUDIENCE_NAMESPACE_PRESERVED"
  | "MODEL_INFERRED_CLAIM_HAS_NO_AUTHORITY"
  | "CATEGORICAL_REQUIRED_BY_POLICY"
  | "CATEGORICAL_PREFERENCE_BY_POLICY"
  | "CATEGORICAL_OUTSIDE_DISCOVERY_AUTHORITY_ROUTE"
  | "CATEGORICAL_CLARIFICATION_REQUIRED"
  | "CATEGORICAL_UNSUPPORTED_BY_POLICY"
  | "MODEL_INFERRED_STYLISTIC_HAS_NO_ASSERTION_AUTHORITY";

export type FixtureReasonCode =
  | "CONTINUOUS_WITHIN_SYNTHETIC_TOLERANCE"
  | "CONTINUOUS_OUTSIDE_SYNTHETIC_TOLERANCE"
  | "SYNTHETIC_TOLERANCE_REQUIRED";

export type ConstraintReasonCode = DiscoveryReasonCode | FixtureReasonCode;

export type FixtureDecisionDiagnostic =
  | "SYNTHETIC_TOLERANCE_APPLIED"
  | "SYNTHETIC_VENDOR_ATTESTATION_POLICY_APPLIED";

export interface ConstraintDecision {
  readonly constraintId: string;
  readonly subject: DecisionSubject;
  readonly authorityOutcome: AuthorityOutcome;
  readonly gate: GateDecision;
  readonly score: ScoreDecision;
  readonly speechRequirements: readonly SpeechRequirement[];
  readonly partition: EvidencePartition;
  readonly relaxation: RelaxationDecision;
  readonly fallbackRoutes: readonly FallbackRoute[];
  readonly reasons: readonly ConstraintReasonCode[];
  readonly diagnostics: readonly FixtureDecisionDiagnostic[];
}

interface DecideConstraintInputBase {
  readonly context: DiscoveryContext;
  readonly evidence?: ProductEvidenceFixture;
  readonly policies?: readonly DecisionPolicyFixture[];
}

export type DecideConstraintInput =
  | (DecideConstraintInputBase & {
      readonly target: QueryConstraintDecisionTarget;
      readonly subject: Extract<DecisionSubject, { readonly kind: "QUERY" }>;
    })
  | (DecideConstraintInputBase & {
      readonly target: FixtureProductConstraintDecisionTarget;
      readonly subject: Extract<
        DecisionSubject,
        { readonly kind: "FIXTURE_PRODUCT" }
      >;
    });

export interface DiscoveryComponentVersions {
  readonly requestSchema: string;
  readonly normalizer: string;
  readonly parser: string;
  readonly constraintRules: string;
  readonly fixtureSnapshot: string;
}
