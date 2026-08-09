"use server";

import { requireAdmin } from "@/lib/admin";
import { validateRendererBenchmarkSeed } from "@/lib/rendering/benchmark-input";
import {
  readBenchmarkSourceProvenance,
  type BenchmarkSourceProvenance,
} from "@/lib/rendering/benchmark-provenance.server";

export type BenchmarkProvenanceActionResult =
  | { readonly success: false; readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | {
      readonly success: true;
      readonly source: BenchmarkSourceProvenance;
      readonly currentMain: boolean;
    };

export async function startBenchmarkProvenance(
  seedValue: unknown,
): Promise<BenchmarkProvenanceActionResult> {
  const guard = await requireAdmin();
  if (!guard.success) return guard;
  const seed = validateRendererBenchmarkSeed(seedValue);
  const provenance = await readBenchmarkSourceProvenance(seed);
  return { success: true, ...provenance };
}
