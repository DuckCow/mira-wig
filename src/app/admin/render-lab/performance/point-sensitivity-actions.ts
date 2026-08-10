"use server";

import { requireAdmin } from "@/lib/admin";
import { validatePointSensitivitySeed } from "@/lib/rendering/benchmark-point-sensitivity-input";
import {
  readPointSensitivitySourceProvenance,
  type PointSensitivitySourceProvenance,
} from "@/lib/rendering/benchmark-point-sensitivity-provenance.server";

export type PointSensitivityProvenanceActionResult =
  | { readonly success: false; readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | {
      readonly success: true;
      readonly source: PointSensitivitySourceProvenance;
      readonly currentMain: boolean;
    };

export async function startPointSensitivityProvenance(
  seedValue: unknown,
): Promise<PointSensitivityProvenanceActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const seed = validatePointSensitivitySeed(seedValue);
  const provenance = await readPointSensitivitySourceProvenance(seed);
  return { success: true, ...provenance };
}
