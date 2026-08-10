import { describe, expect, it } from "vitest";
import { POINT_SENSITIVITY_SEED } from "../benchmark-point-sensitivity-input";
import {
  EMPTY_POINT_SENSITIVITY_ANALYSIS,
  POINT_SENSITIVITY_CELL_ORDER,
  POINT_SENSITIVITY_RESULT_SCHEMA,
  createPointSensitivityAnalysis,
  pointSensitivityComplexity,
  pointSensitivityResultFilename,
  pointSensitivitySessionConfiguration,
  serializePointSensitivityResult,
  validatePointSensitivityResult,
  type PointSensitivityCellResult,
  type PointSensitivityResult,
} from "../benchmark-point-sensitivity-result";
import {
  createBenchmarkMetricSummaries,
  validateRendererBenchmarkResult,
  type ActualRendererBackend,
  type BenchmarkCellOutcome,
  type BenchmarkMeasuredSample,
  type BenchmarkSampleStatus,
  type BenchmarkSampleTimings,
  type BenchmarkStopReason,
} from "../benchmark-result";

const zeroCleanup = {
  status: "ZERO" as const,
  candidateHosts: 0, activeHosts: 0, canvases: 0, observers: 0,
  timers: 0, animationFrames: 0, backends: 0, geometries: 0,
  finalOwnedResources: 0,
};

const nonzeroCleanup = {
  status: "NONZERO" as const,
  candidateHosts: 1, activeHosts: 0, canvases: 0, observers: 0,
  timers: 0, animationFrames: 0, backends: 0, geometries: 0,
  finalOwnedResources: 1,
};

const TEST_STOP_REASON_CLASSIFICATION = {
  NONE: "CONTEXT_DEPENDENT",
  CANCELLED_BY_OPERATOR: "REACHABLE",
  ROUTE_EXIT: "REACHABLE",
  AUTHORIZATION_LOST: "REACHABLE",
  PAGE_HIDDEN: "REACHABLE",
  CSS_VIEWPORT_CHANGED: "REACHABLE",
  DEVICE_PIXEL_RATIO_CHANGED: "REACHABLE",
  DRAWING_BUFFER_CHANGED: "REACHABLE",
  RENDERER_PIXEL_RATIO_CHANGED: "REACHABLE",
  SESSION_DEADLINE: "REACHABLE",
  INSTRUMENTATION_FAILURE: "CONTEXT_DEPENDENT",
  CLEANUP_INVARIANT_FAILURE: "CONTEXT_DEPENDENT",
  SOURCE_TREE_DIRTY: "UNREACHABLE",
  PROVENANCE_UNAVAILABLE: "UNREACHABLE",
  BACKEND_PROFILE_FAILURE: "REACHABLE",
  RENDERER_INIT_FAILURE: "REACHABLE",
  RENDER_SUBMIT_FAILURE: "REACHABLE",
  FORCED_BACKEND_MISMATCH: "UNREACHABLE",
  AUTO_BACKEND_DRIFT: "CONTEXT_DEPENDENT",
  SYNC_STAGE_CEILING: "CONTEXT_DEPENDENT",
  LOGICAL_READY_CEILING: "CONTEXT_DEPENDENT",
} as const satisfies Record<
  BenchmarkStopReason,
  "REACHABLE" | "UNREACHABLE" | "CONTEXT_DEPENDENT"
>;

const TEST_LOGICAL_OWNED_TIMINGS = [
  "backendConstructionCpuMs",
  "sceneSetupCpuMs",
  "rendererInitWallMs",
  "geometrySelectCpuMs",
  "geometryCreateCpuMs",
  "geometryMergeCpuMs",
  "geometryFinalizeCpuMs",
  "firstRenderSubmitCpuMs",
] as const satisfies readonly (keyof BenchmarkSampleTimings)[];

/**
 * Test-only fixture discipline derived independently from runner clock
 * boundaries: input construction and validation precede the candidate interval,
 * which encloses the logical owned stages, and teardown follows it.
 */
function recordedWallLowerBound(timings: BenchmarkSampleTimings): number {
  const logicalOwned = TEST_LOGICAL_OWNED_TIMINGS.reduce(
    (sum, name) => sum + (timings[name] ?? 0),
    0,
  );
  return (timings.inputConstructionCpuMs ?? 0) +
    (timings.inputValidationCpuMs ?? 0) +
    Math.max(timings.candidateToLogicalReadyMs ?? 0, logicalOwned) +
    (timings.teardownCpuMs ?? 0);
}

function sample(ordinal: number, geometry: number, ready = 200): BenchmarkMeasuredSample {
  const timingParts: BenchmarkSampleTimings = {
    inputConstructionCpuMs: 1,
    inputValidationCpuMs: 1,
    backendConstructionCpuMs: 1,
    sceneSetupCpuMs: 1,
    rendererInitWallMs: 1,
    geometrySelectCpuMs: 1,
    geometryCreateCpuMs: geometry,
    geometryMergeCpuMs: 1,
    geometryFinalizeCpuMs: 1,
    firstRenderSubmitCpuMs: 1,
    candidateToLogicalReadyMs: ready,
    teardownCpuMs: 1,
    totalSampleWallMs: null,
  };
  const timings: BenchmarkSampleTimings = {
    ...timingParts,
    totalSampleWallMs: recordedWallLowerBound(timingParts),
  };
  return {
    ordinal,
    status: "VALID",
    actualBackend: "WEBGPU",
    timings,
    cleanupOutcome: zeroCleanup,
    stopReason: "NONE",
  };
}

function emptyTimings(): BenchmarkSampleTimings {
  return {
    inputConstructionCpuMs: null,
    inputValidationCpuMs: null,
    backendConstructionCpuMs: null,
    sceneSetupCpuMs: null,
    rendererInitWallMs: null,
    geometrySelectCpuMs: null,
    geometryCreateCpuMs: null,
    geometryMergeCpuMs: null,
    geometryFinalizeCpuMs: null,
    firstRenderSubmitCpuMs: null,
    candidateToLogicalReadyMs: null,
    teardownCpuMs: null,
    totalSampleWallMs: null,
  };
}

function executedPrefixTimings(
  prefixLength: number,
  overrides: Partial<BenchmarkSampleTimings> = {},
): BenchmarkSampleTimings {
  const ordered = [
    "inputConstructionCpuMs",
    "inputValidationCpuMs",
    "backendConstructionCpuMs",
    "sceneSetupCpuMs",
    "rendererInitWallMs",
    "geometrySelectCpuMs",
    "geometryCreateCpuMs",
    "geometryMergeCpuMs",
    "geometryFinalizeCpuMs",
    "firstRenderSubmitCpuMs",
  ] as const satisfies readonly (keyof BenchmarkSampleTimings)[];
  const timings = { ...emptyTimings(), teardownCpuMs: 1, totalSampleWallMs: null };
  for (const name of ordered.slice(0, prefixLength)) timings[name] = 1;
  const overridden = { ...timings, ...overrides };
  if (overrides.totalSampleWallMs === undefined) {
    overridden.totalSampleWallMs = recordedWallLowerBound(overridden);
  }
  return overridden;
}

function autoBackendDriftTimings(): BenchmarkSampleTimings {
  return {
    inputConstructionCpuMs: 1,
    inputValidationCpuMs: 1,
    backendConstructionCpuMs: 1,
    sceneSetupCpuMs: 1,
    rendererInitWallMs: 1,
    geometrySelectCpuMs: null,
    geometryCreateCpuMs: null,
    geometryMergeCpuMs: null,
    geometryFinalizeCpuMs: null,
    firstRenderSubmitCpuMs: null,
    candidateToLogicalReadyMs: null,
    teardownCpuMs: 1,
    totalSampleWallMs: 6,
  };
}

function cells(values: readonly [number, number, number]): readonly PointSensitivityCellResult[] {
  return POINT_SENSITIVITY_CELL_ORDER.map((identity) => {
    const levelValue = identity.pointsPerStrand === 3
      ? values[0]
      : identity.pointsPerStrand === 6 ? values[1] : values[2];
    const samples = [1, 2, 3, 4, 5].map((ordinal) => sample(ordinal, levelValue));
    return {
      ...identity,
      ...pointSensitivityComplexity(identity.pointsPerStrand),
      tubeSegmentsPerControlSpan: 3,
      radialSegments: 4,
      requestedBackend: "AUTO",
      actualBackend: "WEBGPU",
      warmupStatus: "VALID",
      rawMeasuredSamples: samples,
      metricSummaries: createBenchmarkMetricSummaries(samples),
      cleanupOutcome: zeroCleanup,
      cellOutcome: "COMPLETE",
      cellStopReason: "NONE",
    };
  });
}

function result(values: readonly [number, number, number] = [70, 100, 120]): PointSensitivityResult {
  const completeCells = cells(values);
  return {
    schema: POINT_SENSITIVITY_RESULT_SCHEMA,
    version: 1,
    experiment: "R2C-A-S1",
    measurementContract: "r2ca-s1-v0.1",
    generatorVersion: "r2ca-s1-synthetic-generator/v1",
    classification: "BENCHMARK_ONLY",
    source: {
      kind: "LOCAL_GIT",
      commit: "a".repeat(40),
      branch: "main",
      treeState: "CLEAN",
      observedAt: "2026-08-09T00:00:00.000Z",
      nextVersion: "16.2.7",
      threeVersion: "0.185.1",
      generatorVersion: "r2ca-s1-synthetic-generator/v1",
      geometryRecipe: "RADIAL_CROWN_FALL_V1",
      seed: POINT_SENSITIVITY_SEED,
    },
    environment: {
      rawUserAgent: "test",
      browserEngine: "CHROMIUM_FAMILY",
      browserMajor: 140,
      osFamily: "MACOS",
      architecture: "ARM64",
      deviceClass: "PRIMARY_REFERENCE",
      powerMode: "AC_POWER",
      lowPowerState: "OFF",
      cssViewportWidth: 800,
      cssViewportHeight: 600,
      drawingBufferWidth: 1600,
      drawingBufferHeight: 1200,
      devicePixelRatio: 2,
      rendererPixelRatio: 2,
      startedAt: "2026-08-09T00:00:00.000Z",
      endedAt: "2026-08-09T00:01:00.000Z",
    },
    sessionConfiguration: pointSensitivitySessionConfiguration(),
    cells: completeCells,
    analysis: createPointSensitivityAnalysis(completeCells),
    outcome: "COMPLETE",
    stopReason: "NONE",
    warnings: [],
  };
}

interface TerminalMeasuredCellOptions {
  readonly reason: BenchmarkStopReason;
  readonly status: Exclude<BenchmarkSampleStatus, "VALID">;
  readonly outcome: Exclude<BenchmarkCellOutcome, "COMPLETE" | "PARTIAL">;
  readonly cellBackend?: ActualRendererBackend | null;
  readonly terminalBackend?: ActualRendererBackend | null;
  readonly terminalTimings?: BenchmarkSampleTimings;
  readonly validSampleCount?: number;
}

function terminalMeasuredCell(
  base: PointSensitivityCellResult,
  options: TerminalMeasuredCellOptions,
): PointSensitivityCellResult {
  const validSampleCount = options.validSampleCount ?? 1;
  const validSamples = Array.from({ length: validSampleCount }, (_, index) =>
    sample(index + 1, 70),
  );
  const terminal: BenchmarkMeasuredSample = {
    ...sample(validSampleCount + 1, 70),
    status: options.status,
    actualBackend: options.terminalBackend === undefined
      ? "WEBGPU"
      : options.terminalBackend,
    timings: options.terminalTimings ?? emptyTimings(),
    stopReason: options.reason,
  };
  const samples = [...validSamples, terminal];
  return {
    ...base,
    actualBackend: options.cellBackend === undefined ? "WEBGPU" : options.cellBackend,
    warmupStatus: "VALID",
    rawMeasuredSamples: samples,
    metricSummaries: createBenchmarkMetricSummaries(samples),
    cleanupOutcome: zeroCleanup,
    cellOutcome: options.outcome,
    cellStopReason: options.reason,
  };
}

function truthfulPartialResult(): PointSensitivityResult {
  const complete = result();
  const terminal = terminalMeasuredCell(complete.cells[1], {
    reason: "ROUTE_EXIT",
    status: "CANCELLED",
    outcome: "CANCELLED",
  });
  return {
    ...complete,
    cells: [complete.cells[0], terminal],
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome: "CANCELLED",
    stopReason: "ROUTE_EXIT",
  };
}

function truthfulWarmupOnlyTerminalResult(): PointSensitivityResult {
  const complete = result();
  const terminal = terminalMeasuredCell(complete.cells[0], {
    reason: "CANCELLED_BY_OPERATOR",
    status: "CANCELLED",
    outcome: "CANCELLED",
    validSampleCount: 0,
  });
  return {
    ...complete,
    cells: [terminal],
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome: "CANCELLED",
    stopReason: "CANCELLED_BY_OPERATOR",
  };
}

function truthfulWarmupFailureResult(): PointSensitivityResult {
  const complete = result();
  const terminal: PointSensitivityCellResult = {
    ...complete.cells[0],
    actualBackend: null,
    warmupStatus: "FAILED",
    rawMeasuredSamples: [],
    metricSummaries: createBenchmarkMetricSummaries([]),
    cellOutcome: "FAILED",
    cellStopReason: "RENDERER_INIT_FAILURE",
  };
  return {
    ...complete,
    cells: [terminal],
    environment: {
      ...complete.environment,
      drawingBufferWidth: 0,
      drawingBufferHeight: 0,
      rendererPixelRatio: 0,
    },
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome: "FAILED",
    stopReason: "RENDERER_INIT_FAILURE",
  };
}

function truthfulDriftResult(): PointSensitivityResult {
  const complete = result();
  const terminal = terminalMeasuredCell(complete.cells[1], {
    reason: "AUTO_BACKEND_DRIFT",
    status: "STOPPED",
    outcome: "STOPPED",
    terminalBackend: "WEBGL2",
    terminalTimings: autoBackendDriftTimings(),
  });
  return {
    ...complete,
    cells: [complete.cells[0], terminal],
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome: "STOPPED",
    stopReason: "AUTO_BACKEND_DRIFT",
  };
}

function truthfulCleanupFailureResult(): PointSensitivityResult {
  const complete = result();
  const terminalSample: BenchmarkMeasuredSample = {
    ...sample(1, 70),
    status: "FAILED",
    cleanupOutcome: nonzeroCleanup,
    stopReason: "CLEANUP_INVARIANT_FAILURE",
  };
  const terminal: PointSensitivityCellResult = {
    ...complete.cells[0],
    rawMeasuredSamples: [terminalSample],
    metricSummaries: createBenchmarkMetricSummaries([terminalSample]),
    cleanupOutcome: nonzeroCleanup,
    cellOutcome: "FAILED",
    cellStopReason: "CLEANUP_INVARIANT_FAILURE",
  };
  return {
    ...complete,
    cells: [terminal],
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome: "FAILED",
    stopReason: "CLEANUP_INVARIANT_FAILURE",
  };
}

function instrumentationFailureResult(): PointSensitivityResult {
  const complete = result();
  const impossibleCells = cells([0, 0, 0]);
  return {
    ...complete,
    cells: impossibleCells,
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome: "FAILED",
    stopReason: "INSTRUMENTATION_FAILURE",
  };
}

function terminalResultForReason(
  reason: BenchmarkStopReason,
  status: Exclude<BenchmarkSampleStatus, "VALID">,
  outcome: Exclude<BenchmarkCellOutcome, "COMPLETE" | "PARTIAL">,
  terminalTimings: BenchmarkSampleTimings = emptyTimings(),
): PointSensitivityResult {
  const complete = result();
  const terminal = terminalMeasuredCell(complete.cells[0], {
    reason,
    status,
    outcome,
    validSampleCount: 0,
    terminalTimings,
  });
  return {
    ...complete,
    cells: [terminal],
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome,
    stopReason: reason,
  };
}

function measuredTerminalResult(options: TerminalMeasuredCellOptions): PointSensitivityResult {
  const complete = result();
  const terminal = terminalMeasuredCell(complete.cells[0], options);
  return {
    ...complete,
    cells: [terminal],
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome: options.outcome,
    stopReason: options.reason,
  };
}

function warmupTerminalResult(
  reason: BenchmarkStopReason,
  outcome: Exclude<BenchmarkCellOutcome, "COMPLETE" | "PARTIAL">,
  backend: ActualRendererBackend | null,
  warning: boolean,
  environmentEstablished: boolean,
): PointSensitivityResult {
  const complete = result();
  const terminal: PointSensitivityCellResult = {
    ...complete.cells[0],
    actualBackend: backend,
    warmupStatus: outcome,
    rawMeasuredSamples: [],
    metricSummaries: createBenchmarkMetricSummaries([]),
    cleanupOutcome: zeroCleanup,
    cellOutcome: outcome,
    cellStopReason: reason,
  };
  return {
    ...complete,
    cells: [terminal],
    environment: environmentEstablished
      ? complete.environment
      : {
        ...complete.environment,
        drawingBufferWidth: 0,
        drawingBufferHeight: 0,
        rendererPixelRatio: 0,
      },
    analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
    outcome,
    stopReason: reason,
    warnings: warning ? ["AUTO_DID_NOT_SELECT_WEBGPU"] : [],
  };
}

function thresholdBoundaryCells(): readonly PointSensitivityCellResult[] {
  const samples = [75, 70, 70, 70, 70].map((geometry, index) =>
    sample(index + 1, geometry),
  );
  return cells([70, 100, 120]).map((entry) =>
    entry.pointsPerStrand === 3
      ? { ...entry, rawMeasuredSamples: samples, metricSummaries: createBenchmarkMetricSummaries(samples) }
      : entry,
  );
}

describe("R2C-A-S1 Result v1", () => {
  it("validates the exact identity, schedule, cardinality, complexity, summaries and analysis", () => {
    const validated = validatePointSensitivityResult(result());
    expect(validated).toMatchObject({
      schema: POINT_SENSITIVITY_RESULT_SCHEMA,
      version: 1,
      experiment: "R2C-A-S1",
      measurementContract: "r2ca-s1-v0.1",
      generatorVersion: "r2ca-s1-synthetic-generator/v1",
    });
    expect(validated.cells.map((entry) => [entry.strandCount, entry.pointsPerStrand]))
      .toEqual(POINT_SENSITIVITY_CELL_ORDER.map((entry) => [entry.strandCount, entry.pointsPerStrand]));
    expect(validated.cells.map((entry) => entry.tubularSegmentsPerStrand)).toEqual([6, 15, 21, 21, 15, 6]);
    expect(validated.cells.every((entry) => entry.rawMeasuredSamples.length === 5)).toBe(true);
    expect(validated.analysis.levels[0]).toMatchObject({
      geometryCreateMedians: [70, 100, 120],
      ratiosToP6: [0.7, 1.2],
      strictMedianMonotonicity: true,
      candidateToLogicalReadyMedians: [200, 200, 200],
      geometryCreateShares: [0.35, 0.5, 0.6],
    });
    expect(validated.analysis.disposition).toBe("COUPLED_POINT_TESSELLATION_SENSITIVE");
    expect(validated.analysis.prototypeTarget).toBe("CONTROL_POINT_VS_TESSELLATION_DECOUPLING");
  });

  it("computes weak sensitivity and multiple mixed/nonlinear routes", () => {
    expect(result([80, 100, 110]).analysis.disposition).toBe("WEAK_COUPLED_COMPLEXITY_SENSITIVITY");
    expect(result([70, 100, 110]).analysis.disposition).toBe("MIXED_OR_NONLINEAR");
    expect(result([90, 100, 120]).analysis.disposition).toBe("MIXED_OR_NONLINEAR");
    expect(result([100, 90, 120]).analysis.disposition).toBe("MIXED_OR_NONLINEAR");
  });

  it("uses inclusive raw threshold ranges before a median disposition", () => {
    const analysis = createPointSensitivityAnalysis(thresholdBoundaryCells());
    expect(analysis.levels.every((level) => level.rawRatioRanges[0].maximum === 0.75)).toBe(true);
    expect(analysis.disposition).toBe("MIXED_OR_NONLINEAR");
  });

  it("routes cross-level disagreement to MIXED", () => {
    const combined = [...cells([70, 100, 120]).slice(0, 3), ...cells([80, 100, 110]).slice(3)];
    expect(createPointSensitivityAnalysis(combined).disposition).toBe("MIXED_OR_NONLINEAR");
  });

  it("rejects nonfinite, negative, stale summary, and complexity contradictions", () => {
    const nonfinite = structuredClone(result());
    Reflect.set(nonfinite.cells[0].rawMeasuredSamples[0].timings, "geometryCreateCpuMs", Number.NaN);
    expect(() => validatePointSensitivityResult(nonfinite)).toThrow(/finite/);
    const negative = structuredClone(result());
    Reflect.set(negative.cells[0].rawMeasuredSamples[0].timings, "geometryCreateCpuMs", -1);
    expect(() => validatePointSensitivityResult(negative)).toThrow(/nonnegative/);
    const stale = structuredClone(result());
    Reflect.set(stale.cells[0].metricSummaries.geometryCreateCpuMs, "median", 999);
    expect(() => validatePointSensitivityResult(stale)).toThrow(/recompute/);
    const complexity = structuredClone(result());
    Reflect.set(complexity.cells[0], "tubularSegmentsPerStrand", 15);
    expect(() => validatePointSensitivityResult(complexity)).toThrow(/complexity/);
  });

  it("enforces the finite recorded timing-containment matrix", () => {
    const totalBelowCandidate = structuredClone(result());
    Reflect.set(
      totalBelowCandidate.cells[0].rawMeasuredSamples[0].timings,
      "totalSampleWallMs",
      199,
    );

    const totalBelowTeardown = measuredTerminalResult({
      reason: "PAGE_HIDDEN",
      status: "INVALIDATED",
      outcome: "INVALIDATED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(0, {
        teardownCpuMs: 1,
        totalSampleWallMs: 0.5,
      }),
      validSampleCount: 0,
    });

    const totalBelowDisjointSum = measuredTerminalResult({
      reason: "PAGE_HIDDEN",
      status: "INVALIDATED",
      outcome: "INVALIDATED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(2, { totalSampleWallMs: 2 }),
      validSampleCount: 0,
    });

    const candidateBelowOwnedWork = structuredClone(result());
    Reflect.set(
      candidateBelowOwnedWork.cells[0].rawMeasuredSamples[0].timings,
      "candidateToLogicalReadyMs",
      50,
    );

    const logicalCeilingWithoutWall = measuredTerminalResult({
      reason: "LOGICAL_READY_CEILING",
      status: "STOPPED",
      outcome: "STOPPED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(3, { totalSampleWallMs: 100 }),
      validSampleCount: 0,
    });

    const cleanupAfterProvenCeiling = structuredClone(truthfulCleanupFailureResult());
    const cleanupTerminal = cleanupAfterProvenCeiling.cells[0].rawMeasuredSamples[0];
    Reflect.set(cleanupTerminal.timings, "candidateToLogicalReadyMs", 3000);
    Reflect.set(cleanupTerminal.timings, "totalSampleWallMs", 2500);

    for (const hostile of [
      totalBelowCandidate,
      totalBelowTeardown,
      totalBelowDisjointSum,
      candidateBelowOwnedWork,
      logicalCeilingWithoutWall,
      cleanupAfterProvenCeiling,
    ]) {
      expect(() => validatePointSensitivityResult(hostile)).toThrow(/shorter|contained/i);
    }

    expect(validatePointSensitivityResult(result()).outcome).toBe("COMPLETE");
  });

  it("fails impossible zero-P6 analysis without serializing contradictory COMPLETE evidence", () => {
    const zeroCells = cells([0, 0, 0]);
    const impossible = { ...result(), cells: zeroCells, analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS, outcome: "FAILED" as const, stopReason: "INSTRUMENTATION_FAILURE" as const };
    expect(validatePointSensitivityResult(impossible).analysis.disposition).toBeNull();
    expect(() => validatePointSensitivityResult({ ...impossible, outcome: "COMPLETE", stopReason: "NONE" })).toThrow(/terminal|Impossible/);
  });

  it("accepts truthful warm-up-only, partial measured, complete, and backend-drift histories", () => {
    expect(validatePointSensitivityResult(truthfulWarmupOnlyTerminalResult()).stopReason)
      .toBe("CANCELLED_BY_OPERATOR");
    expect(validatePointSensitivityResult(truthfulPartialResult()).analysis.disposition).toBeNull();
    expect(validatePointSensitivityResult(result()).outcome).toBe("COMPLETE");
    expect(validatePointSensitivityResult(truthfulDriftResult()).stopReason)
      .toBe("AUTO_BACKEND_DRIFT");
  });

  it("enforces VALID* then exactly one terminal sample within a terminal cell", () => {
    const complete = result();
    const base = terminalMeasuredCell(complete.cells[0], {
      reason: "ROUTE_EXIT",
      status: "CANCELLED",
      outcome: "CANCELLED",
    });
    const valid = sample(1, 70);
    const terminal = structuredClone(base.rawMeasuredSamples.at(-1));
    if (terminal === undefined) throw new Error("Expected terminal sample fixture.");

    const terminalThenValid = {
      ...base,
      rawMeasuredSamples: [{ ...terminal, ordinal: 1 }, { ...valid, ordinal: 2 }],
    };
    const validTerminalValid = {
      ...base,
      rawMeasuredSamples: [
        valid,
        { ...terminal, ordinal: 2 },
        { ...valid, ordinal: 3 },
      ],
    };
    const validTerminalTerminal = {
      ...base,
      rawMeasuredSamples: [
        valid,
        { ...terminal, ordinal: 2 },
        { ...terminal, ordinal: 3 },
      ],
    };
    const missingTerminal = {
      ...base,
      rawMeasuredSamples: [valid],
    };
    for (const hostile of [
      terminalThenValid,
      validTerminalValid,
      validTerminalTerminal,
      missingTerminal,
    ]) {
      const rawMeasuredSamples = hostile.rawMeasuredSamples;
      expect(() => validatePointSensitivityResult({
        ...complete,
        cells: [{
          ...hostile,
          metricSummaries: createBenchmarkMetricSummaries(rawMeasuredSamples),
        }],
        analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
        outcome: "CANCELLED",
        stopReason: "ROUTE_EXIT",
      })).toThrow(/terminal|VALID samples/i);
    }
  });

  it("rejects a completed cell after a terminal cell and rejects two terminal cells", () => {
    const complete = result();
    const partial = truthfulPartialResult();
    expect(() => validatePointSensitivityResult({
      ...partial,
      cells: [...partial.cells, complete.cells[2]],
    })).toThrow(/follow.*terminal/i);

    const firstTerminal = terminalMeasuredCell(complete.cells[0], {
      reason: "ROUTE_EXIT",
      status: "CANCELLED",
      outcome: "CANCELLED",
    });
    const secondTerminal = terminalMeasuredCell(complete.cells[1], {
      reason: "ROUTE_EXIT",
      status: "CANCELLED",
      outcome: "CANCELLED",
    });
    expect(() => validatePointSensitivityResult({
      ...partial,
      cells: [firstTerminal, secondTerminal],
    })).toThrow(/follow.*terminal/i);
  });

  it("requires the top-level stop reason to match the terminal cell cause exactly", () => {
    expect(() => validatePointSensitivityResult({
      ...truthfulPartialResult(),
      stopReason: "CANCELLED_BY_OPERATOR",
    })).toThrow(/exactly match/i);
  });

  it("rejects a top-level AUTO_BACKEND_DRIFT label without a terminal drift cell", () => {
    const complete = result();
    expect(() => validatePointSensitivityResult({
      ...complete,
      cells: [complete.cells[0]],
      analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
      outcome: "STOPPED",
      stopReason: "AUTO_BACKEND_DRIFT",
    })).toThrow(/exact terminal cell/i);
  });

  it("requires an actual, coherent AUTO_BACKEND_DRIFT transition", () => {
    const complete = result();
    const falseDrift = terminalMeasuredCell(complete.cells[1], {
      reason: "AUTO_BACKEND_DRIFT",
      status: "STOPPED",
      outcome: "STOPPED",
      terminalBackend: "WEBGPU",
      terminalTimings: autoBackendDriftTimings(),
    });
    const falseResult: PointSensitivityResult = {
      ...complete,
      cells: [complete.cells[0], falseDrift],
      analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
      outcome: "STOPPED",
      stopReason: "AUTO_BACKEND_DRIFT",
    };
    expect(() => validatePointSensitivityResult(falseResult)).toThrow(/backend change|causal state/i);

    const contradictoryDrift = terminalMeasuredCell(complete.cells[1], {
      reason: "AUTO_BACKEND_DRIFT",
      status: "STOPPED",
      outcome: "STOPPED",
      cellBackend: "WEBGL2",
      terminalBackend: "WEBGPU",
      terminalTimings: autoBackendDriftTimings(),
    });
    const contradictorySamples = structuredClone(contradictoryDrift.rawMeasuredSamples);
    Reflect.set(contradictorySamples[0], "actualBackend", "WEBGL2");
    expect(() => validatePointSensitivityResult({
      ...falseResult,
      cells: [complete.cells[0], {
        ...contradictoryDrift,
        rawMeasuredSamples: contradictorySamples,
        metricSummaries: createBenchmarkMetricSummaries(contradictorySamples),
      }],
    })).toThrow(/preceding|backend/i);

    expect(validatePointSensitivityResult(truthfulDriftResult()).stopReason)
      .toBe("AUTO_BACKEND_DRIFT");
  });

  it("requires successful warm-up to establish a non-null cell backend", () => {
    const hostile = structuredClone(truthfulWarmupOnlyTerminalResult());
    Reflect.set(hostile.cells[0], "actualBackend", null);
    Reflect.set(hostile.cells[0].rawMeasuredSamples[0], "actualBackend", null);
    expect(() => validatePointSensitivityResult(hostile)).toThrow(/warm-up.*backend/i);
    expect(() => serializePointSensitivityResult(hostile)).toThrow(/warm-up.*backend/i);
  });

  it("rejects a later successful warm-up that contradicts the established session backend", () => {
    const partial = structuredClone(truthfulPartialResult());
    Reflect.set(partial.cells[1], "actualBackend", "WEBGL2");
    for (const measured of partial.cells[1].rawMeasuredSamples) {
      Reflect.set(measured, "actualBackend", "WEBGL2");
    }
    expect(() => validatePointSensitivityResult(partial)).toThrow(/preceding S1 backend/i);
  });

  it("rejects every parent stop reason that is unreachable in AUTO-only S1", () => {
    for (const reason of [
      "FORCED_BACKEND_MISMATCH",
      "SOURCE_TREE_DIRTY",
      "PROVENANCE_UNAVAILABLE",
    ] as const) {
      const hostile = terminalResultForReason(reason, "STOPPED", "STOPPED");
      expect(() => validatePointSensitivityResult(hostile)).toThrow(/not reachable.*AUTO-only S1/i);
      expect(() => serializePointSensitivityResult(hostile)).toThrow(/not reachable.*AUTO-only S1/i);
    }
  });

  it("rejects AUTO_BACKEND_DRIFT evidence that crosses the pre-geometry timing guard", () => {
    const impossible = structuredClone(truthfulDriftResult());
    const terminal = impossible.cells.at(-1)?.rawMeasuredSamples.at(-1);
    if (terminal === undefined) throw new Error("Expected drift terminal sample fixture.");
    Reflect.set(terminal.timings, "geometrySelectCpuMs", 1);
    Reflect.set(terminal.timings, "geometryCreateCpuMs", 1);
    Reflect.set(terminal.timings, "geometryMergeCpuMs", 1);
    Reflect.set(terminal.timings, "geometryFinalizeCpuMs", 1);
    Reflect.set(terminal.timings, "totalSampleWallMs", 10);
    expect(() => validatePointSensitivityResult(impossible)).toThrow(/timing prefix|causal state/i);
  });

  it("rejects a later drift after an earlier synchronous hard ceiling", () => {
    const atCeiling = structuredClone(truthfulDriftResult());
    const terminal = atCeiling.cells.at(-1)?.rawMeasuredSamples.at(-1);
    if (terminal === undefined) throw new Error("Expected drift terminal sample fixture.");
    Reflect.set(terminal.timings, "sceneSetupCpuMs", 1000);
    Reflect.set(terminal.timings, "totalSampleWallMs", 1005);
    expect(() => validatePointSensitivityResult(atCeiling)).toThrow(/synchronous hard ceiling/i);

    const overCeiling = structuredClone(truthfulDriftResult());
    const overTerminal = overCeiling.cells.at(-1)?.rawMeasuredSamples.at(-1);
    if (overTerminal === undefined) throw new Error("Expected drift terminal sample fixture.");
    Reflect.set(overTerminal.timings, "inputValidationCpuMs", 1001);
    Reflect.set(overTerminal.timings, "totalSampleWallMs", 1006);
    expect(() => validatePointSensitivityResult(overCeiling)).toThrow(/synchronous hard ceiling/i);
  });

  it("rejects a non-ceiling terminal cause when its last synchronous prefix hit the ceiling", () => {
    const timingsValue: BenchmarkSampleTimings = {
      ...emptyTimings(),
      inputConstructionCpuMs: 1,
      inputValidationCpuMs: 1000,
      teardownCpuMs: 1,
      totalSampleWallMs: 1002,
    };
    const hostile = terminalResultForReason(
      "CANCELLED_BY_OPERATOR",
      "CANCELLED",
      "CANCELLED",
      timingsValue,
    );
    expect(() => validatePointSensitivityResult(hostile)).toThrow(/synchronous hard ceiling/i);
  });

  it("rejects a later drift after the provable logical-ready prefix safely exceeds 3000 ms", () => {
    const hostile = structuredClone(truthfulDriftResult());
    const terminal = hostile.cells.at(-1)?.rawMeasuredSamples.at(-1);
    if (terminal === undefined) throw new Error("Expected drift terminal sample fixture.");
    Reflect.set(terminal.timings, "backendConstructionCpuMs", 999);
    Reflect.set(terminal.timings, "sceneSetupCpuMs", 999);
    Reflect.set(terminal.timings, "rendererInitWallMs", 1002.001);
    Reflect.set(terminal.timings, "totalSampleWallMs", 3003.001);
    expect(() => validatePointSensitivityResult(hostile)).toThrow(/logical-ready ceiling/i);
  });

  it("rejects a pre-submit failure after an earlier logical ceiling without over-rejecting submit-boundary failures", () => {
    const impossiblePreSubmit = measuredTerminalResult({
      reason: "RENDER_SUBMIT_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: "WEBGPU",
      terminalTimings: executedPrefixTimings(9, {
        backendConstructionCpuMs: 500,
        sceneSetupCpuMs: 500,
        rendererInitWallMs: 1000.25,
        geometrySelectCpuMs: 250,
        geometryCreateCpuMs: 250,
        geometryMergeCpuMs: 250,
        geometryFinalizeCpuMs: 250,
      }),
      validSampleCount: 0,
    });
    expect(() => validatePointSensitivityResult(impossiblePreSubmit))
      .toThrow(/logical-ready ceiling/i);

    const lawfulSubmitBoundary = measuredTerminalResult({
      reason: "RENDER_SUBMIT_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: "WEBGPU",
      terminalTimings: executedPrefixTimings(10, {
        backendConstructionCpuMs: 500,
        sceneSetupCpuMs: 500,
        rendererInitWallMs: 999.5,
        geometrySelectCpuMs: 250,
        geometryCreateCpuMs: 250,
        geometryMergeCpuMs: 250,
        geometryFinalizeCpuMs: 250,
        firstRenderSubmitCpuMs: 1,
      }),
      validSampleCount: 0,
    });
    expect(validatePointSensitivityResult(lawfulSubmitBoundary).stopReason)
      .toBe("RENDER_SUBMIT_FAILURE");
  });

  it("keeps direct logical-ready threshold evidence exact", () => {
    const microscopicallyBelow = measuredTerminalResult({
      reason: "SYNC_STAGE_CEILING",
      status: "STOPPED",
      outcome: "STOPPED",
      terminalBackend: "WEBGPU",
      terminalTimings: executedPrefixTimings(10, {
        candidateToLogicalReadyMs: 2999.9999999999995,
        teardownCpuMs: 1000,
      }),
      validSampleCount: 0,
    });
    expect(validatePointSensitivityResult(microscopicallyBelow).stopReason)
      .toBe("SYNC_STAGE_CEILING");

    const exactlyAtThreshold = structuredClone(microscopicallyBelow);
    const terminal = exactlyAtThreshold.cells[0].rawMeasuredSamples[0];
    Reflect.set(terminal.timings, "candidateToLogicalReadyMs", 3000);
    Reflect.set(
      terminal.timings,
      "totalSampleWallMs",
      recordedWallLowerBound(terminal.timings),
    );
    expect(() => validatePointSensitivityResult(exactlyAtThreshold))
      .toThrow(/logical-ready ceiling/i);
  });

  it("uses directional tolerance only for inferred logical-ready ceiling proof", () => {
    const exactIndependentSum = structuredClone(truthfulDriftResult());
    const exactTerminal = exactIndependentSum.cells.at(-1)?.rawMeasuredSamples.at(-1);
    if (exactTerminal === undefined) throw new Error("Expected drift terminal sample fixture.");
    Reflect.set(exactTerminal.timings, "backendConstructionCpuMs", 500);
    Reflect.set(exactTerminal.timings, "sceneSetupCpuMs", 500);
    Reflect.set(exactTerminal.timings, "rendererInitWallMs", 2000);
    Reflect.set(exactTerminal.timings, "totalSampleWallMs", 3003);
    expect(validatePointSensitivityResult(exactIndependentSum).stopReason)
      .toBe("AUTO_BACKEND_DRIFT");

    const safelyAbove = structuredClone(exactIndependentSum);
    const aboveTerminal = safelyAbove.cells.at(-1)?.rawMeasuredSamples.at(-1);
    if (aboveTerminal === undefined) throw new Error("Expected drift terminal sample fixture.");
    Reflect.set(aboveTerminal.timings, "rendererInitWallMs", 2000.001);
    Reflect.set(aboveTerminal.timings, "totalSampleWallMs", 3003.001);
    expect(() => validatePointSensitivityResult(safelyAbove))
      .toThrow(/logical-ready ceiling/i);
  });

  it("rejects terminal owned-stage timing holes throughout the execution order", () => {
    const geometryHole = terminalResultForReason(
      "ROUTE_EXIT",
      "CANCELLED",
      "CANCELLED",
      {
        ...emptyTimings(),
        inputConstructionCpuMs: 1,
        geometryCreateCpuMs: 1,
        teardownCpuMs: 1,
        totalSampleWallMs: 3,
      },
    );
    const earlyHole = terminalResultForReason(
      "ROUTE_EXIT",
      "CANCELLED",
      "CANCELLED",
      {
        ...emptyTimings(),
        inputValidationCpuMs: 1,
        teardownCpuMs: 1,
        totalSampleWallMs: 2,
      },
    );
    for (const hostile of [geometryHole, earlyHole]) {
      expect(() => validatePointSensitivityResult(hostile)).toThrow(/execution prefix/i);
      expect(() => serializePointSensitivityResult(hostile)).toThrow(/execution prefix/i);
    }
  });

  it("rejects terminal causes outside the execution point where they are reachable", () => {
    const afterLogicalReady = terminalResultForReason(
      "ROUTE_EXIT",
      "CANCELLED",
      "CANCELLED",
      sample(1, 70).timings,
    );
    expect(() => validatePointSensitivityResult(afterLogicalReady))
      .toThrow(/unreachable after logical readiness|causal state/i);

    const beforeLogicalClock = terminalResultForReason(
      "LOGICAL_READY_CEILING",
      "STOPPED",
      "STOPPED",
    );
    expect(() => validatePointSensitivityResult(beforeLogicalClock))
      .toThrow(/predates the logical-ready clock|causal state/i);
  });

  it("binds terminal sample cleanup exactly to cell cleanup and its cause", () => {
    const cellNonzeroSampleZero = structuredClone(truthfulCleanupFailureResult());
    Reflect.set(
      cellNonzeroSampleZero.cells[0].rawMeasuredSamples[0],
      "cleanupOutcome",
      zeroCleanup,
    );
    expect(() => validatePointSensitivityResult(cellNonzeroSampleZero))
      .toThrow(/cleanup.*contradicts/i);

    const cellZeroSampleNonzero = structuredClone(truthfulCleanupFailureResult());
    Reflect.set(cellZeroSampleNonzero.cells[0], "cleanupOutcome", zeroCleanup);
    expect(() => validatePointSensitivityResult(cellZeroSampleNonzero))
      .toThrow(/cell cleanup contradicts/i);

    expect(validatePointSensitivityResult(truthfulCleanupFailureResult()).stopReason)
      .toBe("CLEANUP_INVARIANT_FAILURE");
  });

  it("preserves cleanup failure as the final cause after an earlier owned-stage ceiling", () => {
    const lawful = structuredClone(truthfulCleanupFailureResult());
    const terminal = lawful.cells[0].rawMeasuredSamples[0];
    Reflect.set(terminal, "actualBackend", null);
    Reflect.set(terminal, "timings", {
      ...emptyTimings(),
      inputConstructionCpuMs: 1000,
      teardownCpuMs: 1,
      totalSampleWallMs: 1001,
    });
    expect(validatePointSensitivityResult(lawful).stopReason)
      .toBe("CLEANUP_INVARIANT_FAILURE");
  });

  it("rejects sample, cell, and terminal backend contradictions", () => {
    const complete = result();
    const partial = truthfulPartialResult();

    const sampleContradiction = structuredClone(partial.cells[1]);
    Reflect.set(sampleContradiction.rawMeasuredSamples[0], "actualBackend", "WEBGL2");
    expect(() => validatePointSensitivityResult({
      ...partial,
      cells: [complete.cells[0], sampleContradiction],
    })).toThrow(/backend/i);

    const terminalContradiction = structuredClone(partial.cells[1]);
    const terminalSample = terminalContradiction.rawMeasuredSamples.at(-1);
    if (terminalSample === undefined) throw new Error("Expected hostile terminal sample.");
    Reflect.set(terminalSample, "actualBackend", "WEBGL2");
    expect(() => validatePointSensitivityResult({
      ...partial,
      cells: [complete.cells[0], terminalContradiction],
    })).toThrow(/terminal backend|causal state/i);

    const terminalBeforeMeasurement: PointSensitivityCellResult = {
      ...complete.cells[1],
      actualBackend: "WEBGL2",
      warmupStatus: "FAILED",
      rawMeasuredSamples: [],
      metricSummaries: createBenchmarkMetricSummaries([]),
      cleanupOutcome: zeroCleanup,
      cellOutcome: "FAILED",
      cellStopReason: "BACKEND_PROFILE_FAILURE",
    };
    expect(() => validatePointSensitivityResult({
      ...complete,
      cells: [complete.cells[0], terminalBeforeMeasurement],
      analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS,
      outcome: "FAILED",
      stopReason: "BACKEND_PROFILE_FAILURE",
    })).toThrow(/preceding.*backend|causal state/i);
  });

  it("requires admitted environment facts once a warm-up succeeds, even without valid measurements", () => {
    const warmupOnly = structuredClone(truthfulWarmupOnlyTerminalResult());
    Reflect.set(warmupOnly.environment, "drawingBufferWidth", 0);
    Reflect.set(warmupOnly.environment, "drawingBufferHeight", 0);
    Reflect.set(warmupOnly.environment, "devicePixelRatio", 0);
    Reflect.set(warmupOnly.environment, "rendererPixelRatio", 0);
    expect(() => validatePointSensitivityResult(warmupOnly))
      .toThrow(/environment|causal state/i);

    const uncapped = structuredClone(truthfulWarmupOnlyTerminalResult());
    Reflect.set(uncapped.environment, "rendererPixelRatio", 1);
    Reflect.set(uncapped.environment, "drawingBufferWidth", 800);
    Reflect.set(uncapped.environment, "drawingBufferHeight", 600);
    expect(() => validatePointSensitivityResult(uncapped))
      .toThrow(/environment|causal state/i);
  });

  it("keeps an independent exhaustive stop-reason classification", () => {
    expect(Object.keys(TEST_STOP_REASON_CLASSIFICATION)).toHaveLength(21);
    expect(Object.entries(TEST_STOP_REASON_CLASSIFICATION)
      .filter(([, classification]) => classification === "UNREACHABLE")
      .map(([reason]) => reason)
      .sort()).toEqual([
      "FORCED_BACKEND_MISMATCH",
      "PROVENANCE_UNAVAILABLE",
      "SOURCE_TREE_DIRTY",
    ]);
  });

  it("accepts PAGE_HIDDEN at the first executed guard and distinguishes a quiet cancellation", () => {
    const earliestExecuted = measuredTerminalResult({
      reason: "PAGE_HIDDEN",
      status: "INVALIDATED",
      outcome: "INVALIDATED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(0),
      validSampleCount: 0,
    });
    const quiet = measuredTerminalResult({
      reason: "ROUTE_EXIT",
      status: "CANCELLED",
      outcome: "CANCELLED",
      terminalBackend: "WEBGPU",
      terminalTimings: emptyTimings(),
      validSampleCount: 0,
    });
    expect(validatePointSensitivityResult(earliestExecuted).stopReason).toBe("PAGE_HIDDEN");
    expect(validatePointSensitivityResult(quiet).stopReason).toBe("ROUTE_EXIT");

    const confusedQuiet = structuredClone(earliestExecuted);
    const terminal = confusedQuiet.cells[0].rawMeasuredSamples[0];
    Reflect.set(terminal.timings, "teardownCpuMs", null);
    Reflect.set(terminal.timings, "totalSampleWallMs", null);
    expect(() => validatePointSensitivityResult(confusedQuiet)).toThrow(/causal state/i);
  });

  it("separates backend reporting from observation acceptance for warm-up and measured terminals", () => {
    const firstReportedPreaccept = warmupTerminalResult(
      "PAGE_HIDDEN",
      "INVALIDATED",
      "WEBGL2",
      false,
      false,
    );
    const firstAccepted = warmupTerminalResult(
      "PAGE_HIDDEN",
      "INVALIDATED",
      "WEBGL2",
      true,
      true,
    );
    const stableThenDifferentReport = measuredTerminalResult({
      reason: "PAGE_HIDDEN",
      status: "INVALIDATED",
      outcome: "INVALIDATED",
      terminalBackend: "WEBGL2",
      terminalTimings: executedPrefixTimings(5),
      validSampleCount: 0,
    });
    expect(validatePointSensitivityResult(firstReportedPreaccept).warnings).toEqual([]);
    expect(validatePointSensitivityResult(firstAccepted).warnings)
      .toEqual(["AUTO_DID_NOT_SELECT_WEBGPU"]);
    expect(validatePointSensitivityResult(stableThenDifferentReport).stopReason)
      .toBe("PAGE_HIDDEN");
  });

  it("requires accepted backend authority for render-submit failure and AUTO warning truth", () => {
    const nullBackendSubmit = measuredTerminalResult({
      reason: "RENDER_SUBMIT_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(9),
      validSampleCount: 0,
    });
    expect(() => validatePointSensitivityResult(nullBackendSubmit)).toThrow(/causal state/i);

    const missingWarning = structuredClone(result());
    for (const cellValue of missingWarning.cells) {
      Reflect.set(cellValue, "actualBackend", "WEBGL2");
      for (const measured of cellValue.rawMeasuredSamples) {
        Reflect.set(measured, "actualBackend", "WEBGL2");
      }
    }
    expect(() => validatePointSensitivityResult(missingWarning)).toThrow(/warning|causal state/i);
    expect(validatePointSensitivityResult(truthfulDriftResult()).stopReason)
      .toBe("AUTO_BACKEND_DRIFT");
  });

  it("requires full successful work for a teardown-only synchronous ceiling", () => {
    const teardownOnlyWithoutWork = measuredTerminalResult({
      reason: "SYNC_STAGE_CEILING",
      status: "STOPPED",
      outcome: "STOPPED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(0, { teardownCpuMs: 1000 }),
      validSampleCount: 0,
    });
    expect(() => validatePointSensitivityResult(teardownOnlyWithoutWork))
      .toThrow(/causal state|SYNC_STAGE_CEILING/i);

    const lawfulFullWork = measuredTerminalResult({
      reason: "SYNC_STAGE_CEILING",
      status: "STOPPED",
      outcome: "STOPPED",
      terminalBackend: "WEBGPU",
      terminalTimings: executedPrefixTimings(10, {
        candidateToLogicalReadyMs: 15,
        teardownCpuMs: 1000,
      }),
      validSampleCount: 0,
    });
    expect(validatePointSensitivityResult(lawfulFullWork).stopReason)
      .toBe("SYNC_STAGE_CEILING");
  });

  it("uses recorded logical-ready lower bounds without inventing hidden elapsed time", () => {
    const hiddenElapsedMayReachCeiling = measuredTerminalResult({
      reason: "LOGICAL_READY_CEILING",
      status: "STOPPED",
      outcome: "STOPPED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(3, { totalSampleWallMs: 3003 }),
      validSampleCount: 0,
    });
    expect(validatePointSensitivityResult(hiddenElapsedMayReachCeiling).stopReason)
      .toBe("LOGICAL_READY_CEILING");

    const higherPrioritySessionCause = measuredTerminalResult({
      reason: "PAGE_HIDDEN",
      status: "INVALIDATED",
      outcome: "INVALIDATED",
      terminalBackend: "WEBGL2",
      terminalTimings: executedPrefixTimings(5, {
        backendConstructionCpuMs: 999,
        sceneSetupCpuMs: 999,
        rendererInitWallMs: 1002,
      }),
      validSampleCount: 0,
    });
    expect(validatePointSensitivityResult(higherPrioritySessionCause).stopReason)
      .toBe("PAGE_HIDDEN");
  });

  it("restricts instrumentation to quiet and actual logical-clock call sites", () => {
    const quietInstrumentation = measuredTerminalResult({
      reason: "INSTRUMENTATION_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: "WEBGPU",
      terminalTimings: emptyTimings(),
      validSampleCount: 0,
    });
    const impossibleEarliestExecuted = measuredTerminalResult({
      reason: "INSTRUMENTATION_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(0),
      validSampleCount: 0,
    });
    const firstExecutedInstrumentation = measuredTerminalResult({
      reason: "INSTRUMENTATION_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(3),
      validSampleCount: 0,
    });
    const laterExecutedInstrumentation = measuredTerminalResult({
      reason: "INSTRUMENTATION_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: "WEBGPU",
      terminalTimings: executedPrefixTimings(8),
      validSampleCount: 0,
    });
    const instrumentationAfterLogicalReady = measuredTerminalResult({
      reason: "INSTRUMENTATION_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: "WEBGPU",
      terminalTimings: executedPrefixTimings(10, { candidateToLogicalReadyMs: 15 }),
      validSampleCount: 0,
    });

    expect(validatePointSensitivityResult(quietInstrumentation).stopReason)
      .toBe("INSTRUMENTATION_FAILURE");
    expect(validatePointSensitivityResult(firstExecutedInstrumentation).stopReason)
      .toBe("INSTRUMENTATION_FAILURE");
    expect(validatePointSensitivityResult(laterExecutedInstrumentation).stopReason)
      .toBe("INSTRUMENTATION_FAILURE");
    expect(() => validatePointSensitivityResult(impossibleEarliestExecuted))
      .toThrow(/causal state/i);
    expect(() => validatePointSensitivityResult(instrumentationAfterLogicalReady))
      .toThrow(/causal state/i);
    expect(validatePointSensitivityResult(instrumentationFailureResult()).stopReason)
      .toBe("INSTRUMENTATION_FAILURE");
  });

  it("preserves ordered guards around the logical-ready ceiling", () => {
    const thresholdTimings = executedPrefixTimings(5, {
      backendConstructionCpuMs: 999,
      sceneSetupCpuMs: 999,
      rendererInitWallMs: 1002.001,
    });
    const laterReasons = [
      ["AUTO_BACKEND_DRIFT", "WEBGL2", "STOPPED"],
      ["DRAWING_BUFFER_CHANGED", "WEBGPU", "INVALIDATED"],
      ["RENDERER_PIXEL_RATIO_CHANGED", "WEBGPU", "INVALIDATED"],
    ] as const;
    for (const [reason, backend, terminalOutcome] of laterReasons) {
      const hostile = measuredTerminalResult({
        reason,
        status: terminalOutcome,
        outcome: terminalOutcome,
        terminalBackend: backend,
        terminalTimings: thresholdTimings,
        validSampleCount: 0,
      });
      expect(() => validatePointSensitivityResult(hostile)).toThrow(/logical-ready ceiling/i);
    }
  });

  it("keeps cleanup orthogonal and cannot use it to validate an impossible base history", () => {
    const cleanupAfterEarlyStop = measuredTerminalResult({
      reason: "CLEANUP_INVARIANT_FAILURE",
      status: "FAILED",
      outcome: "FAILED",
      terminalBackend: null,
      terminalTimings: executedPrefixTimings(1),
      validSampleCount: 0,
    });
    const terminal = cleanupAfterEarlyStop.cells[0].rawMeasuredSamples[0];
    Reflect.set(terminal, "cleanupOutcome", nonzeroCleanup);
    Reflect.set(cleanupAfterEarlyStop.cells[0], "cleanupOutcome", nonzeroCleanup);
    expect(validatePointSensitivityResult(cleanupAfterEarlyStop).stopReason)
      .toBe("CLEANUP_INVARIANT_FAILURE");

    const impossible = structuredClone(cleanupAfterEarlyStop);
    Reflect.set(impossible.cells[0].rawMeasuredSamples[0], "actualBackend", "WEBGPU");
    expect(() => validatePointSensitivityResult(impossible)).toThrow(/causal state/i);
  });

  it("rejects bounded single-axis and selected paired cross-field mutations", () => {
    type Mutation = (value: PointSensitivityResult) => void;
    const mutations: Readonly<Record<"backend" | "stopReason" | "timing" | "environment" | "cleanup", Mutation>> = {
      backend(value) {
        const terminal = value.cells.at(-1)?.rawMeasuredSamples.at(-1);
        if (terminal === undefined) throw new Error("Expected terminal drift sample.");
        Reflect.set(terminal, "actualBackend", "WEBGPU");
      },
      stopReason(value) {
        const cellValue = value.cells.at(-1);
        const terminal = cellValue?.rawMeasuredSamples.at(-1);
        if (cellValue === undefined || terminal === undefined) {
          throw new Error("Expected terminal drift cell.");
        }
        Reflect.set(terminal, "stopReason", "FORCED_BACKEND_MISMATCH");
        Reflect.set(cellValue, "cellStopReason", "FORCED_BACKEND_MISMATCH");
        Reflect.set(value, "stopReason", "FORCED_BACKEND_MISMATCH");
      },
      timing(value) {
        const terminal = value.cells.at(-1)?.rawMeasuredSamples.at(-1);
        if (terminal === undefined) throw new Error("Expected terminal drift sample.");
        Reflect.set(terminal.timings, "geometrySelectCpuMs", 1);
      },
      environment(value) {
        Reflect.set(value.environment, "drawingBufferWidth", 0);
      },
      cleanup(value) {
        const cellValue = value.cells.at(-1);
        const terminal = cellValue?.rawMeasuredSamples.at(-1);
        if (cellValue === undefined || terminal === undefined) {
          throw new Error("Expected terminal drift cell.");
        }
        Reflect.set(terminal, "cleanupOutcome", nonzeroCleanup);
        Reflect.set(cellValue, "cleanupOutcome", nonzeroCleanup);
      },
    };
    const cases: readonly (readonly (keyof typeof mutations)[])[] = [
      ["backend"], ["stopReason"], ["timing"], ["environment"], ["cleanup"],
      ["backend", "environment"],
      ["stopReason", "timing"],
      ["timing", "cleanup"],
      ["backend", "cleanup"],
    ];
    for (const mutationNames of cases) {
      const hostile = structuredClone(truthfulDriftResult());
      for (const name of mutationNames) mutations[name](hostile);
      expect(
        () => serializePointSensitivityResult(hostile),
        `expected ${mutationNames.join("+")} mutation to reject`,
      ).toThrow();
    }
  });

  it("serializes and round-trips every lawful terminal shape", () => {
    for (const value of [
      truthfulWarmupFailureResult(),
      warmupTerminalResult("PAGE_HIDDEN", "INVALIDATED", "WEBGL2", false, false),
      warmupTerminalResult("PAGE_HIDDEN", "INVALIDATED", "WEBGL2", true, true),
      truthfulWarmupOnlyTerminalResult(),
      truthfulPartialResult(),
      truthfulDriftResult(),
      truthfulCleanupFailureResult(),
      measuredTerminalResult({
        reason: "PAGE_HIDDEN",
        status: "INVALIDATED",
        outcome: "INVALIDATED",
        terminalBackend: null,
        terminalTimings: executedPrefixTimings(0),
        validSampleCount: 0,
      }),
      measuredTerminalResult({
        reason: "ROUTE_EXIT",
        status: "CANCELLED",
        outcome: "CANCELLED",
        terminalBackend: "WEBGPU",
        terminalTimings: emptyTimings(),
        validSampleCount: 0,
      }),
      measuredTerminalResult({
        reason: "SYNC_STAGE_CEILING",
        status: "STOPPED",
        outcome: "STOPPED",
        terminalBackend: "WEBGPU",
        terminalTimings: executedPrefixTimings(10, {
          candidateToLogicalReadyMs: 15,
          teardownCpuMs: 1000,
        }),
        validSampleCount: 0,
      }),
      instrumentationFailureResult(),
      result(),
    ]) {
      const serialized = serializePointSensitivityResult(value);
      const parsed: unknown = JSON.parse(serialized);
      expect(validatePointSensitivityResult(parsed)).toEqual(value);
    }
  });

  it("serializes a complete result deterministically with a distinct filename", () => {
    const value = result();
    const serialized = serializePointSensitivityResult(value);
    const parsed: unknown = JSON.parse(serialized);
    expect(serialized).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(validatePointSensitivityResult(parsed)).toEqual(value);
    expect(pointSensitivityResultFilename(value)).toBe("mira-r2ca-s1-v01-2026-08-09T00-00-00.000Z.json");
  });

  it("mutually rejects parent Result v2 and rejects foreign S1 identity", () => {
    const value = result();
    expect(() => validateRendererBenchmarkResult(value)).toThrow(/schema|shape/);
    const parentV2 = structuredClone(value);
    Reflect.set(parentV2, "schema", "mira.render-lab.r2ca-result");
    Reflect.set(parentV2, "version", 2);
    Reflect.deleteProperty(parentV2, "experiment");
    Reflect.deleteProperty(parentV2, "generatorVersion");
    Reflect.deleteProperty(parentV2, "analysis");
    expect(() => validatePointSensitivityResult(parentV2)).toThrow(/shape|identity/);
    expect(() => validatePointSensitivityResult({
      ...value,
      experiment: "R2C-A-S1-FOREIGN",
    })).toThrow(/identity/);
  });
});
