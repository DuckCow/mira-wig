import {
  POINT_SENSITIVITY_GENERATOR_VERSION,
  POINT_SENSITIVITY_SEED,
  constructPointSensitivityCandidate,
  validatePointSensitivityInput,
  validatePointSensitivitySeed,
  type PointSensitivityInput,
  type PointSensitivityPointsPerStrand,
  type PointSensitivityStrandCount,
} from "./benchmark-point-sensitivity-input";
import type { PointSensitivityRunStartProvenance } from "./benchmark-point-sensitivity-provenance.server";
import {
  EMPTY_POINT_SENSITIVITY_ANALYSIS,
  POINT_SENSITIVITY_CELL_ORDER,
  POINT_SENSITIVITY_EXPERIMENT,
  POINT_SENSITIVITY_MEASUREMENT_CONTRACT,
  POINT_SENSITIVITY_RADIAL_SEGMENTS,
  POINT_SENSITIVITY_RESULT_SCHEMA,
  POINT_SENSITIVITY_TUBE_SEGMENTS_PER_SPAN,
  createPointSensitivityAnalysis,
  pointSensitivityComplexity,
  pointSensitivitySessionConfiguration,
  validatePointSensitivityResult,
  type PointSensitivityAnalysis,
  type PointSensitivityCellResult,
  type PointSensitivityResult,
  type PointSensitivityWarning,
} from "./benchmark-point-sensitivity-result";
import {
  benchmarkCoreAutoBackend,
  benchmarkCoreFirstProfileStopReason,
  benchmarkCoreSessionStopReason,
  buildBenchmarkCoreEnvironment,
  createBenchmarkCoreSession,
  executeBenchmarkCoreCell,
  recordBenchmarkCoreFailure,
  type BenchmarkCoreExecutionDependencies,
} from "./benchmark-runner-core";
import { benchmarkTerminalOutcome, type BenchmarkOperatorDeclaration, type BenchmarkStopReason } from "./benchmark-result";
import type { VisualState } from "./visual-state";

const FIXED_VISUAL_STATE: VisualState = {
  previewColor: "#34251F",
  visualDensityTier: "HIGH",
  viewRotation: { yaw: 0, pitch: 0 },
};

export interface PointSensitivityExecutionRequest {
  readonly operator: BenchmarkOperatorDeclaration;
  readonly seed: number;
}

export type PointSensitivityProvenanceReader = (seed: number) => Promise<
  | { readonly success: false; readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | ({ readonly success: true } & PointSensitivityRunStartProvenance)
>;

export interface PointSensitivityExecutionDependencies
  extends BenchmarkCoreExecutionDependencies<PointSensitivityInput> {
  readonly readProvenance: PointSensitivityProvenanceReader;
}

function validateControlledOperator(operator: BenchmarkOperatorDeclaration): void {
  if (!Number.isSafeInteger(operator.browserMajor) || operator.browserMajor < 0) {
    throw new Error("operator.browserMajor must be a nonnegative integer.");
  }
  if (
    operator.browserEngine !== "CHROMIUM_FAMILY" ||
    operator.osFamily !== "MACOS" ||
    operator.architecture !== "ARM64" ||
    operator.deviceClass !== "PRIMARY_REFERENCE" ||
    operator.powerMode !== "AC_POWER" ||
    operator.lowPowerState !== "OFF"
  ) {
    throw new Error("S1_CONTROLLED_ENVIRONMENT_REQUIRED");
  }
}

function inputCallbacks(
  strandCount: PointSensitivityStrandCount,
  pointsPerStrand: PointSensitivityPointsPerStrand,
) {
  return {
    constructCandidate: () => constructPointSensitivityCandidate({
      seed: POINT_SENSITIVITY_SEED,
      strandCount,
      pointsPerStrand,
    }),
    validateCandidate: validatePointSensitivityInput,
  };
}

function warning(actualBackend: ReturnType<typeof benchmarkCoreAutoBackend>): readonly PointSensitivityWarning[] {
  return actualBackend === "WEBGL2" ? ["AUTO_DID_NOT_SELECT_WEBGPU"] : [];
}

type PointSensitivitySession = ReturnType<
  typeof createBenchmarkCoreSession<PointSensitivityInput>
>;

async function readAdmittedProvenance(
  seed: number,
  dependencies: PointSensitivityExecutionDependencies,
) {
  const provenance = await dependencies.readProvenance(seed);
  if (!provenance.success) throw new Error("AUTHORIZATION_LOST");
  if (provenance.source.treeState !== "CLEAN") throw new Error("SOURCE_TREE_DIRTY");
  if (!provenance.currentMain) throw new Error("SOURCE_NOT_CURRENT_MAIN");
  return provenance.source;
}

async function executeCells(
  session: PointSensitivitySession,
): Promise<readonly PointSensitivityCellResult[]> {
  const cells: PointSensitivityCellResult[] = [];
  for (const scheduled of POINT_SENSITIVITY_CELL_ORDER) {
    if (benchmarkCoreSessionStopReason(session) !== null) break;
    try {
      const coreCell = await executeBenchmarkCoreCell(
        "AUTO",
        5,
        inputCallbacks(scheduled.strandCount, scheduled.pointsPerStrand),
        FIXED_VISUAL_STATE,
        session,
      );
      const complexity = pointSensitivityComplexity(scheduled.pointsPerStrand);
      cells.push({
        strandCount: scheduled.strandCount,
        pointsPerStrand: scheduled.pointsPerStrand,
        ...complexity,
        tubeSegmentsPerControlSpan: POINT_SENSITIVITY_TUBE_SEGMENTS_PER_SPAN,
        radialSegments: POINT_SENSITIVITY_RADIAL_SEGMENTS,
        ...coreCell,
        requestedBackend: "AUTO",
      });
      if (coreCell.cellOutcome !== "COMPLETE") break;
    } catch (error) {
      recordBenchmarkCoreFailure(session, error);
      break;
    }
  }
  return cells;
}

interface AnalysisOutcome {
  readonly analysis: PointSensitivityAnalysis;
  readonly instrumentationFailure: boolean;
}

function analysisForCells(cells: readonly PointSensitivityCellResult[]): AnalysisOutcome {
  const complete = cells.length === 6 &&
    cells.every((cell) => cell.cellOutcome === "COMPLETE");
  if (!complete) {
    return { analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS, instrumentationFailure: false };
  }
  try {
    return { analysis: createPointSensitivityAnalysis(cells), instrumentationFailure: false };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "INSTRUMENTATION_FAILURE") throw error;
    return { analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS, instrumentationFailure: true };
  }
}

function executionStopReason(
  cells: readonly PointSensitivityCellResult[],
  analysisOutcome: AnalysisOutcome,
  session: PointSensitivitySession,
): BenchmarkStopReason {
  if (analysisOutcome.instrumentationFailure) return "INSTRUMENTATION_FAILURE";
  const complete = cells.length === 6 &&
    cells.every((cell) => cell.cellOutcome === "COMPLETE");
  if (complete) return "NONE";
  return benchmarkCoreSessionStopReason(session) ??
    benchmarkCoreFirstProfileStopReason(session) ??
    cells.at(-1)?.cellStopReason ??
    "BACKEND_PROFILE_FAILURE";
}

export async function executePointSensitivityBenchmark(
  request: PointSensitivityExecutionRequest,
  dependencies: PointSensitivityExecutionDependencies,
): Promise<PointSensitivityResult> {
  validatePointSensitivitySeed(request.seed);
  validateControlledOperator(request.operator);
  const source = await readAdmittedProvenance(request.seed, dependencies);
  const session = createBenchmarkCoreSession<PointSensitivityInput>(dependencies);
  const cells = await executeCells(session);
  const analysisOutcome = analysisForCells(cells);
  const stopReason = executionStopReason(cells, analysisOutcome, session);
  const result: PointSensitivityResult = {
    schema: POINT_SENSITIVITY_RESULT_SCHEMA,
    version: 1,
    experiment: POINT_SENSITIVITY_EXPERIMENT,
    measurementContract: POINT_SENSITIVITY_MEASUREMENT_CONTRACT,
    generatorVersion: POINT_SENSITIVITY_GENERATOR_VERSION,
    classification: "BENCHMARK_ONLY",
    source,
    environment: buildBenchmarkCoreEnvironment(request.operator, session),
    sessionConfiguration: pointSensitivitySessionConfiguration(),
    cells,
    analysis: analysisOutcome.analysis,
    outcome: stopReason === "NONE" ? "COMPLETE" : benchmarkTerminalOutcome(stopReason),
    stopReason,
    warnings: warning(benchmarkCoreAutoBackend(session)),
  };
  return validatePointSensitivityResult(result);
}
