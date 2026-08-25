import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { previewLegacyLocalizedContent } from "./commands";
import type { ApprovalDecision, ClaimDisposition, RevisionSourceKind } from "./types";

export interface AdminLocalizedRevision {
  id: string;
  locale: string;
  displayName: string;
  description: string | null;
  sourceKind: RevisionSourceKind;
  sourceRevisionId: string | null;
  claimDisposition: ClaimDisposition;
  submittedByUserId: string;
  submittedAt: string;
  latestDecision: ApprovalDecision | null;
  latestDecisionRationale: string | null;
  latestDecisionOrdinal: number | null;
}

export interface AdminLocalizedPublication {
  locale: "ko" | "en" | "ja";
  currentRevisionId: string | null;
  version: number;
}

export interface AdminLocalizedPublicationEvent {
  id: string;
  locale: string;
  sequence: number;
  action: "PUBLISHED" | "WITHDRAWN";
  fromRevisionId: string | null;
  toRevisionId: string | null;
  reason: string | null;
  authorityBasis: string;
  actorUserId: string;
  occurredAt: string;
}

export interface AdminLocalizedApprovalDecision {
  id: string;
  revisionId: string;
  ordinal: number;
  decision: ApprovalDecision;
  rationale: string | null;
  authorityBasis: string;
  actorUserId: string;
  decidedAt: string;
}

export interface AdminLocalizedContentState {
  legacyPreview: Awaited<ReturnType<typeof previewLegacyLocalizedContent>>;
  revisions: AdminLocalizedRevision[];
  publications: AdminLocalizedPublication[];
  approvalDecisions: AdminLocalizedApprovalDecision[];
  publicationEvents: AdminLocalizedPublicationEvent[];
}

interface RevisionRow extends Omit<AdminLocalizedRevision, "submittedAt"> {
  submittedAt: Date;
}

interface PublicationEventRow extends Omit<AdminLocalizedPublicationEvent, "occurredAt"> {
  occurredAt: Date;
}

interface ApprovalDecisionRow extends Omit<AdminLocalizedApprovalDecision, "decidedAt"> {
  decidedAt: Date;
}

export async function getAdminLocalizedContentState(
  wigStyleId: string,
): Promise<AdminLocalizedContentState> {
  const [legacyPreview, revisionRows, publicationRows, decisionRows, eventRows] = await Promise.all([
    previewLegacyLocalizedContent(wigStyleId, "ko"),
    db.$queryRaw<RevisionRow[]>(Prisma.sql`
      SELECT revision."id", revision."locale", revision."displayName", revision."description",
             revision."sourceKind", revision."sourceRevisionId", revision."claimDisposition",
             revision."submittedByUserId", revision."submittedAt",
             latest."decision" AS "latestDecision",
             latest."rationale" AS "latestDecisionRationale",
             latest."ordinal" AS "latestDecisionOrdinal"
      FROM "WigStyleLocalizedRevision" revision
      LEFT JOIN LATERAL (
        SELECT decision."decision", decision."rationale", decision."ordinal"
        FROM "WigStyleLocalizedApprovalDecision" decision
        WHERE decision."revisionId" = revision."id"
        ORDER BY decision."ordinal" DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE revision."wigStyleId" = ${wigStyleId}
      ORDER BY revision."submittedAt" DESC, revision."id" DESC
    `),
    db.$queryRaw<AdminLocalizedPublication[]>(Prisma.sql`
      SELECT "locale", "currentRevisionId", "version"
      FROM "WigStyleLocalizedPublication"
      WHERE "wigStyleId" = ${wigStyleId}
      ORDER BY "locale"
    `),
    db.$queryRaw<ApprovalDecisionRow[]>(Prisma.sql`
      SELECT decision."id", decision."revisionId", decision."ordinal", decision."decision",
             decision."rationale", decision."authorityBasis", decision."actorUserId", decision."decidedAt"
      FROM "WigStyleLocalizedApprovalDecision" decision
      INNER JOIN "WigStyleLocalizedRevision" revision ON revision."id" = decision."revisionId"
      WHERE revision."wigStyleId" = ${wigStyleId}
      ORDER BY decision."decidedAt" DESC, decision."id" DESC
    `),
    db.$queryRaw<PublicationEventRow[]>(Prisma.sql`
      SELECT "id", "locale", "sequence", "action", "fromRevisionId", "toRevisionId",
             "reason", "authorityBasis", "actorUserId", "occurredAt"
      FROM "WigStyleLocalizedPublicationEvent"
      WHERE "wigStyleId" = ${wigStyleId}
      ORDER BY "occurredAt" DESC, "id" DESC
    `),
  ]);
  const publicationByLocale = new Map(publicationRows.map((row) => [row.locale, row]));
  return {
    legacyPreview,
    revisions: revisionRows.map((row) => ({
      ...row,
      submittedAt: row.submittedAt.toISOString(),
    })),
    publications: (["ko", "en", "ja"] as const).map((locale) => (
      publicationByLocale.get(locale) ?? { locale, currentRevisionId: null, version: 0 }
    )),
    approvalDecisions: decisionRows.map((row) => ({
      ...row,
      decidedAt: row.decidedAt.toISOString(),
    })),
    publicationEvents: eventRows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    })),
  };
}
