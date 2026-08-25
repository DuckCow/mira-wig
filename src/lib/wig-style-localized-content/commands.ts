import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  LocalizedContentException,
  type ApprovalDecision,
  type ApprovalDecisionView,
  type ClaimDisposition,
  type DecideRevisionInput,
  type LocalizedRevisionView,
  type PublicationTransitionView,
  type PublishRevisionInput,
  type RevisionSourceKind,
  type SubmitRevisionInput,
  type WithdrawPublicationInput,
} from "./types";
import {
  AUTO_WITHDRAW_REQUEST_KEY_PREFIX,
  approvalDecisionValue,
  claimDispositionValue,
  dateTokenValue,
  expectedVersionValue,
  externalPublicationRequestKey,
  localeValue,
  optionalString,
  requiredString,
  sourceKindValue,
} from "./validation";

type Transaction = Prisma.TransactionClient;
type QueryClient = Pick<Prisma.TransactionClient, "$queryRaw">;

const REVISION_SUBMISSION_KEY_CONSTRAINT = "WigStyleLocalizedRevision_submissionKey_key";
const APPROVAL_REQUEST_KEY_CONSTRAINT = "WigStyleLocalizedApprovalDecision_requestKey_key";
const PUBLICATION_REQUEST_KEY_CONSTRAINT = "WigStyleLocalizedPublicationEvent_requestKey_key";

interface LegacyStyleRow {
  id: string;
  name: string;
  description: string | null;
  updatedAt: Date;
}

interface DecisionRow extends ApprovalDecisionView {
  authorityBasis: "PROJECT_OWNER_EDITORIAL_CONFIG";
}

interface PublicationRow {
  wigStyleId: string;
  locale: string;
  currentRevisionId: string | null;
  version: number;
}

interface PublicationEventRow {
  id: string;
  wigStyleId: string;
  locale: string;
  sequence: number;
  action: "PUBLISHED" | "WITHDRAWN";
  fromRevisionId: string | null;
  toRevisionId: string | null;
  reason: string | null;
  requestKey: string;
  actorUserId: string;
  authorityBasis:
    | "PROJECT_OWNER_PUBLICATION_CONFIG"
    | "APPROVAL_REVOCATION_ENFORCEMENT";
}

interface SubmissionIntent {
  actorUserId: string;
  wigStyleId: string;
  locale: "ko" | "en" | "ja";
  sourceKind: RevisionSourceKind;
  sourceRevisionId: string | null;
  legacySourceUpdatedAt: Date | null;
  claimDisposition: ClaimDisposition;
  displayName: string | null;
  description: string | null;
}

function only<T>(rows: T[]): T | null {
  return rows[0] ?? null;
}

function isUniqueConstraintConflict(
  error: unknown,
  constraintName: string,
  fieldName: string,
): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P2010") {
    return error.message.includes("23505") && error.message.includes(constraintName);
  }
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (typeof target === "string") {
    return target.includes(constraintName) || target.includes(fieldName);
  }
  if (Array.isArray(target)) {
    return target.some((value) => value === fieldName || value === constraintName);
  }
  return JSON.stringify(error.meta).includes(constraintName);
}

async function findRevisionBySubmissionKey(
  client: QueryClient,
  submissionKey: string,
): Promise<LocalizedRevisionView | null> {
  return only(
    await client.$queryRaw<LocalizedRevisionView[]>(Prisma.sql`
      SELECT "id", "wigStyleId", "locale", "displayName", "description", "sourceKind",
             "sourceRevisionId", "legacySourceUpdatedAt", "claimDisposition", "submissionKey",
             "submittedByUserId", "submittedAt"
      FROM "WigStyleLocalizedRevision"
      WHERE "submissionKey" = ${submissionKey}
    `),
  );
}

async function lockStyle(transaction: Transaction, wigStyleId: string): Promise<LegacyStyleRow> {
  const style = only(
    await transaction.$queryRaw<LegacyStyleRow[]>(Prisma.sql`
      SELECT "id", "name", "description", "updatedAt"
      FROM "WigStyle"
      WHERE "id" = ${wigStyleId}
      FOR UPDATE
    `),
  );
  if (!style) {
    throw new LocalizedContentException("STYLE_NOT_FOUND", "Wig style was not found.");
  }
  return style;
}

function assertSubmissionReplay(
  existing: LocalizedRevisionView,
  intent: SubmissionIntent,
): LocalizedRevisionView {
  const sameIntent = [
    existing.submittedByUserId === intent.actorUserId,
    existing.wigStyleId === intent.wigStyleId,
    existing.locale === intent.locale,
    existing.sourceKind === intent.sourceKind,
    existing.sourceRevisionId === intent.sourceRevisionId,
    sameTimestamp(existing.legacySourceUpdatedAt, intent.legacySourceUpdatedAt),
    existing.claimDisposition === intent.claimDisposition,
    sameSubmissionContent(existing, intent),
  ].every(Boolean);
  if (!sameIntent) {
    throw new LocalizedContentException(
      "IDEMPOTENCY_CONFLICT",
      "submissionKey was already used for a different submission.",
    );
  }
  return existing;
}

function sameTimestamp(left: Date | null, right: Date | null): boolean {
  if (!left || !right) return left === right;
  return left.getTime() === right.getTime();
}

function sameSubmissionContent(
  existing: LocalizedRevisionView,
  intent: SubmissionIntent,
): boolean {
  if (intent.sourceKind === "LEGACY_IMPORT") return true;
  return existing.displayName === intent.displayName && existing.description === intent.description;
}

function submissionSourceRevisionId(
  sourceKind: RevisionSourceKind,
  value: unknown,
): string | null {
  if (sourceKind === "LOCALIZATION") return requiredString(value, "sourceRevisionId");
  if (value === undefined || value === null || value === "") return null;
  throw new LocalizedContentException(
    "INVALID_INPUT",
    "sourceRevisionId is only valid for LOCALIZATION submissions.",
  );
}

function normalizeSubmissionIntent(
  actorUserIdValue: unknown,
  input: SubmitRevisionInput,
): Readonly<{ intent: SubmissionIntent; submissionKey: string }> {
  const sourceKind = sourceKindValue(input.sourceKind);
  const intent: SubmissionIntent = {
    actorUserId: requiredString(actorUserIdValue, "actorUserId"),
    wigStyleId: requiredString(input.wigStyleId, "wigStyleId"),
    locale: localeValue(input.locale),
    sourceKind,
    sourceRevisionId: submissionSourceRevisionId(sourceKind, input.sourceRevisionId),
    legacySourceUpdatedAt:
      sourceKind === "LEGACY_IMPORT" ? dateTokenValue(input.legacyUpdatedAt) : null,
    claimDisposition: claimDispositionValue(input.claimDisposition),
    displayName:
      sourceKind === "LEGACY_IMPORT"
        ? null
        : requiredString(input.displayName, "displayName", 200),
    description:
      sourceKind === "LEGACY_IMPORT"
        ? null
        : optionalString(input.description, "description", 5000),
  };
  return {
    intent,
    submissionKey: requiredString(input.submissionKey, "submissionKey", 128),
  };
}

export async function previewLegacyLocalizedContent(wigStyleIdValue: unknown, localeValueInput: unknown): Promise<{
  wigStyleId: string;
  targetLocale: "ko" | "en" | "ja";
  displayName: string;
  description: string | null;
  updatedAt: string;
  sourceLanguage: "UNVERIFIED";
}> {
  const wigStyleId = requiredString(wigStyleIdValue, "wigStyleId");
  const targetLocale = localeValue(localeValueInput);
  const style = await db.wigStyle.findUnique({
    where: { id: wigStyleId },
    select: { id: true, name: true, description: true, updatedAt: true },
  });
  if (!style) {
    throw new LocalizedContentException("STYLE_NOT_FOUND", "Wig style was not found.");
  }
  return {
    wigStyleId: style.id,
    targetLocale,
    displayName: style.name,
    description: style.description,
    updatedAt: style.updatedAt.toISOString(),
    sourceLanguage: "UNVERIFIED",
  };
}

export async function submitLocalizedRevision(
  actorUserIdValue: unknown,
  input: SubmitRevisionInput,
): Promise<LocalizedRevisionView> {
  const { intent, submissionKey } = normalizeSubmissionIntent(actorUserIdValue, input);
  const {
    actorUserId,
    wigStyleId,
    locale,
    sourceKind,
    sourceRevisionId,
    legacySourceUpdatedAt,
    claimDisposition,
    displayName,
    description,
  } = intent;

  try {
    return await db.$transaction(async (transaction) => {
      await findRevisionBySubmissionKey(transaction, submissionKey);
      const style = await lockStyle(transaction, wigStyleId);
      const replay = await findRevisionBySubmissionKey(transaction, submissionKey);
      if (replay) return assertSubmissionReplay(replay, intent);

      let frozenDisplayName = displayName;
      let frozenDescription = description;
      let frozenLegacySourceUpdatedAt: Date | null = null;
      if (sourceKind === "LEGACY_IMPORT") {
        if (
          !legacySourceUpdatedAt ||
          style.updatedAt.getTime() !== legacySourceUpdatedAt.getTime()
        ) {
          throw new LocalizedContentException(
            "LEGACY_SOURCE_CHANGED",
            "The legacy source changed after preview; preview it again before importing.",
          );
        }
        frozenDisplayName = requiredString(style.name, "legacy displayName", 200);
        frozenDescription = optionalString(style.description, "legacy description", 5000);
        frozenLegacySourceUpdatedAt = style.updatedAt;
      }

      if (sourceKind === "LOCALIZATION") {
        const source = only(
          await transaction.$queryRaw<Pick<LocalizedRevisionView, "id" | "wigStyleId" | "locale">[]>(
            Prisma.sql`
              SELECT "id", "wigStyleId", "locale"
              FROM "WigStyleLocalizedRevision"
              WHERE "id" = ${sourceRevisionId}
            `,
          ),
        );
        if (!source || source.wigStyleId !== wigStyleId) {
          throw new LocalizedContentException(
            "SOURCE_REVISION_NOT_FOUND",
            "The localization source must be a revision of this style.",
          );
        }
      }

      const id = randomUUID();
      const created = await transaction.$queryRaw<LocalizedRevisionView[]>(Prisma.sql`
        INSERT INTO "WigStyleLocalizedRevision" (
          "id", "wigStyleId", "locale", "displayName", "description", "sourceKind",
          "sourceRevisionId", "legacySourceUpdatedAt", "claimDisposition", "submissionKey",
          "submittedByUserId"
        ) VALUES (
          ${id}, ${wigStyleId}, ${locale}, ${frozenDisplayName}, ${frozenDescription},
          ${sourceKind}::"WigStyleLocalizedRevisionSourceKind", ${sourceRevisionId},
          ${frozenLegacySourceUpdatedAt}, ${claimDisposition}::"WigStyleLocalizedClaimDisposition",
          ${submissionKey}, ${actorUserId}
        )
        RETURNING "id", "wigStyleId", "locale", "displayName", "description", "sourceKind",
                  "sourceRevisionId", "legacySourceUpdatedAt", "claimDisposition", "submissionKey",
                  "submittedByUserId", "submittedAt"
      `);
      const revision = only(created);
      if (!revision) throw new Error("Localized revision insert returned no row.");
      return revision;
    });
  } catch (error) {
    if (!isUniqueConstraintConflict(error, REVISION_SUBMISSION_KEY_CONSTRAINT, "submissionKey")) {
      throw error;
    }
    const replay = await findRevisionBySubmissionKey(db, submissionKey);
    if (!replay) throw error;
    return assertSubmissionReplay(replay, intent);
  }
}

async function findDecisionByRequestKey(
  client: QueryClient,
  requestKey: string,
): Promise<DecisionRow | null> {
  return only(
    await client.$queryRaw<DecisionRow[]>(Prisma.sql`
      SELECT "id", "revisionId", "ordinal", "decision", "rationale", "requestKey",
             "actorUserId", "authorityBasis", "decidedAt"
      FROM "WigStyleLocalizedApprovalDecision"
      WHERE "requestKey" = ${requestKey}
    `),
  );
}

function assertDecisionReplay(
  existing: DecisionRow,
  intent: {
    revisionId: string;
    decision: ApprovalDecision;
    rationale: string | null;
    actorUserId: string;
  },
): ApprovalDecisionView {
  if (
    existing.revisionId !== intent.revisionId ||
    existing.decision !== intent.decision ||
    existing.rationale !== intent.rationale ||
    existing.actorUserId !== intent.actorUserId ||
    existing.authorityBasis !== "PROJECT_OWNER_EDITORIAL_CONFIG"
  ) {
    throw new LocalizedContentException(
      "IDEMPOTENCY_CONFLICT",
      "requestKey was already used for a different approval decision.",
    );
  }
  return existing;
}

function assertApprovalTransition(
  previous: ApprovalDecision | null,
  next: ApprovalDecision,
): void {
  const allowedByState: Record<ApprovalDecision | "PENDING", readonly ApprovalDecision[]> = {
    PENDING: ["APPROVED", "REJECTED"],
    REJECTED: ["APPROVED"],
    APPROVED: ["REVOKED"],
    REVOKED: ["APPROVED"],
  };
  if (!allowedByState[previous ?? "PENDING"].includes(next)) {
    throw new LocalizedContentException(
      "INVALID_STATE_TRANSITION",
      `Approval transition ${previous ?? "PENDING"} -> ${next} is not allowed.`,
    );
  }
}

interface DecisionIntent {
  revisionId: string;
  decision: ApprovalDecision;
  rationale: string | null;
  requestKey: string;
  actorUserId: string;
}

type DecisionRevision = Pick<
  LocalizedRevisionView,
  "id" | "wigStyleId" | "locale" | "claimDisposition"
>;

async function appendDecision(
  transaction: Transaction,
  intent: DecisionIntent,
  ordinal: number,
): Promise<DecisionRow> {
  const id = randomUUID();
  const rows = await transaction.$queryRaw<DecisionRow[]>(Prisma.sql`
    INSERT INTO "WigStyleLocalizedApprovalDecision" (
      "id", "revisionId", "ordinal", "decision", "rationale", "requestKey",
      "actorUserId", "authorityBasis"
    ) VALUES (
      ${id}, ${intent.revisionId}, ${ordinal},
      ${intent.decision}::"WigStyleLocalizedApprovalDecisionType",
      ${intent.rationale}, ${intent.requestKey}, ${intent.actorUserId},
      'PROJECT_OWNER_EDITORIAL_CONFIG'::"WigStyleLocalizedAuthorityBasis"
    )
    RETURNING "id", "revisionId", "ordinal", "decision", "rationale", "requestKey",
              "actorUserId", "authorityBasis", "decidedAt"
  `);
  const created = only(rows);
  if (!created) throw new Error("Localized approval decision insert returned no row.");
  return created;
}

async function enforceCurrentRevocation(
  transaction: Transaction,
  revision: DecisionRevision,
  decision: DecisionRow,
): Promise<void> {
  if (decision.decision !== "REVOKED") return;
  const publication = await readPublication(transaction, revision.wigStyleId, revision.locale);
  if (publication?.currentRevisionId !== revision.id) return;
  const nextVersion = publication.version + 1;
  await transaction.$executeRaw(Prisma.sql`
    UPDATE "WigStyleLocalizedPublication"
    SET "currentRevisionId" = NULL,
        "version" = ${nextVersion},
        "lastChangedByUserId" = ${decision.actorUserId},
        "lastChangedAt" = CURRENT_TIMESTAMP
    WHERE "wigStyleId" = ${revision.wigStyleId} AND "locale" = ${revision.locale}
  `);
  const eventRequestKey = `${AUTO_WITHDRAW_REQUEST_KEY_PREFIX}${decision.id}`;
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "WigStyleLocalizedPublicationEvent" (
      "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
      "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
    ) VALUES (
      ${randomUUID()}, ${revision.wigStyleId}, ${revision.locale}, ${nextVersion},
      'WITHDRAWN'::"WigStyleLocalizedPublicationAction", ${revision.id}, NULL,
      'Approval revoked; publication withdrawn automatically.', ${eventRequestKey},
      ${decision.actorUserId}, 'APPROVAL_REVOCATION_ENFORCEMENT'::"WigStyleLocalizedAuthorityBasis"
    )
  `);
}

async function runDecisionTransaction(
  transaction: Transaction,
  revision: DecisionRevision,
  intent: DecisionIntent,
): Promise<ApprovalDecisionView> {
  await findDecisionByRequestKey(transaction, intent.requestKey);
  await lockStyle(transaction, revision.wigStyleId);
  const replay = await findDecisionByRequestKey(transaction, intent.requestKey);
  if (replay) return assertDecisionReplay(replay, intent);
  const latest = only(
    await transaction.$queryRaw<Pick<DecisionRow, "ordinal" | "decision">[]>(Prisma.sql`
      SELECT "ordinal", "decision"
      FROM "WigStyleLocalizedApprovalDecision"
      WHERE "revisionId" = ${intent.revisionId}
      ORDER BY "ordinal" DESC
      LIMIT 1
    `),
  );
  assertApprovalTransition(latest?.decision ?? null, intent.decision);
  if (intent.decision === "APPROVED" && revision.claimDisposition !== "NON_MATERIAL") {
    throw new LocalizedContentException(
      "MATERIAL_CLAIM",
      "Material or unresolved claims cannot be approved.",
    );
  }
  const created = await appendDecision(transaction, intent, (latest?.ordinal ?? 0) + 1);
  await enforceCurrentRevocation(transaction, revision, created);
  return created;
}

export async function decideLocalizedRevision(
  actorUserIdValue: unknown,
  input: DecideRevisionInput,
): Promise<ApprovalDecisionView> {
  const actorUserId = requiredString(actorUserIdValue, "actorUserId");
  const revisionId = requiredString(input.revisionId, "revisionId");
  const decision = approvalDecisionValue(input.decision);
  const rationale = optionalString(input.rationale, "rationale", 1000);
  const requestKey = requiredString(input.requestKey, "requestKey", 128);
  if (decision !== "APPROVED" && rationale === null) {
    throw new LocalizedContentException(
      "INVALID_INPUT",
      `${decision} decisions require a rationale.`,
    );
  }

  const revision = only(
    await db.$queryRaw<Pick<LocalizedRevisionView, "id" | "wigStyleId" | "locale" | "claimDisposition">[]>(
      Prisma.sql`
        SELECT "id", "wigStyleId", "locale", "claimDisposition"
        FROM "WigStyleLocalizedRevision"
        WHERE "id" = ${revisionId}
      `,
    ),
  );
  if (!revision) {
    throw new LocalizedContentException("REVISION_NOT_FOUND", "Localized revision was not found.");
  }

  const intent = { revisionId, decision, rationale, requestKey, actorUserId };
  try {
    return await db.$transaction((transaction) => runDecisionTransaction(transaction, revision, intent));
  } catch (error) {
    if (!isUniqueConstraintConflict(error, APPROVAL_REQUEST_KEY_CONSTRAINT, "requestKey")) {
      throw error;
    }
    const replay = await findDecisionByRequestKey(db, requestKey);
    if (!replay) throw error;
    return assertDecisionReplay(replay, intent);
  }
}

async function findPublicationEventByRequestKey(
  client: QueryClient,
  requestKey: string,
): Promise<PublicationEventRow | null> {
  return only(
    await client.$queryRaw<PublicationEventRow[]>(Prisma.sql`
      SELECT "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
             "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
      FROM "WigStyleLocalizedPublicationEvent"
      WHERE "requestKey" = ${requestKey}
    `),
  );
}

function publicationEventView(event: PublicationEventRow): PublicationTransitionView {
  return {
    eventId: event.id,
    wigStyleId: event.wigStyleId,
    locale: event.locale,
    action: event.action,
    currentRevisionId: event.toRevisionId,
    version: event.sequence,
  };
}

async function readPublication(
  transaction: Transaction,
  wigStyleId: string,
  locale: string,
): Promise<PublicationRow | null> {
  return only(
    await transaction.$queryRaw<PublicationRow[]>(Prisma.sql`
      SELECT "wigStyleId", "locale", "currentRevisionId", "version"
      FROM "WigStyleLocalizedPublication"
      WHERE "wigStyleId" = ${wigStyleId} AND "locale" = ${locale}
    `),
  );
}

function assertPublicationVersion(actual: number, expected: number, operation: string): void {
  if (actual !== expected) {
    throw new LocalizedContentException(
      "PUBLICATION_CONFLICT",
      `The localized publication changed; reload before ${operation}.`,
    );
  }
}

interface PublishIntent {
  revisionId: string;
  expectedVersion: number;
  requestKey: string;
  actorUserId: string;
}

function compatiblePublishReplay(
  replay: PublicationEventRow,
  intent: PublishIntent,
): PublicationTransitionView {
  if (
    replay.action !== "PUBLISHED" ||
    replay.toRevisionId !== intent.revisionId ||
    replay.actorUserId !== intent.actorUserId ||
    replay.authorityBasis !== "PROJECT_OWNER_PUBLICATION_CONFIG" ||
    replay.sequence - 1 !== intent.expectedVersion
  ) {
    throw new LocalizedContentException(
      "IDEMPOTENCY_CONFLICT",
      "requestKey was already used for a different publication transition.",
    );
  }
  return publicationEventView(replay);
}

async function assertRevisionPublishable(
  transaction: Transaction,
  revision: DecisionRevision,
): Promise<void> {
  if (revision.claimDisposition !== "NON_MATERIAL") {
    throw new LocalizedContentException(
      "MATERIAL_CLAIM",
      "Material or unresolved claims cannot be published.",
    );
  }
  const latest = only(
    await transaction.$queryRaw<Pick<DecisionRow, "decision">[]>(Prisma.sql`
      SELECT "decision"
      FROM "WigStyleLocalizedApprovalDecision"
      WHERE "revisionId" = ${revision.id}
      ORDER BY "ordinal" DESC
      LIMIT 1
    `),
  );
  if (latest?.decision !== "APPROVED") {
    throw new LocalizedContentException(
      "REVISION_NOT_APPROVED",
      "Only a currently approved revision can be published.",
    );
  }
}

async function writePublishedPointer(
  transaction: Transaction,
  revision: DecisionRevision,
  publication: PublicationRow | null,
  nextVersion: number,
  actorUserId: string,
): Promise<void> {
  if (publication) {
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "WigStyleLocalizedPublication"
      SET "currentRevisionId" = ${revision.id}, "version" = ${nextVersion},
          "lastChangedByUserId" = ${actorUserId}, "lastChangedAt" = CURRENT_TIMESTAMP
      WHERE "wigStyleId" = ${revision.wigStyleId} AND "locale" = ${revision.locale}
    `);
    return;
  }
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO "WigStyleLocalizedPublication" (
      "wigStyleId", "locale", "currentRevisionId", "version", "lastChangedByUserId"
    ) VALUES (${revision.wigStyleId}, ${revision.locale}, ${revision.id}, 1, ${actorUserId})
  `);
}

async function appendPublishEvent(
  transaction: Transaction,
  revision: DecisionRevision,
  publication: PublicationRow | null,
  nextVersion: number,
  intent: PublishIntent,
): Promise<PublicationTransitionView> {
  const events = await transaction.$queryRaw<PublicationEventRow[]>(Prisma.sql`
    INSERT INTO "WigStyleLocalizedPublicationEvent" (
      "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
      "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
    ) VALUES (
      ${randomUUID()}, ${revision.wigStyleId}, ${revision.locale}, ${nextVersion},
      'PUBLISHED'::"WigStyleLocalizedPublicationAction", ${publication?.currentRevisionId ?? null},
      ${revision.id}, NULL, ${intent.requestKey}, ${intent.actorUserId},
      'PROJECT_OWNER_PUBLICATION_CONFIG'::"WigStyleLocalizedAuthorityBasis"
    )
    RETURNING "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
              "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
  `);
  const event = only(events);
  if (!event) throw new Error("Localized publication event insert returned no row.");
  return publicationEventView(event);
}

async function runPublishTransaction(
  transaction: Transaction,
  revision: DecisionRevision,
  intent: PublishIntent,
): Promise<PublicationTransitionView> {
  await findPublicationEventByRequestKey(transaction, intent.requestKey);
  await lockStyle(transaction, revision.wigStyleId);
  const replay = await findPublicationEventByRequestKey(transaction, intent.requestKey);
  if (replay) return compatiblePublishReplay(replay, intent);
  const publication = await readPublication(transaction, revision.wigStyleId, revision.locale);
  const currentVersion = publication?.version ?? 0;
  assertPublicationVersion(currentVersion, intent.expectedVersion, "publishing");
  if (publication?.currentRevisionId === revision.id) {
    return {
      eventId: null,
      wigStyleId: revision.wigStyleId,
      locale: revision.locale,
      action: "NO_OP",
      currentRevisionId: revision.id,
      version: currentVersion,
    };
  }
  await assertRevisionPublishable(transaction, revision);
  const nextVersion = currentVersion + 1;
  await writePublishedPointer(transaction, revision, publication, nextVersion, intent.actorUserId);
  return appendPublishEvent(transaction, revision, publication, nextVersion, intent);
}

export async function publishLocalizedRevision(
  actorUserIdValue: unknown,
  input: PublishRevisionInput,
): Promise<PublicationTransitionView> {
  const actorUserId = requiredString(actorUserIdValue, "actorUserId");
  const revisionId = requiredString(input.revisionId, "revisionId");
  const expectedVersion = expectedVersionValue(input.expectedPublicationVersion);
  const requestKey = externalPublicationRequestKey(input.requestKey);
  const revision = only(
    await db.$queryRaw<Pick<LocalizedRevisionView, "id" | "wigStyleId" | "locale" | "claimDisposition">[]>(
      Prisma.sql`
        SELECT "id", "wigStyleId", "locale", "claimDisposition"
        FROM "WigStyleLocalizedRevision"
        WHERE "id" = ${revisionId}
      `,
    ),
  );
  if (!revision) {
    throw new LocalizedContentException("REVISION_NOT_FOUND", "Localized revision was not found.");
  }

  const intent = { revisionId, expectedVersion, requestKey, actorUserId };
  try {
    return await db.$transaction((transaction) => runPublishTransaction(transaction, revision, intent));
  } catch (error) {
    if (!isUniqueConstraintConflict(error, PUBLICATION_REQUEST_KEY_CONSTRAINT, "requestKey")) {
      throw error;
    }
    const replay = await findPublicationEventByRequestKey(db, requestKey);
    if (!replay) throw error;
    return compatiblePublishReplay(replay, intent);
  }
}

interface WithdrawIntent {
  wigStyleId: string;
  locale: "ko" | "en" | "ja";
  expectedVersion: number;
  reason: string;
  requestKey: string;
  actorUserId: string;
}

function compatibleWithdrawReplay(
  replay: PublicationEventRow,
  intent: WithdrawIntent,
): PublicationTransitionView {
  if (
    replay.action !== "WITHDRAWN" ||
    replay.wigStyleId !== intent.wigStyleId ||
    replay.locale !== intent.locale ||
    replay.reason !== intent.reason ||
    replay.actorUserId !== intent.actorUserId ||
    replay.authorityBasis !== "PROJECT_OWNER_PUBLICATION_CONFIG" ||
    replay.sequence - 1 !== intent.expectedVersion
  ) {
    throw new LocalizedContentException(
      "IDEMPOTENCY_CONFLICT",
      "requestKey was already used for a different publication transition.",
    );
  }
  return publicationEventView(replay);
}

async function appendWithdrawalEvent(
  transaction: Transaction,
  publication: PublicationRow,
  nextVersion: number,
  intent: WithdrawIntent,
): Promise<PublicationTransitionView> {
  const events = await transaction.$queryRaw<PublicationEventRow[]>(Prisma.sql`
    INSERT INTO "WigStyleLocalizedPublicationEvent" (
      "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
      "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
    ) VALUES (
      ${randomUUID()}, ${intent.wigStyleId}, ${intent.locale}, ${nextVersion},
      'WITHDRAWN'::"WigStyleLocalizedPublicationAction", ${publication.currentRevisionId},
      NULL, ${intent.reason}, ${intent.requestKey}, ${intent.actorUserId},
      'PROJECT_OWNER_PUBLICATION_CONFIG'::"WigStyleLocalizedAuthorityBasis"
    )
    RETURNING "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
              "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
  `);
  const event = only(events);
  if (!event) throw new Error("Localized withdrawal event insert returned no row.");
  return publicationEventView(event);
}

async function applyWithdrawal(
  transaction: Transaction,
  publication: PublicationRow,
  intent: WithdrawIntent,
): Promise<PublicationTransitionView> {
  const nextVersion = publication.version + 1;
  await transaction.$executeRaw(Prisma.sql`
    UPDATE "WigStyleLocalizedPublication"
    SET "currentRevisionId" = NULL, "version" = ${nextVersion},
        "lastChangedByUserId" = ${intent.actorUserId}, "lastChangedAt" = CURRENT_TIMESTAMP
    WHERE "wigStyleId" = ${intent.wigStyleId} AND "locale" = ${intent.locale}
  `);
  return appendWithdrawalEvent(transaction, publication, nextVersion, intent);
}

async function runWithdrawTransaction(
  transaction: Transaction,
  intent: WithdrawIntent,
): Promise<PublicationTransitionView> {
  await findPublicationEventByRequestKey(transaction, intent.requestKey);
  await lockStyle(transaction, intent.wigStyleId);
  const replay = await findPublicationEventByRequestKey(transaction, intent.requestKey);
  if (replay) return compatibleWithdrawReplay(replay, intent);
  const publication = await readPublication(transaction, intent.wigStyleId, intent.locale);
  const currentVersion = publication?.version ?? 0;
  assertPublicationVersion(currentVersion, intent.expectedVersion, "withdrawing");
  if (!publication?.currentRevisionId) {
    return {
      eventId: null,
      wigStyleId: intent.wigStyleId,
      locale: intent.locale,
      action: "NO_OP",
      currentRevisionId: null,
      version: currentVersion,
    };
  }
  return applyWithdrawal(transaction, publication, intent);
}

export async function withdrawLocalizedPublication(
  actorUserIdValue: unknown,
  input: WithdrawPublicationInput,
): Promise<PublicationTransitionView> {
  const actorUserId = requiredString(actorUserIdValue, "actorUserId");
  const wigStyleId = requiredString(input.wigStyleId, "wigStyleId");
  const locale = localeValue(input.locale);
  const expectedVersion = expectedVersionValue(input.expectedPublicationVersion);
  const reason = requiredString(input.reason, "reason", 1000);
  const requestKey = externalPublicationRequestKey(input.requestKey);

  const intent = { wigStyleId, locale, expectedVersion, reason, requestKey, actorUserId };
  try {
    return await db.$transaction((transaction) => runWithdrawTransaction(transaction, intent));
  } catch (error) {
    if (!isUniqueConstraintConflict(error, PUBLICATION_REQUEST_KEY_CONSTRAINT, "requestKey")) {
      throw error;
    }
    const replay = await findPublicationEventByRequestKey(db, requestKey);
    if (!replay) throw error;
    return compatibleWithdrawReplay(replay, intent);
  }
}
