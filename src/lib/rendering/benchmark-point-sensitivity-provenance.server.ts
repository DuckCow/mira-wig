import "server-only";

import {
  POINT_SENSITIVITY_GENERATOR_VERSION,
  POINT_SENSITIVITY_GEOMETRY_RECIPE,
  POINT_SENSITIVITY_SEED,
  validatePointSensitivitySeed,
} from "./benchmark-point-sensitivity-input";
import {
  readBenchmarkSourceProvenance,
  type BenchmarkSourceTreeState,
} from "./benchmark-provenance.server";

export interface PointSensitivitySourceProvenance {
  readonly kind: "LOCAL_GIT";
  readonly commit: string;
  readonly branch: string;
  readonly treeState: BenchmarkSourceTreeState;
  readonly observedAt: string;
  readonly nextVersion: string;
  readonly threeVersion: string;
  readonly generatorVersion: typeof POINT_SENSITIVITY_GENERATOR_VERSION;
  readonly geometryRecipe: typeof POINT_SENSITIVITY_GEOMETRY_RECIPE;
  readonly seed: typeof POINT_SENSITIVITY_SEED;
}

export interface PointSensitivityRunStartProvenance {
  readonly source: PointSensitivitySourceProvenance;
  readonly currentMain: boolean;
}

export async function readPointSensitivitySourceProvenance(
  seedValue: unknown,
): Promise<PointSensitivityRunStartProvenance> {
  const seed = validatePointSensitivitySeed(seedValue);
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
      generatorVersion: POINT_SENSITIVITY_GENERATOR_VERSION,
      geometryRecipe: parent.source.geometryRecipe,
      seed: parent.source.seed,
    }),
    currentMain: parent.currentMain,
  });
}
