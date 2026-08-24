export const REVISION_SOURCE_KINDS = [
  "MANUAL_AUTHORING",
  "LEGACY_IMPORT",
  "LOCALIZATION",
] as const;
export type RevisionSourceKind = (typeof REVISION_SOURCE_KINDS)[number];

export const CLAIM_DISPOSITIONS = ["NON_MATERIAL", "MATERIAL_OR_UNRESOLVED"] as const;
export type ClaimDisposition = (typeof CLAIM_DISPOSITIONS)[number];

export const APPROVAL_DECISIONS = ["APPROVED", "REJECTED", "REVOKED"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export type LocalizedContentErrorCode =
  | "INVALID_INPUT"
  | "STYLE_NOT_FOUND"
  | "REVISION_NOT_FOUND"
  | "SOURCE_REVISION_NOT_FOUND"
  | "LEGACY_SOURCE_CHANGED"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATE_TRANSITION"
  | "MATERIAL_CLAIM"
  | "REVISION_NOT_APPROVED"
  | "PUBLICATION_CONFLICT"
  | "EDITORIAL_APPROVER_DISABLED"
  | "EDITORIAL_APPROVER_FORBIDDEN"
  | "PUBLISHER_DISABLED"
  | "PUBLISHER_FORBIDDEN";

export class LocalizedContentException extends Error {
  constructor(
    readonly code: LocalizedContentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocalizedContentException";
  }
}

export interface SubmitRevisionInput {
  wigStyleId: unknown;
  locale: unknown;
  displayName?: unknown;
  description?: unknown;
  sourceKind: unknown;
  sourceRevisionId?: unknown;
  claimDisposition: unknown;
  submissionKey: unknown;
  legacyUpdatedAt?: unknown;
}

export interface DecideRevisionInput {
  revisionId: unknown;
  decision: unknown;
  rationale?: unknown;
  requestKey: unknown;
}

export interface PublishRevisionInput {
  revisionId: unknown;
  expectedPublicationVersion: unknown;
  requestKey: unknown;
}

export interface WithdrawPublicationInput {
  wigStyleId: unknown;
  locale: unknown;
  expectedPublicationVersion: unknown;
  reason: unknown;
  requestKey: unknown;
}

export interface LocalizedRevisionView {
  id: string;
  wigStyleId: string;
  locale: string;
  displayName: string;
  description: string | null;
  sourceKind: RevisionSourceKind;
  sourceRevisionId: string | null;
  legacySourceUpdatedAt: Date | null;
  claimDisposition: ClaimDisposition;
  submissionKey: string;
  submittedByUserId: string;
  submittedAt: Date;
}

export interface ApprovalDecisionView {
  id: string;
  revisionId: string;
  ordinal: number;
  decision: ApprovalDecision;
  rationale: string | null;
  requestKey: string;
  actorUserId: string;
  decidedAt: Date;
}

export interface PublicationTransitionView {
  eventId: string | null;
  wigStyleId: string;
  locale: string;
  action: "PUBLISHED" | "WITHDRAWN" | "NO_OP";
  currentRevisionId: string | null;
  version: number;
}

export interface LocalizedContentCapabilities {
  canApprove: boolean;
  canPublish: boolean;
  editorialApproverConfigured: boolean;
  publisherConfigured: boolean;
}
