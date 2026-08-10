import { describe, expect, it } from "vitest";
import { EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS, createControlPointTessellationAnalysis } from "../benchmark-control-point-tessellation-analysis";
import { CONTROL_POINT_TESSELLATION_SEED } from "../benchmark-control-point-tessellation-input";
import {
  CONTROL_POINT_TESSELLATION_CELL_ORDER,
  CONTROL_POINT_TESSELLATION_RESULT_SCHEMA,
  controlPointTessellationComplexity,
  controlPointTessellationResultFilename,
  controlPointTessellationSessionConfiguration,
  serializeControlPointTessellationResult,
  validateControlPointTessellationResult,
  type ControlPointTessellationCellResult,
  type ControlPointTessellationResult,
} from "../benchmark-control-point-tessellation-result";
import { validatePointSensitivityResult } from "../benchmark-point-sensitivity-result";
import {
  createBenchmarkMetricSummaries,
  validateRendererBenchmarkResult,
  type BenchmarkMeasuredSample,
  type BenchmarkSampleTimings,
} from "../benchmark-result";

const zeroCleanup = {
  status: "ZERO" as const,
  candidateHosts: 0, activeHosts: 0, canvases: 0, observers: 0,
  timers: 0, animationFrames: 0, backends: 0, geometries: 0,
  finalOwnedResources: 0,
};

function sample(
  ordinal: number,
  geometryCreateCpuMs: number,
  actualBackend: "WEBGPU" | "WEBGL2" = "WEBGPU",
): BenchmarkMeasuredSample {
  const timings: BenchmarkSampleTimings = {
    inputConstructionCpuMs: 1,
    inputValidationCpuMs: 1,
    backendConstructionCpuMs: 1,
    sceneSetupCpuMs: 1,
    rendererInitWallMs: 1,
    geometrySelectCpuMs: 1,
    geometryCreateCpuMs,
    geometryMergeCpuMs: 1,
    geometryFinalizeCpuMs: 1,
    firstRenderSubmitCpuMs: 1,
    candidateToLogicalReadyMs: 200,
    teardownCpuMs: 1,
    totalSampleWallMs: 203,
  };
  return {
    ordinal,
    status: "VALID",
    actualBackend,
    timings,
    cleanupOutcome: zeroCleanup,
    stopReason: "NONE",
  };
}

function cells(
  valueFor: (index: number) => number,
  actualBackend: "WEBGPU" | "WEBGL2" = "WEBGPU",
): readonly ControlPointTessellationCellResult[] {
  return CONTROL_POINT_TESSELLATION_CELL_ORDER.map((identity, index) => {
    const samples = [1, 2, 3, 4, 5].map((ordinal) =>
      sample(ordinal, valueFor(index), actualBackend));
    return {
      strandCount: identity.strandCount,
      pointsPerStrand: identity.pointsPerStrand,
      ...controlPointTessellationComplexity(identity.pointsPerStrand, identity.tubularSegments),
      radialSegments: 4,
      requestedBackend: "AUTO",
      actualBackend,
      warmupStatus: "VALID",
      rawMeasuredSamples: samples,
      metricSummaries: createBenchmarkMetricSummaries(samples),
      cleanupOutcome: zeroCleanup,
      cellOutcome: "COMPLETE",
      cellStopReason: "NONE",
    };
  });
}

function analysisFor(completeCells: readonly ControlPointTessellationCellResult[]) {
  return createControlPointTessellationAnalysis(completeCells.map((cell) => ({
    strandCount: cell.strandCount,
    pointsPerStrand: cell.pointsPerStrand,
    tubularSegments: cell.tubularSegmentsPerStrand,
    geometryCreateCpuMs: cell.rawMeasuredSamples.map((entry) => {
      const value = entry.timings.geometryCreateCpuMs;
      if (value === null) throw new Error("Fixture geometry timing is missing.");
      return value;
    }),
  })));
}

function result(
  valueFor: (index: number) => number = (index) => 10 + index * 5,
  actualBackend: "WEBGPU" | "WEBGL2" = "WEBGPU",
):
ControlPointTessellationResult {
  const completeCells = cells(valueFor, actualBackend);
  return {
    schema: CONTROL_POINT_TESSELLATION_RESULT_SCHEMA,
    version: 1,
    experiment: "R2C-A-S2",
    measurementContract: "r2ca-s2-v0.1",
    generatorVersion: "r2ca-s2-synthetic-generator/v1",
    classification: "BENCHMARK_ONLY",
    source: {
      kind: "LOCAL_GIT",
      commit: "a".repeat(40),
      branch: "main",
      treeState: "CLEAN",
      observedAt: "2026-08-10T00:00:00.000Z",
      nextVersion: "16.2.7",
      threeVersion: "0.185.1",
      generatorVersion: "r2ca-s2-synthetic-generator/v1",
      geometryRecipe: "RADIAL_CROWN_FALL_V1",
      seed: CONTROL_POINT_TESSELLATION_SEED,
    },
    environment: {
      rawUserAgent: "Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36",
      browserEngine: "CHROMIUM_FAMILY",
      declaredBrowserProduct: "CHROME",
      declaredBrowserMajor: 151,
      actualBrowserProduct: "CHROME",
      actualBrowserMajor: 151,
      rawBrowserVersionEvidence: {
        userAgent: "Mozilla/5.0 Chrome/151.0.0.0 Safari/537.36",
        userAgentDataBrands: [
          { brand: "Chromium", version: "151" },
          { brand: "Google Chrome", version: "151" },
        ],
      },
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
      startedAt: "2026-08-10T00:00:00.000Z",
      endedAt: "2026-08-10T00:01:00.000Z",
    },
    sessionConfiguration: controlPointTessellationSessionConfiguration(),
    cells: completeCells,
    analysis: analysisFor(completeCells),
    outcome: "COMPLETE",
    stopReason: "NONE",
    warnings: actualBackend === "WEBGL2" ? ["AUTO_DID_NOT_SELECT_WEBGPU"] : [],
  };
}

function warmupDriftResult(
  acceptedBackend: "WEBGPU" | "WEBGL2",
  reportedBackend: "WEBGPU" | "WEBGL2",
): ControlPointTessellationResult {
  const value = result(undefined, acceptedBackend);
  const terminal = value.cells[1];
  if (terminal === undefined) throw new Error("Terminal fixture cell is missing.");
  return {
    ...value,
    cells: [
      value.cells[0],
      {
        ...terminal,
        actualBackend: reportedBackend,
        warmupStatus: "STOPPED",
        rawMeasuredSamples: [],
        metricSummaries: createBenchmarkMetricSummaries([]),
        cellOutcome: "STOPPED",
        cellStopReason: "AUTO_BACKEND_DRIFT",
      },
    ],
    analysis: EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS,
    outcome: "STOPPED",
    stopReason: "AUTO_BACKEND_DRIFT",
  };
}

describe("R2C-A-S2 Result v1", () => {
  it("validates exact eight-cell raw evidence and deterministically serializes", () => {
    const value = result();
    expect(validateControlPointTessellationResult(value)).toEqual(value);
    const serialized = serializeControlPointTessellationResult(value);
    expect(serialized).toBe(`${JSON.stringify(value, null, 2)}\n`);
    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized.endsWith("\n\n")).toBe(false);
    expect(controlPointTessellationResultFilename(value)).toBe(
      "mira-r2ca-s2-v01-2026-08-10T00-00-00.000Z.json",
    );
  });

  it("protects canonical schedule and validation authority against runtime mutation", () => {
    const expectedOrder = CONTROL_POINT_TESSELLATION_CELL_ORDER.map((entry) => ({ ...entry }));
    expect(() => {
      Array.prototype.reverse.call(CONTROL_POINT_TESSELLATION_CELL_ORDER);
    }).toThrow(TypeError);
    expect(() => {
      Array.prototype.splice.call(CONTROL_POINT_TESSELLATION_CELL_ORDER, 0, 1);
    }).toThrow(TypeError);
    expect(Reflect.set(
      CONTROL_POINT_TESSELLATION_CELL_ORDER[0],
      "strandCount",
      1152,
    )).toBe(false);
    expect(CONTROL_POINT_TESSELLATION_CELL_ORDER).toEqual(expectedOrder);

    const configuration = controlPointTessellationSessionConfiguration();
    expect(Reflect.set(configuration, "warmupSamplesPerCell", 99)).toBe(false);
    expect(Reflect.set(configuration.cellOrder[0], "tubularSegments", 21)).toBe(false);

    const tampered = structuredClone(result());
    Array.prototype.reverse.call(tampered.sessionConfiguration.cellOrder);
    expect(() => validateControlPointTessellationResult(tampered)).toThrow(/schedule/);
    expect(validateControlPointTessellationResult(result()).sessionConfiguration.cellOrder)
      .toEqual(expectedOrder);
  });

  it.each([
    ["WEBGPU", "WEBGL2"],
    ["WEBGL2", "WEBGPU"],
  ] as const)(
    "retains a rejected %s-to-%s warm-up report without changing accepted authority",
    (acceptedBackend, reportedBackend) => {
      const value = warmupDriftResult(acceptedBackend, reportedBackend);
      const validated = validateControlPointTessellationResult(value);
      expect(validated.cells[0].actualBackend).toBe(acceptedBackend);
      expect(validated.cells[1].actualBackend).toBe(reportedBackend);
      expect(validated.cells[1].cellStopReason).toBe("AUTO_BACKEND_DRIFT");
      expect(validated.warnings).toEqual(
        acceptedBackend === "WEBGL2" ? ["AUTO_DID_NOT_SELECT_WEBGPU"] : [],
      );
      expect(validated.analysis).toEqual(EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS);
      expect(serializeControlPointTessellationResult(value)).toContain(reportedBackend);
    },
  );

  it("mutually rejects parent Result v2 and S1 Result v1 identities", () => {
    const value = result();
    expect(() => validateRendererBenchmarkResult(value)).toThrow();
    expect(() => validatePointSensitivityResult(value)).toThrow();
    expect(() => validateControlPointTessellationResult({
      ...value,
      schema: "mira.render-lab.r2ca-s1-result",
      experiment: "R2C-A-S1",
    })).toThrow(/identity/);
  });

  it("rejects reordered cells, browser contradictions, summaries, and serialized analysis tampering", () => {
    const value = result();
    expect(() => validateControlPointTessellationResult({
      ...value,
      cells: [value.cells[1], value.cells[0], ...value.cells.slice(2)],
    })).toThrow(/order/);
    expect(() => validateControlPointTessellationResult({
      ...value,
      environment: { ...value.environment, actualBrowserMajor: 150 },
    })).toThrow(/contradictory/);
    expect(() => validateControlPointTessellationResult({
      ...value,
      cells: [{ ...value.cells[0], metricSummaries: {} }, ...value.cells.slice(1)],
    })).toThrow(/summaries/);
    expect(() => validateControlPointTessellationResult({
      ...value,
      analysis: {
        ...value.analysis,
        pointPositiveAcross: !value.analysis.pointPositiveAcross,
      },
    })).toThrow(/recompute/);
  });

  it("requires FAILED/INSTRUMENTATION_FAILURE with no disposition for G <= 0", () => {
    const value = result();
    const zeroCells = cells(() => 0);
    const failed = {
      ...value,
      cells: zeroCells,
      analysis: EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS,
      outcome: "FAILED",
      stopReason: "INSTRUMENTATION_FAILURE",
    };
    expect(validateControlPointTessellationResult(failed)).toMatchObject({
      outcome: "FAILED",
      stopReason: "INSTRUMENTATION_FAILURE",
      analysis: { disposition: null, nextInvestigationClass: null },
    });
  });
});
