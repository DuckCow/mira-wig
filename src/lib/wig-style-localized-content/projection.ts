import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { ProductContentProvenance } from "@/lib/catalog.types";
import type { Locale } from "@/lib/market/locale";

interface LegacyContentSeed {
  id: string;
  name: string;
  description: string | null;
}

interface PublishedContentRow {
  wigStyleId: string;
  revisionId: string;
  displayName: string;
  description: string | null;
}

export interface ProjectedLocalizedContent {
  wigStyleId: string;
  name: string;
  description: string | null;
  contentProvenance: ProductContentProvenance;
}

export async function projectWigStyleLocalizedContent(
  seeds: readonly LegacyContentSeed[],
  requestedLocale: Locale,
): Promise<Map<string, ProjectedLocalizedContent>> {
  if (seeds.length === 0) return new Map();
  const ids = seeds.map((seed) => seed.id);
  const published = await db.$queryRaw<PublishedContentRow[]>(Prisma.sql`
    SELECT publication."wigStyleId",
           revision."id" AS "revisionId",
           revision."displayName",
           revision."description"
    FROM "WigStyleLocalizedPublication" publication
    INNER JOIN "WigStyleLocalizedRevision" revision
      ON revision."id" = publication."currentRevisionId"
     AND revision."wigStyleId" = publication."wigStyleId"
     AND revision."locale" = publication."locale"
    WHERE publication."locale" = ${requestedLocale}
      AND publication."currentRevisionId" IS NOT NULL
      AND publication."wigStyleId" IN (${Prisma.join(ids)})
  `);
  const publishedByStyle = new Map(published.map((row) => [row.wigStyleId, row]));
  const result = new Map<string, ProjectedLocalizedContent>();
  for (const seed of seeds) {
    const exact = publishedByStyle.get(seed.id);
    if (exact) {
      result.set(seed.id, {
        wigStyleId: seed.id,
        name: exact.displayName,
        description: exact.description,
        contentProvenance: {
          kind: "PUBLISHED_LOCALIZED",
          locale: requestedLocale,
          revisionId: exact.revisionId,
        },
      });
      continue;
    }
    result.set(seed.id, {
      wigStyleId: seed.id,
      name: seed.name,
      description: seed.description,
      contentProvenance: {
        kind: "LEGACY_ORIGINAL",
        requestedLocale,
        sourceLanguage: "UNVERIFIED",
      },
    });
  }
  return result;
}
