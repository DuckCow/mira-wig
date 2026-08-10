import "server-only";

import {
  CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
  CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE,
  CONTROL_POINT_TESSELLATION_SEED,
  validateControlPointTessellationSeed,
} from "./benchmark-control-point-tessellation-input";
import {
  readBenchmarkSourceProvenance,
  type BenchmarkSourceTreeState,
} from "./benchmark-provenance.server";

export interface ControlPointTessellationSourceProvenance {
  readonly kind: "LOCAL_GIT";
  readonly commit: string;
  readonly branch: string;
  readonly treeState: BenchmarkSourceTreeState;
  readonly observedAt: string;
  readonly nextVersion: string;
  readonly threeVersion: string;
  readonly generatorVersion: typeof CONTROL_POINT_TESSELLATION_GENERATOR_VERSION;
  readonly geometryRecipe: typeof CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE;
  readonly seed: typeof CONTROL_POINT_TESSELLATION_SEED;
}

export interface ControlPointTessellationRunStartProvenance {
  readonly source: ControlPointTessellationSourceProvenance;
  readonly currentMain: boolean;
}

export async function readControlPointTessellationSourceProvenance(
  seedValue: unknown,
): Promise<ControlPointTessellationRunStartProvenance> {
  const seed = validateControlPointTessellationSeed(seedValue);
  const parent = await readBenchmarkSourceProvenance(seed);
  return Object.freeze({
    source: Object.freeze({
      kind: parent.source.kind,
      commit: parent.source.commit,
      branch: parent.source.branch,
      treeState: parent.source.treeState,
      observedAt: parent.source.observedAt,
      nextVersion: parent.source.nextVersion,
      threeVersion: parent.source.threeVersion,
      generatorVersion: CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
      geometryRecipe: CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE,
      seed: parent.source.seed,
    }),
    currentMain: parent.currentMain,
  });
}
