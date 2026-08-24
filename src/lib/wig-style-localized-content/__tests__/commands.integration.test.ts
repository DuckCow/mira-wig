import { randomUUID } from "node:crypto";
import { Prisma, UserRole, WigCategory } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getWigStyles } from "@/lib/catalog";
import {
  decideLocalizedRevision,
  previewLegacyLocalizedContent,
  publishLocalizedRevision,
  submitLocalizedRevision,
  withdrawLocalizedPublication,
} from "../commands";
import { projectWigStyleLocalizedContent } from "../projection";

const fixture = {
  authorId: `lpc_author_${randomUUID()}`,
  approverId: `lpc_approver_${randomUUID()}`,
  publisherId: `lpc_publisher_${randomUUID()}`,
};

beforeAll(async () => {
  await db.market.upsert({
    where: { code: "US" },
    update: { currency: "USD", defaultLocale: "en", shippableCountries: ["US"], isActive: true },
    create: { code: "US", currency: "USD", defaultLocale: "en", shippableCountries: ["US"] },
  });
  await Promise.all([
    createUser(fixture.authorId),
    createUser(fixture.approverId),
    createUser(fixture.publisherId),
  ]);
});

describe("localized WigStyle content authority", () => {
  it("normalizes bounded payloads and rejects invalid locale, omitted claims, lineage shape, and DB-invalid rows", async () => {
    const style = await createStyle("validation");
    const normalized = await submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "en",
      displayName: "  Trimmed name  ",
      description: "   ",
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("normalized"),
    });
    expect(normalized).toMatchObject({
      displayName: "Trimmed name",
      description: null,
      legacySourceUpdatedAt: null,
    });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "fr",
      displayName: "French",
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("bad-locale"),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "en",
      displayName: "No claim",
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: undefined,
      submissionKey: key("no-claim"),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "en",
      displayName: "😀".repeat(201),
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("long-name"),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "en",
      displayName: "Name",
      description: "x".repeat(5001),
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("long-description"),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "en",
      displayName: "Bad lineage",
      sourceKind: "MANUAL_AUTHORING",
      sourceRevisionId: normalized.id,
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("manual-source"),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedRevision" (
        "id", "wigStyleId", "locale", "displayName", "sourceKind", "sourceRevisionId",
        "claimDisposition", "submissionKey", "submittedByUserId"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'fr', 'Invalid locale',
        'MANUAL_AUTHORING'::"WigStyleLocalizedRevisionSourceKind", NULL,
        'NON_MATERIAL'::"WigStyleLocalizedClaimDisposition", ${key("raw-locale")}, ${fixture.authorId}
      )
    `)).rejects.toThrow(/locale_check/u);
    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedRevision" (
        "id", "wigStyleId", "locale", "displayName", "sourceKind", "sourceRevisionId",
        "claimDisposition", "submissionKey", "submittedByUserId"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'en', '   ',
        'MANUAL_AUTHORING'::"WigStyleLocalizedRevisionSourceKind", NULL,
        'NON_MATERIAL'::"WigStyleLocalizedClaimDisposition", ${key("raw-blank")}, ${fixture.authorId}
      )
    `)).rejects.toThrow(/nonblank_check/u);
    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedRevision" (
        "id", "wigStyleId", "locale", "displayName", "sourceKind", "sourceRevisionId",
        "claimDisposition", "submissionKey", "submittedByUserId"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'ja', 'Missing source',
        'LOCALIZATION'::"WigStyleLocalizedRevisionSourceKind", NULL,
        'NON_MATERIAL'::"WigStyleLocalizedClaimDisposition", ${key("raw-source")}, ${fixture.authorId}
      )
    `)).rejects.toThrow(/source_check/u);
    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedRevision" (
        "id", "wigStyleId", "locale", "displayName", "sourceKind", "sourceRevisionId",
        "legacySourceUpdatedAt", "claimDisposition", "submissionKey", "submittedByUserId"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'en', 'Manual timestamp',
        'MANUAL_AUTHORING'::"WigStyleLocalizedRevisionSourceKind", NULL, CURRENT_TIMESTAMP,
        'NON_MATERIAL'::"WigStyleLocalizedClaimDisposition", ${key("raw-manual-timestamp")},
        ${fixture.authorId}
      )
    `)).rejects.toThrow(/source_check/u);
    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedRevision" (
        "id", "wigStyleId", "locale", "displayName", "sourceKind", "sourceRevisionId",
        "legacySourceUpdatedAt", "claimDisposition", "submissionKey", "submittedByUserId"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'en', 'Legacy without timestamp',
        'LEGACY_IMPORT'::"WigStyleLocalizedRevisionSourceKind", NULL, NULL,
        'NON_MATERIAL'::"WigStyleLocalizedClaimDisposition", ${key("raw-legacy-no-timestamp")},
        ${fixture.authorId}
      )
    `)).rejects.toThrow(/source_check/u);
    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedRevision" (
        "id", "wigStyleId", "locale", "displayName", "sourceKind", "sourceRevisionId",
        "legacySourceUpdatedAt", "claimDisposition", "submissionKey", "submittedByUserId"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'ja', 'Localized with legacy timestamp',
        'LOCALIZATION'::"WigStyleLocalizedRevisionSourceKind", ${normalized.id}, CURRENT_TIMESTAMP,
        'NON_MATERIAL'::"WigStyleLocalizedClaimDisposition", ${key("raw-localization-timestamp")},
        ${fixture.authorId}
      )
    `)).rejects.toThrow(/source_check/u);
  });

  it("keeps submission pending, projects only exact published locale, versions ABA, and auto-withdraws on revocation", async () => {
    const style = await createStyle("legacy searchable name");
    const revision = await submitManual(style.id, "en", "Published English Name");

    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 0,
      requestKey: key("premature-publish"),
    })).rejects.toMatchObject({ code: "REVISION_NOT_APPROVED" });

    await decideLocalizedRevision(fixture.approverId, {
      revisionId: revision.id,
      decision: "APPROVED",
      requestKey: key("approve"),
    });
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 0,
      requestKey: "lpc:auto-withdraw:ordinary-publish",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(withdrawLocalizedPublication(fixture.publisherId, {
      wigStyleId: style.id,
      locale: "en",
      expectedPublicationVersion: 0,
      reason: "Reserved key rejected before mutation",
      requestKey: "lpc:auto-withdraw:ordinary-withdraw",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const publishKey = key("publish");
    const published = await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 0,
      requestKey: publishKey,
    });
    expect(published).toMatchObject({ action: "PUBLISHED", version: 1, currentRevisionId: revision.id });

    const replay = await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 0,
      requestKey: publishKey,
    });
    expect(replay).toEqual(published);
    const noOp = await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 1,
      requestKey: key("publish-no-op"),
    });
    expect(noOp).toMatchObject({ action: "NO_OP", eventId: null, version: 1 });

    const projections = await projectWigStyleLocalizedContent([
      { id: style.id, name: style.name, description: style.description },
    ], "en");
    expect(projections.get(style.id)).toMatchObject({
      name: "Published English Name",
      contentProvenance: { kind: "PUBLISHED_LOCALIZED", locale: "en", revisionId: revision.id },
    });
    const noCrossLocale = await projectWigStyleLocalizedContent([
      { id: style.id, name: style.name, description: style.description },
    ], "ja");
    expect(noCrossLocale.get(style.id)).toMatchObject({
      name: style.name,
      contentProvenance: {
        kind: "LEGACY_ORIGINAL",
        requestedLocale: "ja",
        sourceLanguage: "UNVERIFIED",
      },
    });

    const withdrawalKey = key("withdraw");
    const withdrawn = await withdrawLocalizedPublication(fixture.publisherId, {
      wigStyleId: style.id,
      locale: "en",
      expectedPublicationVersion: 1,
      reason: "Editorial replacement",
      requestKey: withdrawalKey,
    });
    expect(withdrawn).toMatchObject({ action: "WITHDRAWN", version: 2, currentRevisionId: null });
    await expect(withdrawLocalizedPublication(fixture.publisherId, {
      wigStyleId: style.id,
      locale: "en",
      expectedPublicationVersion: 1,
      reason: "Editorial replacement",
      requestKey: withdrawalKey,
    })).resolves.toEqual(withdrawn);

    await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 2,
      requestKey: key("republish"),
    });
    const revocationKey = key("revoke");
    const revocation = await decideLocalizedRevision(fixture.approverId, {
      revisionId: revision.id,
      decision: "REVOKED",
      rationale: "Approval is no longer valid",
      requestKey: revocationKey,
    });
    const pointer = await db.$queryRaw<Array<{ currentRevisionId: string | null; version: number }>>(Prisma.sql`
      SELECT "currentRevisionId", "version" FROM "WigStyleLocalizedPublication"
      WHERE "wigStyleId" = ${style.id} AND "locale" = 'en'
    `);
    expect(pointer[0]).toEqual({ currentRevisionId: null, version: 4 });
    const autoEvent = await db.$queryRaw<Array<{ authorityBasis: string; action: string; sequence: number }>>(Prisma.sql`
      SELECT "authorityBasis", "action", "sequence" FROM "WigStyleLocalizedPublicationEvent"
      WHERE "wigStyleId" = ${style.id} AND "locale" = 'en' ORDER BY "sequence" DESC LIMIT 1
    `);
    expect(autoEvent[0]).toEqual({
      authorityBasis: "APPROVAL_REVOCATION_ENFORCEMENT",
      action: "WITHDRAWN",
      sequence: 4,
    });
    await expect(decideLocalizedRevision(fixture.approverId, {
      revisionId: revision.id,
      decision: "REVOKED",
      rationale: "Approval is no longer valid",
      requestKey: revocationKey,
    })).resolves.toEqual(revocation);
    const replayPointer = await db.$queryRaw<Array<{ version: number }>>(Prisma.sql`
      SELECT "version" FROM "WigStyleLocalizedPublication"
      WHERE "wigStyleId" = ${style.id} AND "locale" = 'en'
    `);
    expect(replayPointer[0]?.version).toBe(4);
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 1,
      requestKey: key("aba-stale"),
    })).rejects.toMatchObject({ code: "PUBLICATION_CONFLICT" });
  });

  it("reconstructs A-to-B-to-A-to-null history, preserves noncurrent revocation, and rejects stale ABA-B commands", async () => {
    const style = await createStyle("history");
    const revisionA = await submitManual(style.id, "en", "Revision A");
    const revisionB = await submitManual(style.id, "en", "Revision B");
    await Promise.all([revisionA, revisionB].map((revision) => decideLocalizedRevision(fixture.approverId, {
      revisionId: revision.id,
      decision: "APPROVED",
      requestKey: key(`history-approve-${revision.id}`),
    })));
    await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revisionA.id,
      expectedPublicationVersion: 0,
      requestKey: key("history-a1"),
    });
    const noncurrentRevocationKey = key("noncurrent-revoke");
    const noncurrentRevocation = await decideLocalizedRevision(fixture.approverId, {
      revisionId: revisionB.id,
      decision: "REVOKED",
      rationale: "Not current",
      requestKey: noncurrentRevocationKey,
    });
    await expect(decideLocalizedRevision(fixture.approverId, {
      revisionId: revisionB.id,
      decision: "REVOKED",
      rationale: "Not current",
      requestKey: noncurrentRevocationKey,
    })).resolves.toEqual(noncurrentRevocation);
    const afterNoncurrent = await publication(style.id, "en");
    expect(afterNoncurrent).toEqual({ currentRevisionId: revisionA.id, version: 1 });
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: revisionB.id,
      expectedPublicationVersion: 1,
      requestKey: key("publish-revoked"),
    })).rejects.toMatchObject({ code: "REVISION_NOT_APPROVED" });

    await decideLocalizedRevision(fixture.approverId, {
      revisionId: revisionB.id,
      decision: "APPROVED",
      requestKey: key("reapprove-b"),
    });
    const publishBKey = key("history-b2");
    await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revisionB.id,
      expectedPublicationVersion: 1,
      requestKey: publishBKey,
    });
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: revisionA.id,
      expectedPublicationVersion: 1,
      requestKey: publishBKey,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revisionA.id,
      expectedPublicationVersion: 2,
      requestKey: key("history-a3"),
    });
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: revisionB.id,
      expectedPublicationVersion: 1,
      requestKey: key("history-aba-stale"),
    })).rejects.toMatchObject({ code: "PUBLICATION_CONFLICT" });
    await withdrawLocalizedPublication(fixture.publisherId, {
      wigStyleId: style.id,
      locale: "en",
      expectedPublicationVersion: 3,
      reason: "End publication history",
      requestKey: key("history-null4"),
    });
    const nullNoOp = await withdrawLocalizedPublication(fixture.publisherId, {
      wigStyleId: style.id,
      locale: "en",
      expectedPublicationVersion: 4,
      reason: "Already absent",
      requestKey: key("history-null-noop"),
    });
    expect(nullNoOp).toMatchObject({ action: "NO_OP", eventId: null, version: 4 });
    const events = await db.$queryRaw<Array<{
      sequence: number;
      fromRevisionId: string | null;
      toRevisionId: string | null;
    }>>(Prisma.sql`
      SELECT "sequence", "fromRevisionId", "toRevisionId"
      FROM "WigStyleLocalizedPublicationEvent"
      WHERE "wigStyleId" = ${style.id} AND "locale" = 'en'
      ORDER BY "sequence"
    `);
    expect(events).toEqual([
      { sequence: 1, fromRevisionId: null, toRevisionId: revisionA.id },
      { sequence: 2, fromRevisionId: revisionA.id, toRevisionId: revisionB.id },
      { sequence: 3, fromRevisionId: revisionB.id, toRevisionId: revisionA.id },
      { sequence: 4, fromRevisionId: revisionA.id, toRevisionId: null },
    ]);
  });

  it("freezes legacy preview tokens, imports without approval/publication, and does not transfer source approval", async () => {
    const style = await createStyle("등록 원문");
    const preview = await previewLegacyLocalizedContent(style.id, "ko");
    expect(preview.sourceLanguage).toBe("UNVERIFIED");
    await db.wigStyle.update({ where: { id: style.id }, data: { name: "변경된 원문" } });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "ko",
      sourceKind: "LEGACY_IMPORT",
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("stale-legacy"),
      legacyUpdatedAt: preview.updatedAt,
    })).rejects.toMatchObject({ code: "LEGACY_SOURCE_CHANGED" });

    const fresh = await previewLegacyLocalizedContent(style.id, "ko");
    const importKey = key("legacy-import");
    const imported = await submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "ko",
      sourceKind: "LEGACY_IMPORT",
      claimDisposition: "NON_MATERIAL",
      submissionKey: importKey,
      legacyUpdatedAt: fresh.updatedAt,
    });
    expect(imported).toMatchObject({
      displayName: "변경된 원문",
      sourceRevisionId: null,
      legacySourceUpdatedAt: new Date(fresh.updatedAt),
    });
    const exactReplay = await submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "ko",
      sourceKind: "LEGACY_IMPORT",
      claimDisposition: "NON_MATERIAL",
      submissionKey: importKey,
      legacyUpdatedAt: fresh.updatedAt,
    });
    expect(exactReplay.id).toBe(imported.id);

    const changedUpdatedAt = new Date(new Date(fresh.updatedAt).getTime() + 1_000);
    await db.wigStyle.update({
      where: { id: style.id },
      data: { updatedAt: changedUpdatedAt },
    });
    const changedPreview = await previewLegacyLocalizedContent(style.id, "ko");
    expect(changedPreview.displayName).toBe(fresh.displayName);
    expect(changedPreview.description).toBe(fresh.description);
    expect(changedPreview.updatedAt).not.toBe(fresh.updatedAt);
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "ko",
      sourceKind: "LEGACY_IMPORT",
      claimDisposition: "NON_MATERIAL",
      submissionKey: importKey,
      legacyUpdatedAt: changedPreview.updatedAt,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "ko",
      sourceKind: "LEGACY_IMPORT",
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("legacy-stale-fresh-key"),
      legacyUpdatedAt: fresh.updatedAt,
    })).rejects.toMatchObject({ code: "LEGACY_SOURCE_CHANGED" });
    const publicationCount = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT count(*)::bigint AS "count" FROM "WigStyleLocalizedPublication"
      WHERE "wigStyleId" = ${style.id}
    `);
    expect(publicationCount[0]?.count).toBe(BigInt(0));

    await decideLocalizedRevision(fixture.approverId, {
      revisionId: imported.id,
      decision: "APPROVED",
      requestKey: key("approve-import"),
    });
    const localized = await submitLocalizedRevision(fixture.authorId, {
      wigStyleId: style.id,
      locale: "ja",
      displayName: "日本語名",
      description: "日本語説明",
      sourceKind: "LOCALIZATION",
      sourceRevisionId: imported.id,
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("localize"),
    });
    expect(localized.legacySourceUpdatedAt).toBeNull();
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: localized.id,
      expectedPublicationVersion: 0,
      requestKey: key("unapproved-localization"),
    })).rejects.toMatchObject({ code: "REVISION_NOT_APPROVED" });
  });

  it("blocks material claims, invalid state transitions, cross-style localization, and request-key intent changes", async () => {
    const firstStyle = await createStyle("first");
    const secondStyle = await createStyle("second");
    const source = await submitManual(firstStyle.id, "en", "Source");
    const material = await submitManual(firstStyle.id, "ko", "Material", "MATERIAL_OR_UNRESOLVED");
    await expect(decideLocalizedRevision(fixture.approverId, {
      revisionId: material.id,
      decision: "APPROVED",
      requestKey: key("material-approve"),
    })).rejects.toMatchObject({ code: "MATERIAL_CLAIM" });
    await expect(decideLocalizedRevision(fixture.approverId, {
      revisionId: material.id,
      decision: "REJECTED",
      requestKey: key("reject-no-rationale"),
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedApprovalDecision" (
        "id", "revisionId", "ordinal", "decision", "rationale", "requestKey",
        "actorUserId", "authorityBasis"
      ) VALUES (
        ${randomUUID()}, ${material.id}, 1,
        'APPROVED'::"WigStyleLocalizedApprovalDecisionType", NULL, ${key("fixture-material-approval")},
        ${fixture.approverId}, 'PROJECT_OWNER_EDITORIAL_CONFIG'::"WigStyleLocalizedAuthorityBasis"
      )
    `);
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: material.id,
      expectedPublicationVersion: 0,
      requestKey: key("material-publish"),
    })).rejects.toMatchObject({ code: "MATERIAL_CLAIM" });

    const approvalKey = key("approval-replay");
    await decideLocalizedRevision(fixture.approverId, {
      revisionId: source.id,
      decision: "REJECTED",
      rationale: "Needs work",
      requestKey: approvalKey,
    });
    await expect(publishLocalizedRevision(fixture.publisherId, {
      revisionId: source.id,
      expectedPublicationVersion: 0,
      requestKey: key("rejected-publish"),
    })).rejects.toMatchObject({ code: "REVISION_NOT_APPROVED" });
    await expect(decideLocalizedRevision(fixture.approverId, {
      revisionId: source.id,
      decision: "REJECTED",
      rationale: "Different reason",
      requestKey: approvalKey,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(decideLocalizedRevision(fixture.approverId, {
      revisionId: source.id,
      decision: "REVOKED",
      rationale: "Invalid jump",
      requestKey: key("invalid-transition"),
    })).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });

    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: secondStyle.id,
      locale: "ja",
      displayName: "Cross style",
      sourceKind: "LOCALIZATION",
      sourceRevisionId: source.id,
      claimDisposition: "NON_MATERIAL",
      submissionKey: key("cross-style"),
    })).rejects.toMatchObject({ code: "SOURCE_REVISION_NOT_FOUND" });

    const collisionKey = key("submission-collision");
    await submitLocalizedRevision(fixture.authorId, {
      wigStyleId: firstStyle.id,
      locale: "ja",
      displayName: "First intent",
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: collisionKey,
    });
    await expect(submitLocalizedRevision(fixture.authorId, {
      wigStyleId: firstStyle.id,
      locale: "ja",
      displayName: "Second intent",
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: collisionKey,
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("serializes concurrent duplicate submissions and competing publication transitions on the WigStyle root", async () => {
    const style = await createStyle("concurrency");
    const duplicateKey = key("duplicate-submit");
    const input = {
      wigStyleId: style.id,
      locale: "en",
      displayName: "Concurrent same intent",
      sourceKind: "MANUAL_AUTHORING",
      claimDisposition: "NON_MATERIAL",
      submissionKey: duplicateKey,
    } as const;
    const [left, right] = await Promise.all([
      submitLocalizedRevision(fixture.authorId, input),
      submitLocalizedRevision(fixture.authorId, input),
    ]);
    expect(left.id).toBe(right.id);

    const approvalKey = key("duplicate-approval");
    const [approvalLeft, approvalRight] = await Promise.all([
      decideLocalizedRevision(fixture.approverId, {
        revisionId: left.id,
        decision: "APPROVED",
        requestKey: approvalKey,
      }),
      decideLocalizedRevision(fixture.approverId, {
        revisionId: left.id,
        decision: "APPROVED",
        requestKey: approvalKey,
      }),
    ]);
    expect(approvalLeft.id).toBe(approvalRight.id);

    const other = await submitManual(style.id, "en", "Competing revision");
    await decideLocalizedRevision(fixture.approverId, {
      revisionId: other.id,
      decision: "APPROVED",
      requestKey: key(`approve-${other.id}`),
    });
    const duplicatePublishKey = key("duplicate-publish");
    const [publishLeft, publishRight] = await Promise.all([
      publishLocalizedRevision(fixture.publisherId, {
        revisionId: left.id,
        expectedPublicationVersion: 0,
        requestKey: duplicatePublishKey,
      }),
      publishLocalizedRevision(fixture.publisherId, {
        revisionId: left.id,
        expectedPublicationVersion: 0,
        requestKey: duplicatePublishKey,
      }),
    ]);
    expect(publishLeft).toEqual(publishRight);
    await withdrawLocalizedPublication(fixture.publisherId, {
      wigStyleId: style.id,
      locale: "en",
      expectedPublicationVersion: 1,
      reason: "Prepare competing transitions",
      requestKey: key("competing-reset"),
    });
    const settled = await Promise.allSettled([
      publishLocalizedRevision(fixture.publisherId, {
        revisionId: left.id,
        expectedPublicationVersion: 2,
        requestKey: key("concurrent-publish-left"),
      }),
      publishLocalizedRevision(fixture.publisherId, {
        revisionId: other.id,
        expectedPublicationVersion: 2,
        requestKey: key("concurrent-publish-right"),
      }),
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = settled.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({ reason: { code: "PUBLICATION_CONFLICT" } });
  });

  it("recovers globally unique request-key races across different WigStyles", async () => {
    const submissionStyleA = await createStyle("global submission A");
    const submissionStyleB = await createStyle("global submission B");
    const submissionKey = key("cross-style-submission");
    const submissionResults = await Promise.allSettled([
      submitLocalizedRevision(fixture.authorId, {
        wigStyleId: submissionStyleA.id,
        locale: "en",
        displayName: "Submission A",
        sourceKind: "MANUAL_AUTHORING",
        claimDisposition: "NON_MATERIAL",
        submissionKey,
      }),
      submitLocalizedRevision(fixture.authorId, {
        wigStyleId: submissionStyleB.id,
        locale: "ja",
        displayName: "Submission B",
        sourceKind: "MANUAL_AUTHORING",
        claimDisposition: "NON_MATERIAL",
        submissionKey,
      }),
    ]);
    expectOneWinnerAndIdempotencyConflict(submissionResults);
    const revisionsWithKey = await db.$queryRaw<Array<{ wigStyleId: string }>>(Prisma.sql`
      SELECT "wigStyleId" FROM "WigStyleLocalizedRevision" WHERE "submissionKey" = ${submissionKey}
    `);
    expect(revisionsWithKey).toHaveLength(1);

    const approvalStyleA = await createStyle("global approval A");
    const approvalStyleB = await createStyle("global approval B");
    const approvalRevisionA = await submitManual(approvalStyleA.id, "en", "Approval A");
    const approvalRevisionB = await submitManual(approvalStyleB.id, "ja", "Approval B");
    const approvalKey = key("cross-style-approval");
    const approvalResults = await Promise.allSettled([
      decideLocalizedRevision(fixture.approverId, {
        revisionId: approvalRevisionA.id,
        decision: "APPROVED",
        requestKey: approvalKey,
      }),
      decideLocalizedRevision(fixture.approverId, {
        revisionId: approvalRevisionB.id,
        decision: "REJECTED",
        rationale: "Different concurrent intent",
        requestKey: approvalKey,
      }),
    ]);
    expectOneWinnerAndIdempotencyConflict(approvalResults);
    const decisionsWithKey = await db.$queryRaw<Array<{ revisionId: string }>>(Prisma.sql`
      SELECT "revisionId" FROM "WigStyleLocalizedApprovalDecision" WHERE "requestKey" = ${approvalKey}
    `);
    expect(decisionsWithKey).toHaveLength(1);

    const publicationStyleA = await createStyle("global publication A");
    const publicationStyleB = await createStyle("global publication B");
    const publicationRevisionA = await submitManual(publicationStyleA.id, "en", "Publication A");
    const publicationRevisionB = await submitManual(publicationStyleB.id, "ja", "Publication B");
    await Promise.all([publicationRevisionA, publicationRevisionB].map((revision) => (
      decideLocalizedRevision(fixture.approverId, {
        revisionId: revision.id,
        decision: "APPROVED",
        requestKey: key(`cross-style-publish-approve-${revision.id}`),
      })
    )));
    const publicationKey = key("cross-style-publication");
    const publicationResults = await Promise.allSettled([
      publishLocalizedRevision(fixture.publisherId, {
        revisionId: publicationRevisionA.id,
        expectedPublicationVersion: 0,
        requestKey: publicationKey,
      }),
      publishLocalizedRevision(fixture.publisherId, {
        revisionId: publicationRevisionB.id,
        expectedPublicationVersion: 0,
        requestKey: publicationKey,
      }),
    ]);
    expectOneWinnerAndIdempotencyConflict(publicationResults);
    const eventsWithKey = await db.$queryRaw<Array<{ wigStyleId: string }>>(Prisma.sql`
      SELECT "wigStyleId" FROM "WigStyleLocalizedPublicationEvent" WHERE "requestKey" = ${publicationKey}
    `);
    expect(eventsWithKey).toHaveLength(1);
  });

  it("keeps search authority on legacy name/tags while projecting the localized display name", async () => {
    const style = await createStyle("legacy-search-token", true);
    const revision = await submitManual(style.id, "en", "localized-display-token");
    await decideLocalizedRevision(fixture.approverId, {
      revisionId: revision.id,
      decision: "APPROVED",
      requestKey: key("search-approve"),
    });
    await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 0,
      requestKey: key("search-publish"),
    });

    const legacySearch = await getWigStyles({ query: "legacy-search-token" }, "US", "en");
    expect(legacySearch.find((item) => item.id === style.id)?.name).toBe("localized-display-token");
    const localizedSearch = await getWigStyles({ query: "localized-display-token" }, "US", "en");
    expect(localizedSearch.some((item) => item.id === style.id)).toBe(false);
  });

  it("enforces append-only records and scope-safe publication references in PostgreSQL", async () => {
    const style = await createStyle("db-constraints");
    const otherStyle = await createStyle("db-constraints-other");
    const revision = await submitManual(style.id, "en", "Immutable");
    const otherRevision = await submitManual(otherStyle.id, "en", "Other");
    const decision = await decideLocalizedRevision(fixture.approverId, {
      revisionId: revision.id,
      decision: "APPROVED",
      requestKey: key("immutable-approval"),
    });
    const event = await publishLocalizedRevision(fixture.publisherId, {
      revisionId: revision.id,
      expectedPublicationVersion: 0,
      requestKey: key("immutable-event"),
    });

    await expect(db.$executeRaw(Prisma.sql`
      UPDATE "WigStyleLocalizedRevision" SET "displayName" = 'mutated' WHERE "id" = ${revision.id}
    `)).rejects.toThrow(/immutable/u);
    await expect(db.$executeRaw(Prisma.sql`
      DELETE FROM "WigStyleLocalizedRevision" WHERE "id" = ${revision.id}
    `)).rejects.toThrow(/immutable/u);
    await expect(db.$executeRaw(Prisma.sql`
      UPDATE "WigStyleLocalizedApprovalDecision" SET "rationale" = 'mutated' WHERE "id" = ${decision.id}
    `)).rejects.toThrow(/immutable/u);
    await expect(db.$executeRaw(Prisma.sql`
      DELETE FROM "WigStyleLocalizedApprovalDecision" WHERE "id" = ${decision.id}
    `)).rejects.toThrow(/immutable/u);
    await expect(db.$executeRaw(Prisma.sql`
      UPDATE "WigStyleLocalizedPublicationEvent" SET "reason" = 'mutated' WHERE "id" = ${event.eventId}
    `)).rejects.toThrow(/immutable/u);
    await expect(db.$executeRaw(Prisma.sql`
      DELETE FROM "WigStyleLocalizedPublicationEvent" WHERE "id" = ${event.eventId}
    `)).rejects.toThrow(/immutable/u);
    await expect(db.$executeRaw(Prisma.sql`
      UPDATE "WigStyleLocalizedPublication"
      SET "currentRevisionId" = ${otherRevision.id}
      WHERE "wigStyleId" = ${style.id} AND "locale" = 'en'
    `)).rejects.toThrow(/foreign key/u);
    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedPublicationEvent" (
        "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
        "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'en', 2,
        'WITHDRAWN'::"WigStyleLocalizedPublicationAction", ${revision.id}, NULL,
        'Reserved namespace is not publisher-owned', 'lpc:auto-withdraw:publisher-owned',
        ${fixture.publisherId}, 'PROJECT_OWNER_PUBLICATION_CONFIG'::"WigStyleLocalizedAuthorityBasis"
      )
    `)).rejects.toThrow(/request_namespace_check/u);
    await expect(db.$executeRaw(Prisma.sql`
      INSERT INTO "WigStyleLocalizedPublicationEvent" (
        "id", "wigStyleId", "locale", "sequence", "action", "fromRevisionId",
        "toRevisionId", "reason", "requestKey", "actorUserId", "authorityBasis"
      ) VALUES (
        ${randomUUID()}, ${style.id}, 'en', 2,
        'WITHDRAWN'::"WigStyleLocalizedPublicationAction", ${revision.id}, NULL,
        'Enforcement requires its reserved namespace', ${key("ordinary-enforcement")},
        ${fixture.approverId}, 'APPROVAL_REVOCATION_ENFORCEMENT'::"WigStyleLocalizedAuthorityBasis"
      )
    `)).rejects.toThrow(/request_namespace_check/u);
  });
});

async function publication(wigStyleId: string, locale: string) {
  const rows = await db.$queryRaw<Array<{ currentRevisionId: string | null; version: number }>>(Prisma.sql`
    SELECT "currentRevisionId", "version" FROM "WigStyleLocalizedPublication"
    WHERE "wigStyleId" = ${wigStyleId} AND "locale" = ${locale}
  `);
  return rows[0] ?? null;
}

function key(label: string): string {
  return `${label}-${randomUUID()}`;
}

function expectOneWinnerAndIdempotencyConflict<T>(
  results: readonly PromiseSettledResult<T>[],
): void {
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejection = results.find((result) => result.status === "rejected");
  expect(rejection).toMatchObject({ reason: { code: "IDEMPOTENCY_CONFLICT" } });
}

async function createUser(id: string): Promise<void> {
  await db.user.create({
    data: { id, email: `${id}@example.invalid`, name: id, role: UserRole.ADMIN },
  });
}

async function createStyle(name: string, publicInUs = false) {
  return db.wigStyle.create({
    data: {
      name,
      description: `${name} legacy description`,
      category: WigCategory.FASHION,
      tags: [],
      imageKeys: [],
      availableMarkets: publicInUs ? { create: { marketCode: "US", isActive: true } } : undefined,
      variants: publicInUs ? {
        create: {
          color: "Black",
          length: "Medium",
          curl: "Straight",
          price: 2999,
          stock: 1,
          sku: `LPC-${randomUUID()}`,
          marketPrices: { create: { marketCode: "US", amount: 2999 } },
        },
      } : undefined,
    },
    select: { id: true, name: true, description: true },
  });
}

async function submitManual(
  wigStyleId: string,
  locale: "ko" | "en" | "ja",
  displayName: string,
  claimDisposition: "NON_MATERIAL" | "MATERIAL_OR_UNRESOLVED" = "NON_MATERIAL",
) {
  return submitLocalizedRevision(fixture.authorId, {
    wigStyleId,
    locale,
    displayName,
    description: `${displayName} description`,
    sourceKind: "MANUAL_AUTHORING",
    claimDisposition,
    submissionKey: key("submit"),
  });
}
