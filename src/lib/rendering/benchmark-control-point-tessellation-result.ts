import {
  EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS,
  createControlPointTessellationAnalysis,
  type ControlPointTessellationAnalysis,
  type ControlPointTessellationMeasuredCellEvidence,
} from "./benchmark-control-point-tessellation-analysis";
import {
  admitControlPointTessellationBrowser,
  validateRawBrowserVersionEvidence,
  type ControlPointTessellationBrowserProduct,
  type RawBrowserVersionEvidence,
} from "./benchmark-control-point-tessellation-browser-admission";
import {
  CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
  CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE,
  CONTROL_POINT_TESSELLATION_SEED,
  type ControlPointTessellationPointsPerStrand,
  type ControlPointTessellationStrandCount,
  type ControlPointTessellationTubularSegments,
} from "./benchmark-control-point-tessellation-input";
import type { ControlPointTessellationSourceProvenance } from "./benchmark-control-point-tessellation-provenance.server";
import {
  POINT_SENSITIVITY_EXPERIMENT,
  POINT_SENSITIVITY_MEASUREMENT_CONTRACT,
  POINT_SENSITIVITY_RESULT_SCHEMA,
  pointSensitivityComplexity,
  pointSensitivitySessionConfiguration,
  validatePointSensitivityResult,
} from "./benchmark-point-sensitivity-result";
import {
  benchmarkTerminalOutcome,
  type ActualRendererBackend,
  type BenchmarkCellOutcome,
  type BenchmarkCleanupOutcome,
  type BenchmarkMeasuredSample,
  type BenchmarkMetricSummaries,
  type BenchmarkOperatorDeclaration,
  type BenchmarkRunOutcome,
  type BenchmarkStopReason,
  type BenchmarkWarmupStatus,
} from "./benchmark-result";

export const CONTROL_POINT_TESSELLATION_RESULT_SCHEMA =
  "mira.render-lab.r2ca-s2-result";
export const CONTROL_POINT_TESSELLATION_RESULT_VERSION = 1;
export const CONTROL_POINT_TESSELLATION_EXPERIMENT = "R2C-A-S2";
export const CONTROL_POINT_TESSELLATION_MEASUREMENT_CONTRACT = "r2ca-s2-v0.1";
export const CONTROL_POINT_TESSELLATION_RADIAL_SEGMENTS = 4;

export const CONTROL_POINT_TESSELLATION_CELL_ORDER = Object.freeze([
  Object.freeze({ strandCount: 576, pointsPerStrand: 3, tubularSegments: 6 }),
  Object.freeze({ strandCount: 1152, pointsPerStrand: 8, tubularSegments: 21 }),
  Object.freeze({ strandCount: 1152, pointsPerStrand: 3, tubularSegments: 21 }),
  Object.freeze({ strandCount: 576, pointsPerStrand: 8, tubularSegments: 6 }),
  Object.freeze({ strandCount: 1152, pointsPerStrand: 8, tubularSegments: 6 }),
  Object.freeze({ strandCount: 576, pointsPerStrand: 3, tubularSegments: 21 }),
  Object.freeze({ strandCount: 576, pointsPerStrand: 8, tubularSegments: 21 }),
  Object.freeze({ strandCount: 1152, pointsPerStrand: 3, tubularSegments: 6 }),
] as const);

export type ControlPointTessellationWarning = "AUTO_DID_NOT_SELECT_WEBGPU";

export interface ControlPointTessellationOperatorDeclaration {
  readonly browserEngine: "CHROMIUM_FAMILY";
  readonly declaredBrowserProduct: ControlPointTessellationBrowserProduct;
  readonly declaredBrowserMajor: number;
  readonly osFamily: BenchmarkOperatorDeclaration["osFamily"];
  readonly architecture: BenchmarkOperatorDeclaration["architecture"];
  readonly deviceClass: BenchmarkOperatorDeclaration["deviceClass"];
  readonly powerMode: BenchmarkOperatorDeclaration["powerMode"];
  readonly lowPowerState: BenchmarkOperatorDeclaration["lowPowerState"];
}

export interface ControlPointTessellationEnvironment {
  readonly rawUserAgent: string;
  readonly browserEngine: "CHROMIUM_FAMILY";
  readonly declaredBrowserProduct: ControlPointTessellationBrowserProduct;
  readonly declaredBrowserMajor: number;
  readonly actualBrowserProduct: ControlPointTessellationBrowserProduct;
  readonly actualBrowserMajor: number;
  readonly rawBrowserVersionEvidence: RawBrowserVersionEvidence;
  readonly osFamily: "MACOS";
  readonly architecture: "ARM64";
  readonly deviceClass: "PRIMARY_REFERENCE";
  readonly powerMode: "AC_POWER";
  readonly lowPowerState: "OFF";
  readonly cssViewportWidth: number;
  readonly cssViewportHeight: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly devicePixelRatio: number;
  readonly rendererPixelRatio: number;
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface ControlPointTessellationSessionConfiguration {
  readonly runKind: "CONTROL_POINT_TESSELLATION";
  readonly decisionBearing: true;
  readonly strandLevels: readonly [576, 1152];
  readonly pointLevels: readonly [3, 8];
  readonly tubularSegmentLevels: readonly [6, 21];
  readonly requestedBackends: readonly ["AUTO"];
  readonly cellOrder: typeof CONTROL_POINT_TESSELLATION_CELL_ORDER;
  readonly warmupSamplesPerCell: 1;
  readonly measuredSamplesPerCell: 5;
  readonly previewColor: "#34251F";
  readonly density: "HIGH";
  readonly yaw: 0;
  readonly pitch: 0;
  readonly radialSegments: 4;
  readonly catmullRomType: "centripetal";
  readonly catmullRomClosed: false;
  readonly tubeGeometryClosed: false;
  readonly syncStageCeilingMs: 1000;
  readonly logicalReadyCeilingMs: 3000;
  readonly sessionCeilingMs: 900000;
}

export interface ControlPointTessellationCellResult {
  readonly strandCount: ControlPointTessellationStrandCount;
  readonly pointsPerStrand: ControlPointTessellationPointsPerStrand;
  readonly tubularSegmentsPerStrand: ControlPointTessellationTubularSegments;
  readonly controlSpansPerStrand: 2 | 7;
  readonly radialSegments: 4;
  readonly requestedBackend: "AUTO";
  readonly actualBackend: ActualRendererBackend | null;
  readonly warmupStatus: BenchmarkWarmupStatus;
  readonly rawMeasuredSamples: readonly BenchmarkMeasuredSample[];
  readonly metricSummaries: BenchmarkMetricSummaries;
  readonly cleanupOutcome: BenchmarkCleanupOutcome;
  readonly cellOutcome: BenchmarkCellOutcome;
  readonly cellStopReason: BenchmarkStopReason;
}

export interface ControlPointTessellationResult {
  readonly schema: typeof CONTROL_POINT_TESSELLATION_RESULT_SCHEMA;
  readonly version: typeof CONTROL_POINT_TESSELLATION_RESULT_VERSION;
  readonly experiment: typeof CONTROL_POINT_TESSELLATION_EXPERIMENT;
  readonly measurementContract: typeof CONTROL_POINT_TESSELLATION_MEASUREMENT_CONTRACT;
  readonly generatorVersion: typeof CONTROL_POINT_TESSELLATION_GENERATOR_VERSION;
  readonly classification: "BENCHMARK_ONLY";
  readonly source: ControlPointTessellationSourceProvenance;
  readonly environment: ControlPointTessellationEnvironment;
  readonly sessionConfiguration: ControlPointTessellationSessionConfiguration;
  readonly cells: readonly ControlPointTessellationCellResult[];
  readonly analysis: ControlPointTessellationAnalysis;
  readonly outcome: BenchmarkRunOutcome;
  readonly stopReason: BenchmarkStopReason;
  readonly warnings: readonly ControlPointTessellationWarning[];
}

const CONTROL_POINT_TESSELLATION_SESSION_CONFIGURATION = Object.freeze({
  runKind: "CONTROL_POINT_TESSELLATION",
  decisionBearing: true,
  strandLevels: Object.freeze([576, 1152]),
  pointLevels: Object.freeze([3, 8]),
  tubularSegmentLevels: Object.freeze([6, 21]),
  requestedBackends: Object.freeze(["AUTO"]),
  cellOrder: CONTROL_POINT_TESSELLATION_CELL_ORDER,
  warmupSamplesPerCell: 1,
  measuredSamplesPerCell: 5,
  previewColor: "#34251F",
  density: "HIGH",
  yaw: 0,
  pitch: 0,
  radialSegments: 4,
  catmullRomType: "centripetal",
  catmullRomClosed: false,
  tubeGeometryClosed: false,
  syncStageCeilingMs: 1000,
  logicalReadyCeilingMs: 3000,
  sessionCeilingMs: 900000,
} as const satisfies ControlPointTessellationSessionConfiguration);

export function controlPointTessellationSessionConfiguration():
ControlPointTessellationSessionConfiguration {
  return CONTROL_POINT_TESSELLATION_SESSION_CONFIGURATION;
}

export function controlPointTessellationComplexity(
  pointsPerStrand: ControlPointTessellationPointsPerStrand,
  tubularSegments: ControlPointTessellationTubularSegments,
): {
  readonly controlSpansPerStrand: 2 | 7;
  readonly tubularSegmentsPerStrand: ControlPointTessellationTubularSegments;
} {
  return {
    controlSpansPerStrand: pointsPerStrand === 3 ? 2 : 7,
    tubularSegmentsPerStrand: tubularSegments,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} must have the exact S2 result shape.`);
  }
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be nonempty text.`);
  }
  return value;
}

function finiteNonnegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and nonnegative.`);
  }
  return value;
}

function safeInteger(value: unknown, label: string): number {
  const result = finiteNonnegative(value, label);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} must be a safe integer.`);
  return result;
}

const STOP_REASONS = [
  "NONE", "CANCELLED_BY_OPERATOR", "ROUTE_EXIT", "AUTHORIZATION_LOST",
  "PAGE_HIDDEN", "CSS_VIEWPORT_CHANGED", "DEVICE_PIXEL_RATIO_CHANGED",
  "DRAWING_BUFFER_CHANGED", "RENDERER_PIXEL_RATIO_CHANGED", "SESSION_DEADLINE",
  "INSTRUMENTATION_FAILURE", "CLEANUP_INVARIANT_FAILURE", "SOURCE_TREE_DIRTY",
  "PROVENANCE_UNAVAILABLE", "BACKEND_PROFILE_FAILURE", "RENDERER_INIT_FAILURE",
  "RENDER_SUBMIT_FAILURE", "FORCED_BACKEND_MISMATCH", "AUTO_BACKEND_DRIFT",
  "SYNC_STAGE_CEILING", "LOGICAL_READY_CEILING",
] as const satisfies readonly BenchmarkStopReason[];

function readStopReason(value: unknown): BenchmarkStopReason {
  for (const candidate of STOP_REASONS) if (value === candidate) return candidate;
  throw new Error("S2 stopReason is unsupported.");
}

function outcome(value: unknown): BenchmarkRunOutcome {
  if (value === "COMPLETE" || value === "STOPPED" || value === "FAILED" ||
      value === "INVALIDATED" || value === "CANCELLED") {
    return value;
  }
  throw new Error("S2 outcome is unsupported.");
}

function source(value: unknown): ControlPointTessellationSourceProvenance {
  const record = exactRecord(value, [
    "kind", "commit", "branch", "treeState", "observedAt", "nextVersion",
    "threeVersion", "generatorVersion", "geometryRecipe", "seed",
  ], "source");
  const commit = text(record.commit, "source.commit");
  if (!/^[0-9a-f]{40}$/.test(commit) || record.kind !== "LOCAL_GIT" ||
      record.treeState !== "CLEAN" ||
      record.generatorVersion !== CONTROL_POINT_TESSELLATION_GENERATOR_VERSION ||
      record.geometryRecipe !== CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE ||
      record.seed !== CONTROL_POINT_TESSELLATION_SEED) {
    throw new Error("S2 source provenance is unsupported.");
  }
  const observedAt = text(record.observedAt, "source.observedAt");
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error("source.observedAt is invalid.");
  return {
    kind: "LOCAL_GIT",
    commit,
    branch: text(record.branch, "source.branch"),
    treeState: "CLEAN",
    observedAt,
    nextVersion: text(record.nextVersion, "source.nextVersion"),
    threeVersion: text(record.threeVersion, "source.threeVersion"),
    generatorVersion: CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
    geometryRecipe: CONTROL_POINT_TESSELLATION_GEOMETRY_RECIPE,
    seed: CONTROL_POINT_TESSELLATION_SEED,
  };
}

const PRODUCTS = ["CHROME", "EDGE", "OPERA", "CHROMIUM"] as const;

function product(value: unknown, label: string): ControlPointTessellationBrowserProduct {
  for (const candidate of PRODUCTS) if (value === candidate) return candidate;
  throw new Error(`${label} is unsupported.`);
}

function validateControlledEnvironment(record: Record<string, unknown>): void {
  if (record.browserEngine !== "CHROMIUM_FAMILY" || record.osFamily !== "MACOS" ||
      record.architecture !== "ARM64" || record.deviceClass !== "PRIMARY_REFERENCE" ||
      record.powerMode !== "AC_POWER" || record.lowPowerState !== "OFF" ||
      record.cssViewportWidth !== 800 || record.cssViewportHeight !== 600) {
    throw new Error("S2 requires the controlled primary-reference environment.");
  }
}

function environmentDates(record: Record<string, unknown>): {
  readonly startedAt: string;
  readonly endedAt: string;
} {
  const startedAt = text(record.startedAt, "environment.startedAt");
  const endedAt = text(record.endedAt, "environment.endedAt");
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(endedAt)) ||
      Date.parse(startedAt) > Date.parse(endedAt)) {
    throw new Error("S2 environment dates are invalid.");
  }
  return { startedAt, endedAt };
}

function environment(value: unknown): ControlPointTessellationEnvironment {
  const record = exactRecord(value, [
    "rawUserAgent", "browserEngine", "declaredBrowserProduct",
    "declaredBrowserMajor", "actualBrowserProduct", "actualBrowserMajor",
    "rawBrowserVersionEvidence", "osFamily", "architecture", "deviceClass",
    "powerMode", "lowPowerState", "cssViewportWidth", "cssViewportHeight",
    "drawingBufferWidth", "drawingBufferHeight", "devicePixelRatio",
    "rendererPixelRatio", "startedAt", "endedAt",
  ], "environment");
  validateControlledEnvironment(record);
  const declaredBrowserProduct = product(
    record.declaredBrowserProduct,
    "environment.declaredBrowserProduct",
  );
  const actualBrowserProduct = product(
    record.actualBrowserProduct,
    "environment.actualBrowserProduct",
  );
  const declaredBrowserMajor = safeInteger(
    record.declaredBrowserMajor,
    "environment.declaredBrowserMajor",
  );
  const actualBrowserMajor = safeInteger(
    record.actualBrowserMajor,
    "environment.actualBrowserMajor",
  );
  const rawBrowserVersionEvidence = validateRawBrowserVersionEvidence(
    record.rawBrowserVersionEvidence,
  );
  const admitted = admitControlPointTessellationBrowser({
    browserEngine: "CHROMIUM_FAMILY",
    declaredBrowserProduct,
    declaredBrowserMajor,
  }, rawBrowserVersionEvidence);
  if (admitted.actualBrowserProduct !== actualBrowserProduct ||
      admitted.actualBrowserMajor !== actualBrowserMajor ||
      record.rawUserAgent !== rawBrowserVersionEvidence.userAgent) {
    throw new Error("S2 browser evidence is internally contradictory.");
  }
  const dates = environmentDates(record);
  return {
    rawUserAgent: rawBrowserVersionEvidence.userAgent,
    browserEngine: "CHROMIUM_FAMILY",
    declaredBrowserProduct,
    declaredBrowserMajor,
    actualBrowserProduct,
    actualBrowserMajor,
    rawBrowserVersionEvidence,
    osFamily: "MACOS",
    architecture: "ARM64",
    deviceClass: "PRIMARY_REFERENCE",
    powerMode: "AC_POWER",
    lowPowerState: "OFF",
    cssViewportWidth: 800,
    cssViewportHeight: 600,
    drawingBufferWidth: safeInteger(record.drawingBufferWidth, "environment.drawingBufferWidth"),
    drawingBufferHeight: safeInteger(record.drawingBufferHeight, "environment.drawingBufferHeight"),
    devicePixelRatio: finiteNonnegative(record.devicePixelRatio, "environment.devicePixelRatio"),
    rendererPixelRatio: finiteNonnegative(record.rendererPixelRatio, "environment.rendererPixelRatio"),
    ...dates,
  };
}

interface UnvalidatedCell {
  readonly record: Record<string, unknown>;
  readonly strandCount: ControlPointTessellationStrandCount;
  readonly pointsPerStrand: ControlPointTessellationPointsPerStrand;
  readonly tubularSegments: ControlPointTessellationTubularSegments;
}

function unvalidatedCell(value: unknown, index: number): UnvalidatedCell {
  const record = exactRecord(value, [
    "strandCount", "pointsPerStrand", "tubularSegmentsPerStrand",
    "controlSpansPerStrand", "radialSegments", "requestedBackend", "actualBackend",
    "warmupStatus", "rawMeasuredSamples", "metricSummaries", "cleanupOutcome",
    "cellOutcome", "cellStopReason",
  ], `cells[${index}]`);
  const expected = CONTROL_POINT_TESSELLATION_CELL_ORDER[index];
  if (expected === undefined || record.strandCount !== expected.strandCount ||
      record.pointsPerStrand !== expected.pointsPerStrand ||
      record.tubularSegmentsPerStrand !== expected.tubularSegments) {
    throw new Error(`cells[${index}] does not match the frozen S2 order.`);
  }
  const complexity = controlPointTessellationComplexity(
    expected.pointsPerStrand,
    expected.tubularSegments,
  );
  if (record.controlSpansPerStrand !== complexity.controlSpansPerStrand ||
      record.radialSegments !== 4 || record.requestedBackend !== "AUTO") {
    throw new Error(`cells[${index}] geometry identity is invalid.`);
  }
  return {
    record,
    strandCount: expected.strandCount,
    pointsPerStrand: expected.pointsPerStrand,
    tubularSegments: expected.tubularSegments,
  };
}

function s1Source(value: ControlPointTessellationSourceProvenance) {
  return { ...value, generatorVersion: "r2ca-s1-synthetic-generator/v1" as const };
}

function s1Environment(value: ControlPointTessellationEnvironment) {
  return {
    rawUserAgent: value.rawUserAgent,
    browserEngine: value.browserEngine,
    browserMajor: value.declaredBrowserMajor,
    osFamily: value.osFamily,
    architecture: value.architecture,
    deviceClass: value.deviceClass,
    powerMode: value.powerMode,
    lowPowerState: value.lowPowerState,
    cssViewportWidth: value.cssViewportWidth,
    cssViewportHeight: value.cssViewportHeight,
    drawingBufferWidth: value.drawingBufferWidth,
    drawingBufferHeight: value.drawingBufferHeight,
    devicePixelRatio: value.devicePixelRatio,
    rendererPixelRatio: value.rendererPixelRatio,
    startedAt: value.startedAt,
    endedAt: value.endedAt,
  };
}

function s1Cell(value: UnvalidatedCell, index: number): Record<string, unknown> {
  const identity = pointSensitivitySessionConfiguration().cellOrder[index];
  if (identity === undefined) throw new Error("S1 causal validation index is invalid.");
  return {
    strandCount: identity.strandCount,
    pointsPerStrand: identity.pointsPerStrand,
    ...pointSensitivityComplexity(identity.pointsPerStrand),
    tubeSegmentsPerControlSpan: 3,
    radialSegments: 4,
    requestedBackend: "AUTO",
    actualBackend: value.record.actualBackend,
    warmupStatus: value.record.warmupStatus,
    rawMeasuredSamples: value.record.rawMeasuredSamples,
    metricSummaries: value.record.metricSummaries,
    cleanupOutcome: value.record.cleanupOutcome,
    cellOutcome: value.record.cellOutcome,
    cellStopReason: value.record.cellStopReason,
  };
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function s1AnalysisTimingValues(
  cell: Record<string, unknown>,
  timing: "geometryCreateCpuMs" | "candidateToLogicalReadyMs",
): readonly number[] {
  if (!Array.isArray(cell.rawMeasuredSamples)) {
    throw new Error("S2 causal candidate samples must be an array.");
  }
  return cell.rawMeasuredSamples.map((sampleValue) => {
    if (!isRecord(sampleValue) || sampleValue.status !== "VALID" ||
        !isRecord(sampleValue.timings)) {
      throw new Error("Complete S2 causal candidates require valid timings.");
    }
    return finiteNonnegative(sampleValue.timings[timing], `S2 causal ${timing}`);
  });
}

function repeatedS1Analysis(cell: Record<string, unknown>): unknown {
  const geometry = s1AnalysisTimingValues(cell, "geometryCreateCpuMs");
  const ready = s1AnalysisTimingValues(cell, "candidateToLogicalReadyMs");
  const geometryMedian = median(geometry);
  const readyMedian = median(ready);
  if (geometryMedian <= 0 || readyMedian <= 0) throw new Error("INSTRUMENTATION_FAILURE");
  const geometryRange = {
    minimum: Math.min(...geometry),
    maximum: Math.max(...geometry),
  };
  const ratioRange = {
    minimum: geometryRange.minimum / geometryMedian,
    maximum: geometryRange.maximum / geometryMedian,
  };
  const thresholdProximate =
    (ratioRange.minimum <= 0.75 && 0.75 <= ratioRange.maximum) ||
    (ratioRange.minimum <= 1.15 && 1.15 <= ratioRange.maximum);
  const level = (strandCount: 576 | 1152) => ({
    strandCount,
    geometryCreateMedians: [geometryMedian, geometryMedian, geometryMedian],
    ratiosToP6: [1, 1],
    strictMedianMonotonicity: false,
    geometryCreateRanges: [geometryRange, geometryRange, geometryRange],
    rawRatioRanges: [ratioRange, ratioRange],
    thresholdProximate,
    candidateToLogicalReadyMedians: [readyMedian, readyMedian, readyMedian],
    geometryCreateShares: [
      geometryMedian / readyMedian,
      geometryMedian / readyMedian,
      geometryMedian / readyMedian,
    ],
    levelDisposition: "MIXED_OR_NONLINEAR",
  });
  return {
    levels: [level(576), level(1152)],
    disposition: "MIXED_OR_NONLINEAR",
    prototypeTarget: "NONE",
  };
}

function s1ResultForCells(
  values: readonly UnvalidatedCell[],
  sourceValue: ControlPointTessellationSourceProvenance,
  environmentValue: ControlPointTessellationEnvironment,
  warnings: readonly ControlPointTessellationWarning[],
): unknown {
  const mapped = values.map(s1Cell);
  const allComplete = mapped.length === 6 &&
    mapped.every((entry) => entry.cellOutcome === "COMPLETE");
  let analysis: unknown = { levels: [], disposition: null, prototypeTarget: null };
  let outcome: unknown;
  let stopReason: unknown;
  if (allComplete) {
    try {
      analysis = repeatedS1Analysis(mapped[0]);
      outcome = "COMPLETE";
      stopReason = "NONE";
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "INSTRUMENTATION_FAILURE") throw error;
      outcome = "FAILED";
      stopReason = "INSTRUMENTATION_FAILURE";
    }
  } else {
    const terminal = mapped.at(-1);
    outcome = terminal === undefined ? "FAILED" : benchmarkTerminalOutcome(
      readStopReason(terminal.cellStopReason),
    );
    stopReason = terminal?.cellStopReason ?? "BACKEND_PROFILE_FAILURE";
  }
  return {
    schema: POINT_SENSITIVITY_RESULT_SCHEMA,
    version: 1,
    experiment: POINT_SENSITIVITY_EXPERIMENT,
    measurementContract: POINT_SENSITIVITY_MEASUREMENT_CONTRACT,
    generatorVersion: "r2ca-s1-synthetic-generator/v1",
    classification: "BENCHMARK_ONLY",
    source: s1Source(sourceValue),
    environment: s1Environment(environmentValue),
    sessionConfiguration: pointSensitivitySessionConfiguration(),
    cells: mapped,
    analysis,
    outcome,
    stopReason,
    warnings,
  };
}

function canonicalCell(
  sourceCell: UnvalidatedCell,
  s1CellValue: ReturnType<typeof validatePointSensitivityResult>["cells"][number],
): ControlPointTessellationCellResult {
  return {
    strandCount: sourceCell.strandCount,
    pointsPerStrand: sourceCell.pointsPerStrand,
    ...controlPointTessellationComplexity(
      sourceCell.pointsPerStrand,
      sourceCell.tubularSegments,
    ),
    radialSegments: 4,
    requestedBackend: "AUTO",
    actualBackend: s1CellValue.actualBackend,
    warmupStatus: s1CellValue.warmupStatus,
    rawMeasuredSamples: s1CellValue.rawMeasuredSamples,
    metricSummaries: s1CellValue.metricSummaries,
    cleanupOutcome: s1CellValue.cleanupOutcome,
    cellOutcome: s1CellValue.cellOutcome,
    cellStopReason: s1CellValue.cellStopReason,
  };
}

function validateCellsCausally(
  values: readonly UnvalidatedCell[],
  sourceValue: ControlPointTessellationSourceProvenance,
  environmentValue: ControlPointTessellationEnvironment,
  warnings: readonly ControlPointTessellationWarning[],
): readonly ControlPointTessellationCellResult[] {
  const canonical: ControlPointTessellationCellResult[] = [];
  for (const value of values) {
    if (value.record.cellOutcome !== "COMPLETE") break;
    const repeated = Array.from({ length: 6 }, () => value);
    const validated = validatePointSensitivityResult(
      s1ResultForCells(repeated, sourceValue, environmentValue, warnings),
    );
    canonical.push(canonicalCell(value, validated.cells[0]));
  }
  const terminalIndex = values.findIndex((value) => value.record.cellOutcome !== "COMPLETE");
  if (terminalIndex >= 0) {
    const history = values.slice(Math.max(0, terminalIndex - 5), terminalIndex + 1);
    const validated = validatePointSensitivityResult(
      s1ResultForCells(history, sourceValue, environmentValue, warnings),
    );
    canonical.push(canonicalCell(values[terminalIndex], validated.cells.at(-1)!));
  }
  return canonical;
}

function warnings(value: unknown): readonly ControlPointTessellationWarning[] {
  if (!Array.isArray(value) || value.some((entry) => entry !== "AUTO_DID_NOT_SELECT_WEBGPU") ||
      new Set(value).size !== value.length) {
    throw new Error("S2 warnings are unsupported or duplicated.");
  }
  return value.length === 0 ? [] : ["AUTO_DID_NOT_SELECT_WEBGPU"];
}

function analysisEvidence(
  cells: readonly ControlPointTessellationCellResult[],
): readonly ControlPointTessellationMeasuredCellEvidence[] {
  return cells.map((cell) => ({
    strandCount: cell.strandCount,
    pointsPerStrand: cell.pointsPerStrand,
    tubularSegments: cell.tubularSegmentsPerStrand,
    geometryCreateCpuMs: cell.rawMeasuredSamples.map((sample) => {
      const timing = sample.timings.geometryCreateCpuMs;
      if (sample.status !== "VALID" || timing === null) {
        throw new Error("Complete S2 analysis requires valid geometry-create evidence.");
      }
      return timing;
    }),
  }));
}

function expectedAnalysis(cells: readonly ControlPointTessellationCellResult[]): {
  readonly analysis: ControlPointTessellationAnalysis;
  readonly instrumentationFailure: boolean;
} {
  if (cells.length !== 8 || cells.some((cell) => cell.cellOutcome !== "COMPLETE")) {
    return { analysis: EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS, instrumentationFailure: false };
  }
  try {
    return {
      analysis: createControlPointTessellationAnalysis(analysisEvidence(cells)),
      instrumentationFailure: false,
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "INSTRUMENTATION_FAILURE") throw error;
    return { analysis: EMPTY_CONTROL_POINT_TESSELLATION_ANALYSIS, instrumentationFailure: true };
  }
}

function validateCompleteOutcome(
  outcomeValue: BenchmarkRunOutcome,
  stopReasonValue: BenchmarkStopReason,
): void {
  if (outcomeValue !== "COMPLETE" || stopReasonValue !== "NONE") {
    throw new Error("Complete S2 evidence requires COMPLETE/NONE.");
  }
}

function validateTerminalOutcome(
  cells: readonly ControlPointTessellationCellResult[],
  outcomeValue: BenchmarkRunOutcome,
  stopReasonValue: BenchmarkStopReason,
): void {
  const terminal = cells.at(-1);
  if (terminal === undefined || terminal.cellOutcome === "COMPLETE") {
    throw new Error("Partial S2 evidence requires an exact terminal cell.");
  }
  if (terminal.cellStopReason !== stopReasonValue || stopReasonValue === "NONE" ||
      outcomeValue !== benchmarkTerminalOutcome(stopReasonValue)) {
    throw new Error("Partial S2 evidence requires an exact terminal outcome.");
  }
}

function validateOutcome(
  cells: readonly ControlPointTessellationCellResult[],
  analysisState: ReturnType<typeof expectedAnalysis>,
  outcomeValue: BenchmarkRunOutcome,
  stopReasonValue: BenchmarkStopReason,
): void {
  if (analysisState.instrumentationFailure) {
    if (outcomeValue !== "FAILED" || stopReasonValue !== "INSTRUMENTATION_FAILURE") {
      throw new Error("Nonpositive S2 grand mean must fail as instrumentation failure.");
    }
    return;
  }
  if (cells.length === 8 && cells.every((cell) => cell.cellOutcome === "COMPLETE")) {
    validateCompleteOutcome(outcomeValue, stopReasonValue);
    return;
  }
  validateTerminalOutcome(cells, outcomeValue, stopReasonValue);
}

function validateResultIdentity(record: Record<string, unknown>): void {
  if (record.schema !== CONTROL_POINT_TESSELLATION_RESULT_SCHEMA || record.version !== 1 ||
      record.experiment !== CONTROL_POINT_TESSELLATION_EXPERIMENT ||
      record.measurementContract !== CONTROL_POINT_TESSELLATION_MEASUREMENT_CONTRACT ||
      record.generatorVersion !== CONTROL_POINT_TESSELLATION_GENERATOR_VERSION ||
      record.classification !== "BENCHMARK_ONLY") {
    throw new Error("S2 Result v1 identity is unsupported.");
  }
}

export function validateControlPointTessellationResult(
  value: unknown,
): ControlPointTessellationResult {
  const record = exactRecord(value, [
    "schema", "version", "experiment", "measurementContract", "generatorVersion",
    "classification", "source", "environment", "sessionConfiguration", "cells",
    "analysis", "outcome", "stopReason", "warnings",
  ], "result");
  validateResultIdentity(record);
  const parsedSource = source(record.source);
  const parsedEnvironment = environment(record.environment);
  const configuration = controlPointTessellationSessionConfiguration();
  if (JSON.stringify(record.sessionConfiguration) !== JSON.stringify(configuration)) {
    throw new Error("sessionConfiguration must match the frozen S2 schedule.");
  }
  if (!Array.isArray(record.cells) || record.cells.length > 8) {
    throw new Error("S2 result cells are invalid.");
  }
  const rawCells = record.cells.map(unvalidatedCell);
  const parsedWarnings = warnings(record.warnings);
  const parsedCells = validateCellsCausally(
    rawCells,
    parsedSource,
    parsedEnvironment,
    parsedWarnings,
  );
  if (parsedCells.length !== rawCells.length) {
    throw new Error("S2 cells cannot follow a terminal cell.");
  }
  const analysisState = expectedAnalysis(parsedCells);
  if (JSON.stringify(record.analysis) !== JSON.stringify(analysisState.analysis)) {
    throw new Error("S2 analysis must exactly recompute from raw evidence.");
  }
  const parsedOutcome = outcome(record.outcome);
  const parsedStopReason = readStopReason(record.stopReason);
  validateOutcome(parsedCells, analysisState, parsedOutcome, parsedStopReason);
  return {
    schema: CONTROL_POINT_TESSELLATION_RESULT_SCHEMA,
    version: CONTROL_POINT_TESSELLATION_RESULT_VERSION,
    experiment: CONTROL_POINT_TESSELLATION_EXPERIMENT,
    measurementContract: CONTROL_POINT_TESSELLATION_MEASUREMENT_CONTRACT,
    generatorVersion: CONTROL_POINT_TESSELLATION_GENERATOR_VERSION,
    classification: "BENCHMARK_ONLY",
    source: parsedSource,
    environment: parsedEnvironment,
    sessionConfiguration: configuration,
    cells: parsedCells,
    analysis: analysisState.analysis,
    outcome: parsedOutcome,
    stopReason: parsedStopReason,
    warnings: parsedWarnings,
  };
}

export function serializeControlPointTessellationResult(value: unknown): string {
  return `${JSON.stringify(validateControlPointTessellationResult(value), null, 2)}\n`;
}

export function controlPointTessellationResultFilename(
  result: ControlPointTessellationResult,
): string {
  return `mira-r2ca-s2-v01-${result.environment.startedAt.replaceAll(":", "-")}.json`;
}
