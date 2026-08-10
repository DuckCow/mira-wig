import {
  admitControlPointTessellationBrowser,
  captureRawBrowserVersionEvidence,
  type AdmittedControlPointTessellationBrowser,
  type RawBrowserVersionEvidence,
} from "./benchmark-control-point-tessellation-browser-admission";
import {
  CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
  CONTROL_POINT_TESSELLATION_SEED,
  constructControlPointTessellationCandidate,
  validateControlPointTessellationInput,
  validateControlPointTessellationSeed,
  type ControlPointTessellationInput,
  type ControlPointTessellationPointsPerStrand,
  type ControlPointTessellationStrandCount,
  type ControlPointTessellationTubularSegments,
} from "./benchmark-control-point-tessellation-input";
import type { ControlPointTessellationRunStartProvenance } from "./benchmark-control-point-tessellation-provenance.server";
import {
  EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS,
  createControlPointTessellationAnalysis,
  type ControlPointTessellationAnalysis,
} from "./benchmark-control-point-tessellation-analysis";
import {
  CONTROL_POINT_TESSELLATION_CELL_ORDER,
  CONTROL_POINT_TESSELLATION_EXPERIMENT,
  CONTROL_POINT_TESSELLATION_MEASUREMENT_CONTRACT,
  CONTROL_POINT_TESSELLATION_RADIAL_SEGMENTS,
  CONTROL_POINT_TESSELLATION_RESULT_SCHEMA,
  controlPointTessellationComplexity,
  controlPointTessellationSessionConfiguration,
  validateControlPointTessellationResult,
  type ControlPointTessellationCellResult,
  type ControlPointTessellationEnvironment,
  type ControlPointTessellationOperatorDeclaration,
  type ControlPointTessellationResult,
  type ControlPointTessellationWarning,
} from "./benchmark-control-point-tessellation-result";
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
import {
  benchmarkTerminalOutcome,
  type BenchmarkOperatorDeclaration,
  type BenchmarkStopReason,
} from "./benchmark-result";
import type { VisualState } from "./visual-state";

const FIXED_VISUAL_STATE: VisualState = {
  previewColor: "#34251F",
  visualDensityTier: "HIGH",
  viewRotation: { yaw: 0, pitch: 0 },
};

export interface ControlPointTessellationExecutionRequest {
  readonly operator: ControlPointTessellationOperatorDeclaration;
  readonly seed: number;
}

export type ControlPointTessellationProvenanceReader = (seed: number) => Promise<
  | { readonly success: false; readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | ({ readonly success: true } & ControlPointTessellationRunStartProvenance)
>;

export interface ControlPointTessellationProgress {
  readonly completedCells: number;
  readonly totalCells: 8;
  readonly currentCell: typeof CONTROL_POINT_TESSELLATION_CELL_ORDER[number] | null;
}

export interface ControlPointTessellationExecutionDependencies
  extends BenchmarkCoreExecutionDependencies<ControlPointTessellationInput> {
  readonly readProvenance: ControlPointTessellationProvenanceReader;
  readonly captureBrowserVersionEvidence?: () => RawBrowserVersionEvidence;
  readonly onProgress?: (progress: ControlPointTessellationProgress) => void;
}

function controlledCoreOperator(
  operator: ControlPointTessellationOperatorDeclaration,
): BenchmarkOperatorDeclaration {
  if (!Number.isSafeInteger(operator.declaredBrowserMajor) ||
      operator.declaredBrowserMajor <= 0 ||
      operator.browserEngine !== "CHROMIUM_FAMILY" ||
      operator.osFamily !== "MACOS" || operator.architecture !== "ARM64" ||
      operator.deviceClass !== "PRIMARY_REFERENCE" ||
      operator.powerMode !== "AC_POWER" || operator.lowPowerState !== "OFF") {
    throw new Error("S2_CONTROLLED_ENVIRONMENT_REQUIRED");
  }
  return {
    browserEngine: "CHROMIUM_FAMILY",
    browserMajor: operator.declaredBrowserMajor,
    osFamily: "MACOS",
    architecture: "ARM64",
    deviceClass: "PRIMARY_REFERENCE",
    powerMode: "AC_POWER",
    lowPowerState: "OFF",
  };
}

function inputCallbacks(
  strandCount: ControlPointTessellationStrandCount,
  pointsPerStrand: ControlPointTessellationPointsPerStrand,
  tubularSegments: ControlPointTessellationTubularSegments,
) {
  return {
    constructCandidate: () => constructControlPointTessellationCandidate({
      seed: CONTROL_POINT_TESSELLATION_SEED,
      strandCount,
      pointsPerStrand,
      tubularSegments,
    }),
    validateCandidate: validateControlPointTessellationInput,
  };
}

type ControlPointTessellationSession = ReturnType<
  typeof createBenchmarkCoreSession<ControlPointTessellationInput>
>;

async function readAdmittedProvenance(
  seed: number,
  dependencies: ControlPointTessellationExecutionDependencies,
) {
  const provenance = await dependencies.readProvenance(seed);
  if (!provenance.success) throw new Error("AUTHORIZATION_LOST");
  if (provenance.source.treeState !== "CLEAN") throw new Error("SOURCE_TREE_DIRTY");
  if (!provenance.currentMain) throw new Error("SOURCE_NOT_CURRENT_MAIN");
  return provenance.source;
}

async function executeCells(
  session: ControlPointTessellationSession,
  dependencies: ControlPointTessellationExecutionDependencies,
): Promise<readonly ControlPointTessellationCellResult[]> {
  const cells: ControlPointTessellationCellResult[] = [];
  dependencies.onProgress?.(Object.freeze({
    completedCells: 0,
    totalCells: 8,
    currentCell: null,
  }));
  for (const scheduled of CONTROL_POINT_TESSELLATION_CELL_ORDER) {
    if (benchmarkCoreSessionStopReason(session) !== null) break;
    dependencies.onProgress?.(Object.freeze({
      completedCells: cells.length,
      totalCells: 8,
      currentCell: scheduled,
    }));
    try {
      const coreCell = await executeBenchmarkCoreCell(
        "AUTO",
        5,
        inputCallbacks(
          scheduled.strandCount,
          scheduled.pointsPerStrand,
          scheduled.tubularSegments,
        ),
        FIXED_VISUAL_STATE,
        session,
      );
      cells.push({
        strandCount: scheduled.strandCount,
        pointsPerStrand: scheduled.pointsPerStrand,
        ...controlPointTessellationComplexity(
          scheduled.pointsPerStrand,
          scheduled.tubularSegments,
        ),
        radialSegments: CONTROL_POINT_TESSELLATION_RADIAL_SEGMENTS,
        ...coreCell,
        requestedBackend: "AUTO",
      });
      dependencies.onProgress?.(Object.freeze({
        completedCells: cells.length,
        totalCells: 8,
        currentCell: null,
      }));
      if (coreCell.cellOutcome !== "COMPLETE") break;
    } catch (error) {
      recordBenchmarkCoreFailure(session, error);
      break;
    }
  }
  return cells;
}

function analysisForCells(cells: readonly ControlPointTessellationCellResult[]): {
  readonly analysis: ControlPointTessellationAnalysis;
  readonly instrumentationFailure: boolean;
} {
  if (cells.length !== 8 || cells.some((cell) => cell.cellOutcome !== "COMPLETE")) {
    return { analysis: EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS, instrumentationFailure: false };
  }
  try {
    return {
      analysis: createControlPointTessellationAnalysis(cells.map((cell) => ({
        strandCount: cell.strandCount,
        pointsPerStrand: cell.pointsPerStrand,
        tubularSegments: cell.tubularSegmentsPerStrand,
        geometryCreateCpuMs: cell.rawMeasuredSamples.map((sample) => {
          const timing = sample.timings.geometryCreateCpuMs;
          if (sample.status !== "VALID" || timing === null) {
            throw new Error("Complete S2 cells require valid geometry-create evidence.");
          }
          return timing;
        }),
      }))),
      instrumentationFailure: false,
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "INSTRUMENTATION_FAILURE") throw error;
    return { analysis: EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS, instrumentationFailure: true };
  }
}

function executionStopReason(
  cells: readonly ControlPointTessellationCellResult[],
  instrumentationFailure: boolean,
  session: ControlPointTessellationSession,
): BenchmarkStopReason {
  if (instrumentationFailure) return "INSTRUMENTATION_FAILURE";
  if (cells.length === 8 && cells.every((cell) => cell.cellOutcome === "COMPLETE")) {
    return "NONE";
  }
  return benchmarkCoreSessionStopReason(session) ??
    benchmarkCoreFirstProfileStopReason(session) ??
    cells.at(-1)?.cellStopReason ??
    "BACKEND_PROFILE_FAILURE";
}

function warning(
  actualBackend: ReturnType<typeof benchmarkCoreAutoBackend>,
): readonly ControlPointTessellationWarning[] {
  return actualBackend === "WEBGL2" ? ["AUTO_DID_NOT_SELECT_WEBGPU"] : [];
}

function resultEnvironment(
  coreOperator: BenchmarkOperatorDeclaration,
  browser: AdmittedControlPointTessellationBrowser,
  session: ControlPointTessellationSession,
): ControlPointTessellationEnvironment {
  const core = buildBenchmarkCoreEnvironment(coreOperator, session);
  if (core.rawUserAgent !== browser.rawBrowserVersionEvidence.userAgent) {
    throw new Error("S2_BROWSER_EVIDENCE_CHANGED_BEFORE_SESSION");
  }
  return {
    rawUserAgent: core.rawUserAgent,
    browserEngine: browser.browserEngine,
    declaredBrowserProduct: browser.declaredBrowserProduct,
    declaredBrowserMajor: browser.declaredBrowserMajor,
    actualBrowserProduct: browser.actualBrowserProduct,
    actualBrowserMajor: browser.actualBrowserMajor,
    rawBrowserVersionEvidence: browser.rawBrowserVersionEvidence,
    osFamily: "MACOS",
    architecture: "ARM64",
    deviceClass: "PRIMARY_REFERENCE",
    powerMode: "AC_POWER",
    lowPowerState: "OFF",
    cssViewportWidth: core.cssViewportWidth,
    cssViewportHeight: core.cssViewportHeight,
    drawingBufferWidth: core.drawingBufferWidth,
    drawingBufferHeight: core.drawingBufferHeight,
    devicePixelRatio: core.devicePixelRatio,
    rendererPixelRatio: core.rendererPixelRatio,
    startedAt: core.startedAt,
    endedAt: core.endedAt,
  };
}

export async function executeControlPointTessellationBenchmark(
  request: ControlPointTessellationExecutionRequest,
  dependencies: ControlPointTessellationExecutionDependencies,
): Promise<ControlPointTessellationResult> {
  validateControlPointTessellationSeed(request.seed);
  const coreOperator = controlledCoreOperator(request.operator);
  const rawBrowserVersionEvidence =
    (dependencies.captureBrowserVersionEvidence ?? captureRawBrowserVersionEvidence)();
  const browser = admitControlPointTessellationBrowser({
    browserEngine: request.operator.browserEngine,
    declaredBrowserProduct: request.operator.declaredBrowserProduct,
    declaredBrowserMajor: request.operator.declaredBrowserMajor,
  }, rawBrowserVersionEvidence);
  const source = await readAdmittedProvenance(request.seed, dependencies);
  const session = createBenchmarkCoreSession<ControlPointTessellationInput>(dependencies);
  const cells = await executeCells(session, dependencies);
  const analysisState = analysisForCells(cells);
  const stopReason = executionStopReason(
    cells,
    analysisState.instrumentationFailure,
    session,
  );
  const result: ControlPointTessellationResult = {
    schema: CONTROL_POINT_TESSELLATION_RESULT_SCHEMA,
    version: 1,
    experiment: CONTROL_POINT_TESSELLATION_EXPERIMENT,
    measurementContract: CONTROL_POINT_TESSELLATION_MEASUREMENT_CONTRACT,
    generatorVersion: CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
    classification: "BENCHMARK_ONLY",
    source,
    environment: resultEnvironment(coreOperator, browser, session),
    sessionConfiguration: controlPointTessellationSessionConfiguration(),
    cells,
    analysis: analysisState.analysis,
    outcome: stopReason === "NONE" ? "COMPLETE" : benchmarkTerminalOutcome(stopReason),
    stopReason,
    warnings: warning(benchmarkCoreAutoBackend(session)),
  };
  return validateControlPointTessellationResult(result);
}
