"use server";

import { requireAdmin } from "@/lib/admin";
import { validateControlPointTessellationSeed } from "@/lib/rendering/benchmark-control-point-tessellation-input";
import {
  readControlPointTessellationSourceProvenance,
  type ControlPointTessellationSourceProvenance,
} from "@/lib/rendering/benchmark-control-point-tessellation-provenance.server";

export type ControlPointTessellationProvenanceActionResult =
  | { readonly success: false; readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | {
      readonly success: true;
      readonly source: ControlPointTessellationSourceProvenance;
      readonly currentMain: boolean;
    };

export async function startControlPointTessellationProvenance(
  seedValue: unknown,
): Promise<ControlPointTessellationProvenanceActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const seed = validateControlPointTessellationSeed(seedValue);
  const provenance = await readControlPointTessellationSourceProvenance(seed);
  return { success: true, ...provenance };
}
