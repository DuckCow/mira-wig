import { describe, expect, it } from "vitest";
import { RENDERER_BENCHMARK_SEED } from "../benchmark-input";
import {
  CHARACTERIZATION_PROFILE_ORDER,
  RENDERER_BENCHMARK_MEASUREMENT_CONTRACT,
  RENDERER_BENCHMARK_RESULT_SCHEMA,
  createBenchmarkMetricSummaries,
  serializeRendererBenchmarkResult,
  validateRendererBenchmarkResult,
  type BenchmarkMeasuredSample,
  type BenchmarkOwnedResources,
  type BenchmarkSampleTimings,
  type RendererBenchmarkResult,
} from "../benchmark-result";

const zeroResources: BenchmarkOwnedResources = {
  candidateHosts: 0,
  activeHosts: 0,
  canvases: 0,
  observers: 0,
  timers: 0,
  animationFrames: 0,
  backends: 0,
  geometries: 0,
  finalOwnedResources: 0,
};

function timings(value: number): BenchmarkSampleTimings {
  return {
    inputConstructionCpuMs: value,
    inputValidationCpuMs: value + 1,
    backendConstructionCpuMs: value + 2,
    sceneSetupCpuMs: value + 3,
    rendererInitWallMs: value + 4,
    geometrySelectCpuMs: value + 5,
    geometryCreateCpuMs: value + 6,
    geometryMergeCpuMs: value + 7,
    geometryFinalizeCpuMs: value + 8,
    firstRenderSubmitCpuMs: value + 9,
    candidateToLogicalReadyMs: value + 10,
    teardownCpuMs: value + 11,
    totalSampleWallMs: value + 12,
  };
}

function nullTimings(): BenchmarkSampleTimings {
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

function replaceCell(
  result: RendererBenchmarkResult,
  index: number,
  replacement: unknown,
): unknown {
  return {
    ...result,
    cells: result.cells.map((cell, cellIndex) => cellIndex === index ? replacement : cell),
  };
}

function nonzeroSamples(cell: RendererBenchmarkResult["cells"][number]): readonly unknown[] {
  return cell.rawMeasuredSamples.map((entry) => ({
    ...entry,
    cleanupOutcome: {
      ...entry.cleanupOutcome,
      backends: 1,
      finalOwnedResources: 1,
      status: "NONZERO",
    },
  }));
}

function samplesWithBackend(
  cell: RendererBenchmarkResult["cells"][number],
  actualBackend: "WEBGPU" | "WEBGL2",
): readonly unknown[] {
  return cell.rawMeasuredSamples.map((entry) => ({ ...entry, actualBackend }));
}

function sample(ordinal: number): BenchmarkMeasuredSample {
  return {
    ordinal,
    status: "VALID",
    actualBackend: "WEBGL2",
    timings: timings(ordinal),
    cleanupOutcome: { status: "ZERO", ...zeroResources },
    stopReason: "NONE",
  };
}

function smokeResult(): RendererBenchmarkResult {
  const samples = [sample(1)];
  return {
    schema: RENDERER_BENCHMARK_RESULT_SCHEMA,
    version: 2,
    measurementContract: RENDERER_BENCHMARK_MEASUREMENT_CONTRACT,
    classification: "BENCHMARK_ONLY",
    source: {
      kind: "LOCAL_GIT",
      commit: "a".repeat(40),
      branch: "feat/benchmark",
      treeState: "DIRTY",
      observedAt: "2026-08-09T00:00:00.000Z",
      nextVersion: "16.2.7",
      threeVersion: "0.185.1",
      generatorVersion: "r2ca-synthetic-generator/v1",
      geometryRecipe: "RADIAL_CROWN_FALL_V1",
      seed: RENDERER_BENCHMARK_SEED,
    },
    environment: {
      rawUserAgent: "test browser",
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
      endedAt: "2026-08-09T00:00:01.000Z",
    },
    sessionConfiguration: {
      runKind: "VERIFICATION_SMOKE",
      decisionBearing: false,
      strandLevels: [72],
      pointsPerStrand: 6,
      requestedBackends: ["AUTO", "WEBGL2"],
      profileOrderByLevel: CHARACTERIZATION_PROFILE_ORDER.slice(0, 1),
      warmupSamplesPerCell: 1,
      measuredSamplesPerCell: 1,
      previewColor: "#34251F",
      density: "HIGH",
      yaw: 0,
      pitch: 0,
      syncStageCeilingMs: 1000,
      logicalReadyCeilingMs: 3000,
      sessionCeilingMs: 900000,
    },
    cells: [{
      strandCount: 72,
      pointsPerStrand: 6,
      requestedBackend: "AUTO",
      actualBackend: "WEBGL2",
      warmupStatus: "VALID",
      rawMeasuredSamples: samples,
      metricSummaries: createBenchmarkMetricSummaries(samples),
      cleanupOutcome: { status: "ZERO", ...zeroResources },
      cellOutcome: "COMPLETE",
      cellStopReason: "NONE",
    }, {
      strandCount: 72,
      pointsPerStrand: 6,
      requestedBackend: "WEBGL2",
      actualBackend: "WEBGL2",
      warmupStatus: "VALID",
      rawMeasuredSamples: samples,
      metricSummaries: createBenchmarkMetricSummaries(samples),
      cleanupOutcome: { status: "ZERO", ...zeroResources },
      cellOutcome: "COMPLETE",
      cellStopReason: "NONE",
    }],
    outcome: "COMPLETE",
    stopReason: "NONE",
    warnings: ["NON_DECISION_BEARING", "AUTO_DID_NOT_SELECT_WEBGPU"],
  };
}

function characterizationResult(): RendererBenchmarkResult {
  const smoke = smokeResult();
  const cells = CHARACTERIZATION_PROFILE_ORDER.flatMap((level) =>
    level.requestedBackends.map((requestedBackend) => {
      const measured = [1, 2, 3, 4, 5].map(sample);
      return {
        ...smoke.cells[0],
        strandCount: level.strandCount,
        requestedBackend,
        rawMeasuredSamples: measured,
        metricSummaries: createBenchmarkMetricSummaries(measured),
      };
    }),
  );
  return {
    ...smoke,
    source: { ...smoke.source, treeState: "CLEAN" },
    sessionConfiguration: {
      ...smoke.sessionConfiguration,
      runKind: "CHARACTERIZATION",
      decisionBearing: true,
      strandLevels: [72, 144, 288, 576, 1152],
      profileOrderByLevel: CHARACTERIZATION_PROFILE_ORDER,
      measuredSamplesPerCell: 5,
    },
    cells,
    warnings: ["AUTO_DID_NOT_SELECT_WEBGPU"],
  };
}

describe("R2C-A Result v2", () => {
  it("accepts exact smoke evidence and serializes deterministically with one LF", () => {
    const result = smokeResult();
    const serialized = serializeRendererBenchmarkResult(result);

    expect(validateRendererBenchmarkResult(JSON.parse(serialized))).toEqual(result);
    expect(serialized).toBe(`${JSON.stringify(result, null, 2)}\n`);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
  });

  it("rejects unknown identity fields, invalid dates, and nonzero valid cleanup", () => {
    const result = smokeResult();
    const invalidCleanupCell = {
      ...result.cells[0],
      rawMeasuredSamples: nonzeroSamples(result.cells[0]),
    };
    expect(() => validateRendererBenchmarkResult({ ...result, customerId: "forbidden" })).toThrow(/exact result shape/);
    expect(() => validateRendererBenchmarkResult({
      ...result,
      environment: { ...result.environment, endedAt: "2026-08-08T00:00:00.000Z" },
    })).toThrow(/must not follow/);
    const invalidCleanup = replaceCell(result, 0, invalidCleanupCell);
    expect(() => validateRendererBenchmarkResult(invalidCleanup)).toThrow(/valid evidence/);
  });

  it("recomputes every summary from valid raw values and excludes stopped samples", () => {
    const result = smokeResult();
    const invalidSummary = {
      ...result.cells[0].metricSummaries,
      inputConstructionCpuMs: {
        ...result.cells[0].metricSummaries.inputConstructionCpuMs,
        median: 99,
      },
    };
    const invalidSummaryResult = replaceCell(result, 0, {
      ...result.cells[0],
      metricSummaries: invalidSummary,
    });
    expect(() => validateRendererBenchmarkResult(invalidSummaryResult)).toThrow(/exactly recompute/);

    const stopped: BenchmarkMeasuredSample = {
      ordinal: 2,
      status: "STOPPED",
      actualBackend: "WEBGL2",
      timings: nullTimings(),
      cleanupOutcome: { status: "ZERO", ...zeroResources },
      stopReason: "SYNC_STAGE_CEILING",
    };
    expect(createBenchmarkMetricSummaries([sample(1), stopped]).inputConstructionCpuMs).toEqual({
      count: 1,
      median: 1,
      minimum: 1,
      maximum: 1,
      rawValues: [1],
    });
  });

  it("rejects valid evidence at or above every frozen per-sample ceiling", () => {
    const result = smokeResult();
    const synchronousNames = [
      "inputConstructionCpuMs",
      "inputValidationCpuMs",
      "backendConstructionCpuMs",
      "sceneSetupCpuMs",
      "geometrySelectCpuMs",
      "geometryCreateCpuMs",
      "geometryMergeCpuMs",
      "geometryFinalizeCpuMs",
      "firstRenderSubmitCpuMs",
      "teardownCpuMs",
    ] as const;
    for (const name of synchronousNames) {
      for (const value of [1000, 1001]) {
        const changed = {
          ...result.cells[0].rawMeasuredSamples[0],
          timings: { ...result.cells[0].rawMeasuredSamples[0].timings, [name]: value },
        };
        expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
          ...result.cells[0],
          rawMeasuredSamples: [changed],
        }))).toThrow(/synchronous ceiling/);
      }
    }
    for (const value of [3000, 3001]) {
      const changed = {
        ...result.cells[0].rawMeasuredSamples[0],
        timings: {
          ...result.cells[0].rawMeasuredSamples[0].timings,
          candidateToLogicalReadyMs: value,
        },
      };
      expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
        ...result.cells[0],
        rawMeasuredSamples: [changed],
      }))).toThrow(/logical-ready ceiling/);
    }
    const longInit = {
      ...result.cells[0].rawMeasuredSamples[0],
      timings: { ...result.cells[0].rawMeasuredSamples[0].timings, rendererInitWallMs: 5000 },
    };
    expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
      ...result.cells[0],
      rawMeasuredSamples: [longInit],
      metricSummaries: createBenchmarkMetricSummaries([longInit]),
    }))).not.toThrow();
  });

  it("rejects smoke overflow, forced-backend mismatch, AUTO drift, and profile skips", () => {
    const result = smokeResult();
    const overflowSamples = [sample(1), sample(2)];
    const overflow = replaceCell(result, 0, {
      ...result.cells[0],
      rawMeasuredSamples: overflowSamples,
      metricSummaries: createBenchmarkMetricSummaries(overflowSamples),
    });
    expect(() => validateRendererBenchmarkResult(overflow)).toThrow(/cardinality/);
    const forcedMismatch = replaceCell(result, 1, {
      ...result.cells[1],
      actualBackend: "WEBGPU",
      rawMeasuredSamples: samplesWithBackend(result.cells[1], "WEBGPU"),
    });
    expect(() => validateRendererBenchmarkResult(forcedMismatch)).toThrow(/forced WEBGL2/);

    const characterization = {
      ...result,
      source: { ...result.source, treeState: "CLEAN" },
      sessionConfiguration: {
        ...result.sessionConfiguration,
        runKind: "CHARACTERIZATION",
        decisionBearing: true,
        strandLevels: [72, 144, 288, 576, 1152],
        profileOrderByLevel: CHARACTERIZATION_PROFILE_ORDER,
        measuredSamplesPerCell: 5,
      },
      cells: [{
        ...result.cells[0],
        strandCount: 144,
        rawMeasuredSamples: [],
        metricSummaries: createBenchmarkMetricSummaries([]),
        cellOutcome: "STOPPED",
        cellStopReason: "BACKEND_PROFILE_FAILURE",
      }],
      outcome: "STOPPED",
      stopReason: "BACKEND_PROFILE_FAILURE",
      warnings: [],
    };
    expect(() => validateRendererBenchmarkResult(characterization)).toThrow(/prior/);
  });

  it("rejects contradictory sample, cell, and run terminal mappings", () => {
    const result = smokeResult();
    const contradictorySample = {
      ...result.cells[0].rawMeasuredSamples[0],
      status: "CANCELLED",
      stopReason: "SYNC_STAGE_CEILING",
      timings: nullTimings(),
    };
    expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
      ...result.cells[0],
      rawMeasuredSamples: [contradictorySample],
      metricSummaries: createBenchmarkMetricSummaries([]),
    }))).toThrow(/status contradicts/);

    expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
      ...result.cells[0],
      cellOutcome: "CANCELLED",
      cellStopReason: "LOGICAL_READY_CEILING",
    }))).toThrow(/outcome contradicts/);
    expect(() => validateRendererBenchmarkResult({
      ...result,
      outcome: "STOPPED",
      stopReason: "ROUTE_EXIT",
    })).toThrow(/outcome contradicts/);
    expect(() => validateRendererBenchmarkResult({
      ...result,
      outcome: "FAILED",
      stopReason: "CANCELLED_BY_OPERATOR",
    })).toThrow(/outcome contradicts/);
  });

  it("requires actual backend authority for valid samples and complete cells", () => {
    const result = smokeResult();
    const samplesWithoutBackend = result.cells[0].rawMeasuredSamples.map((entry) => ({
      ...entry,
      actualBackend: null,
    }));
    expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
      ...result.cells[0],
      rawMeasuredSamples: samplesWithoutBackend,
    }))).toThrow(/requires an actual backend/);
    expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
      ...result.cells[0],
      actualBackend: null,
    }))).toThrow(/backend|complete outcome/);
  });

  it("requires the immediately prior level for each backend profile", () => {
    const result = characterizationResult();
    expect(validateRendererBenchmarkResult(result)).toEqual(result);
    const skipped = {
      ...result,
      cells: result.cells.filter((cell) =>
        !(cell.strandCount === 144 && cell.requestedBackend === "AUTO"),
      ),
      outcome: "STOPPED",
      stopReason: "LOGICAL_READY_CEILING",
    };
    expect(() => validateRendererBenchmarkResult(skipped)).toThrow(/immediately prior/);
  });

  it("enforces fixed environment evidence and positive complete buffers", () => {
    const result = smokeResult();
    expect(() => validateRendererBenchmarkResult({
      ...result,
      environment: { ...result.environment, cssViewportWidth: 799 },
    })).toThrow(/must be 800/);
    expect(() => validateRendererBenchmarkResult({
      ...result,
      environment: { ...result.environment, drawingBufferWidth: 0 },
    })).toThrow(/positive buffer/);
    expect(() => validateRendererBenchmarkResult({
      ...result,
      environment: { ...result.environment, devicePixelRatio: 0 },
    })).toThrow(/positive buffer/);
    expect(() => validateRendererBenchmarkResult({
      ...result,
      environment: { ...result.environment, drawingBufferWidth: 1599 },
    })).toThrow(/exactly match/);
    expect(() => validateRendererBenchmarkResult({
      ...result,
      environment: { ...result.environment, drawingBufferHeight: 1199 },
    })).toThrow(/exactly match/);
  });

  it("requires raw measured ordinals to be exactly 1..N", () => {
    const result = characterizationResult();
    const changed = result.cells[0].rawMeasuredSamples.map((entry, index) =>
      index === 1 ? { ...entry, ordinal: 1 } : entry,
    );
    expect(() => validateRendererBenchmarkResult(replaceCell(result, 0, {
      ...result.cells[0],
      rawMeasuredSamples: changed,
      metricSummaries: createBenchmarkMetricSummaries(changed),
    }))).toThrow(/ordinals/);
  });
});
