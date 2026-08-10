import {
  RENDERER_BENCHMARK_POINTS_PER_STRAND,
  RENDERER_BENCHMARK_SEED,
  RENDERER_BENCHMARK_STRAND_LEVELS,
  constructRendererBenchmarkCandidate,
  validateRendererBenchmarkInput,
  validateRendererBenchmarkSeed,
  type RendererBenchmarkInput,
  type RendererBenchmarkStrandCount,
} from "./benchmark-input";
import {
  BENCHMARK_LOGICAL_READY_CEILING_MS,
  BENCHMARK_SESSION_CEILING_MS,
  BENCHMARK_SYNC_STAGE_CEILING_MS,
} from "./benchmark-measurement";
import type { BenchmarkSourceProvenance } from "./benchmark-provenance.server";
import {
  CHARACTERIZATION_PROFILE_ORDER,
  RENDERER_BENCHMARK_MEASUREMENT_CONTRACT,
  RENDERER_BENCHMARK_RESULT_SCHEMA,
  benchmarkTerminalOutcome,
  validateRendererBenchmarkResult,
  type BenchmarkCellResult,
  type BenchmarkOperatorDeclaration,
  type BenchmarkRunKind,
  type BenchmarkSessionConfiguration,
  type BenchmarkStopReason,
  type BenchmarkWarning,
  type RequestedRendererBackend,
  type RendererBenchmarkResult,
} from "./benchmark-result";
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
import type { VisualState } from "./visual-state";

export type {
  BenchmarkCandidateHost,
  BenchmarkEnvironmentObservation,
  BenchmarkRoot,
  BenchmarkRunnerPlatform,
} from "./benchmark-runner-core";

const FIXED_VISUAL_STATE: VisualState = {
  previewColor: "#34251F",
  visualDensityTier: "HIGH",
  viewRotation: { yaw: 0, pitch: 0 },
};

export interface BenchmarkExecutionRequest {
  readonly runKind: BenchmarkRunKind;
  readonly operator: BenchmarkOperatorDeclaration;
  readonly seed: number;
}

export type BenchmarkProvenanceReader = (seed: number) => Promise<
  | { readonly success: false; readonly errorCode: "UNAUTHENTICATED" | "FORBIDDEN" }
  | {
      readonly success: true;
      readonly source: BenchmarkSourceProvenance;
      readonly currentMain: boolean;
    }
>;

export interface BenchmarkExecutionDependencies
  extends BenchmarkCoreExecutionDependencies<RendererBenchmarkInput> {
  readonly readProvenance: BenchmarkProvenanceReader;
}

export function benchmarkSessionConfiguration(
  runKind: BenchmarkRunKind,
): BenchmarkSessionConfiguration {
  const characterization = runKind === "CHARACTERIZATION";
  return {
    runKind,
    decisionBearing: characterization,
    strandLevels: characterization ? RENDERER_BENCHMARK_STRAND_LEVELS : [72],
    pointsPerStrand: RENDERER_BENCHMARK_POINTS_PER_STRAND,
    requestedBackends: ["AUTO", "WEBGL2"],
    profileOrderByLevel: characterization
      ? CHARACTERIZATION_PROFILE_ORDER
      : CHARACTERIZATION_PROFILE_ORDER.slice(0, 1),
    warmupSamplesPerCell: 1,
    measuredSamplesPerCell: characterization ? 5 : 1,
    previewColor: "#34251F",
    density: "HIGH",
    yaw: 0,
    pitch: 0,
    syncStageCeilingMs: BENCHMARK_SYNC_STAGE_CEILING_MS,
    logicalReadyCeilingMs: BENCHMARK_LOGICAL_READY_CEILING_MS,
    sessionCeilingMs: BENCHMARK_SESSION_CEILING_MS,
  };
}

interface ScheduledCell {
  readonly strandCount: RendererBenchmarkStrandCount;
  readonly requestedBackend: RequestedRendererBackend;
}

function scheduledCells(
  configuration: BenchmarkSessionConfiguration,
): readonly ScheduledCell[] {
  return configuration.profileOrderByLevel.flatMap((level) =>
    level.requestedBackends.map((requestedBackend) => ({
      strandCount: level.strandCount,
      requestedBackend,
    })),
  );
}

function validateRequest(request: BenchmarkExecutionRequest): void {
  if (
    request.runKind !== "CHARACTERIZATION" &&
    request.runKind !== "VERIFICATION_SMOKE"
  ) {
    throw new Error("runKind is unsupported.");
  }
  validateRendererBenchmarkSeed(request.seed);
  if (
    !Number.isSafeInteger(request.operator.browserMajor) ||
    request.operator.browserMajor < 0
  ) {
    throw new Error("operator.browserMajor must be a nonnegative integer.");
  }
}

async function executeParentCells(
  configuration: BenchmarkSessionConfiguration,
  dependencies: BenchmarkExecutionDependencies,
): Promise<{
  readonly cells: readonly BenchmarkCellResult[];
  readonly session: ReturnType<typeof createBenchmarkCoreSession<RendererBenchmarkInput>>;
}> {
  const session = createBenchmarkCoreSession<RendererBenchmarkInput>(dependencies);
  const cells: BenchmarkCellResult[] = [];
  const activeProfiles = new Map<RequestedRendererBackend, boolean>([
    ["AUTO", true],
    ["WEBGL2", true],
  ]);
  for (const scheduled of scheduledCells(configuration)) {
    if (benchmarkCoreSessionStopReason(session) !== null) break;
    if (activeProfiles.get(scheduled.requestedBackend) !== true) continue;
    try {
      const coreCell = await executeBenchmarkCoreCell(
        scheduled.requestedBackend,
        configuration.measuredSamplesPerCell,
        {
          constructCandidate: () => constructRendererBenchmarkCandidate({
            seed: RENDERER_BENCHMARK_SEED,
            strandCount: scheduled.strandCount,
          }),
          validateCandidate: validateRendererBenchmarkInput,
        },
        FIXED_VISUAL_STATE,
        session,
      );
      const cell: BenchmarkCellResult = {
        strandCount: scheduled.strandCount,
        pointsPerStrand: RENDERER_BENCHMARK_POINTS_PER_STRAND,
        ...coreCell,
      };
      cells.push(cell);
      if (cell.cellOutcome !== "COMPLETE") {
        activeProfiles.set(scheduled.requestedBackend, false);
      }
    } catch (error) {
      recordBenchmarkCoreFailure(session, error);
      activeProfiles.set(scheduled.requestedBackend, false);
    }
  }
  return { cells, session };
}

function resultWarnings(
  runKind: BenchmarkRunKind,
  autoBackend: ReturnType<typeof benchmarkCoreAutoBackend>,
): readonly BenchmarkWarning[] {
  const warnings: BenchmarkWarning[] = runKind === "VERIFICATION_SMOKE"
    ? ["NON_DECISION_BEARING"]
    : [];
  if (autoBackend !== "WEBGPU") warnings.push("AUTO_DID_NOT_SELECT_WEBGPU");
  return warnings;
}

async function readAdmittedParentProvenance(
  request: BenchmarkExecutionRequest,
  dependencies: BenchmarkExecutionDependencies,
): Promise<BenchmarkSourceProvenance> {
  const provenance = await dependencies.readProvenance(request.seed);
  if (!provenance.success) throw new Error("AUTHORIZATION_LOST");
  if (request.runKind !== "CHARACTERIZATION") return provenance.source;
  if (provenance.source.treeState !== "CLEAN") throw new Error("SOURCE_TREE_DIRTY");
  if (!provenance.currentMain) throw new Error("SOURCE_NOT_CURRENT_MAIN");
  return provenance.source;
}

export async function executeRendererBenchmark(
  request: BenchmarkExecutionRequest,
  dependencies: BenchmarkExecutionDependencies,
): Promise<RendererBenchmarkResult> {
  validateRequest(request);
  const source = await readAdmittedParentProvenance(request, dependencies);
  const configuration = benchmarkSessionConfiguration(request.runKind);
  const execution = await executeParentCells(configuration, dependencies);
  const completed = execution.cells.length === scheduledCells(configuration).length &&
    execution.cells.every((cell) => cell.cellOutcome === "COMPLETE");
  const stopReason: BenchmarkStopReason = completed
    ? "NONE"
    : benchmarkCoreSessionStopReason(execution.session) ??
      benchmarkCoreFirstProfileStopReason(execution.session) ??
      "BACKEND_PROFILE_FAILURE";
  const result: RendererBenchmarkResult = {
    schema: RENDERER_BENCHMARK_RESULT_SCHEMA,
    version: 2,
    measurementContract: RENDERER_BENCHMARK_MEASUREMENT_CONTRACT,
    classification: "BENCHMARK_ONLY",
    source,
    environment: buildBenchmarkCoreEnvironment(request.operator, execution.session),
    sessionConfiguration: configuration,
    cells: execution.cells,
    outcome: completed ? "COMPLETE" : benchmarkTerminalOutcome(stopReason),
    stopReason,
    warnings: resultWarnings(request.runKind, benchmarkCoreAutoBackend(execution.session)),
  };
  return validateRendererBenchmarkResult(result);
}
