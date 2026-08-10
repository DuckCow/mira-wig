import {
  POINT_SENSITIVITY_GENERATOR_VERSION,
  POINT_SENSITIVITY_GEOMETRY_RECIPE,
  POINT_SENSITIVITY_POINT_LEVELS,
  POINT_SENSITIVITY_SEED,
  POINT_SENSITIVITY_STRAND_LEVELS,
  type PointSensitivityPointsPerStrand,
  type PointSensitivityStrandCount,
} from "./benchmark-point-sensitivity-input";
import type { PointSensitivitySourceProvenance } from "./benchmark-point-sensitivity-provenance.server";
import {
  BENCHMARK_TIMING_NAMES,
  benchmarkTerminalOutcome,
  createBenchmarkMetricSummaries,
  type ActualRendererBackend,
  type BenchmarkCellOutcome,
  type BenchmarkCleanupOutcome,
  type BenchmarkEnvironment,
  type BenchmarkMeasuredSample,
  type BenchmarkMetricSummaries,
  type BenchmarkOperatorDeclaration,
  type BenchmarkRunOutcome,
  type BenchmarkSampleTimings,
  type BenchmarkStopReason,
  type BenchmarkWarmupStatus,
} from "./benchmark-result";

export const POINT_SENSITIVITY_RESULT_SCHEMA = "mira.render-lab.r2ca-s1-result";
export const POINT_SENSITIVITY_RESULT_VERSION = 1;
export const POINT_SENSITIVITY_EXPERIMENT = "R2C-A-S1";
export const POINT_SENSITIVITY_MEASUREMENT_CONTRACT = "r2ca-s1-v0.1";
export const POINT_SENSITIVITY_TUBE_SEGMENTS_PER_SPAN = 3;
export const POINT_SENSITIVITY_RADIAL_SEGMENTS = 4;

export const POINT_SENSITIVITY_CELL_ORDER = [
  { strandCount: 576, pointsPerStrand: 3 },
  { strandCount: 576, pointsPerStrand: 6 },
  { strandCount: 576, pointsPerStrand: 8 },
  { strandCount: 1152, pointsPerStrand: 8 },
  { strandCount: 1152, pointsPerStrand: 6 },
  { strandCount: 1152, pointsPerStrand: 3 },
] as const;

export type PointSensitivityDisposition =
  | "COUPLED_POINT_TESSELLATION_SENSITIVE"
  | "WEAK_COUPLED_COMPLEXITY_SENSITIVITY"
  | "MIXED_OR_NONLINEAR";
export type PointSensitivityPrototypeTarget =
  | "CONTROL_POINT_VS_TESSELLATION_DECOUPLING"
  | "PER_STRAND_FIXED_CONSTRUCTION_OVERHEAD"
  | "NONE";
export type PointSensitivityWarning = "AUTO_DID_NOT_SELECT_WEBGPU";

export interface PointSensitivitySessionConfiguration {
  readonly runKind: "POINT_SENSITIVITY";
  readonly decisionBearing: true;
  readonly strandLevels: readonly [576, 1152];
  readonly pointLevels: readonly [3, 6, 8];
  readonly requestedBackends: readonly ["AUTO"];
  readonly cellOrder: typeof POINT_SENSITIVITY_CELL_ORDER;
  readonly warmupSamplesPerCell: 1;
  readonly measuredSamplesPerCell: 5;
  readonly previewColor: "#34251F";
  readonly density: "HIGH";
  readonly yaw: 0;
  readonly pitch: 0;
  readonly syncStageCeilingMs: 1000;
  readonly logicalReadyCeilingMs: 3000;
  readonly sessionCeilingMs: 900000;
}

export interface PointSensitivityCellResult {
  readonly strandCount: PointSensitivityStrandCount;
  readonly pointsPerStrand: PointSensitivityPointsPerStrand;
  readonly controlSpansPerStrand: 2 | 5 | 7;
  readonly tubularSegmentsPerStrand: 6 | 15 | 21;
  readonly tubeSegmentsPerControlSpan: 3;
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

export interface PointSensitivityRange {
  readonly minimum: number;
  readonly maximum: number;
}

export interface PointSensitivityLevelAnalysis {
  readonly strandCount: PointSensitivityStrandCount;
  readonly geometryCreateMedians: readonly [number, number, number];
  readonly ratiosToP6: readonly [number, number];
  readonly strictMedianMonotonicity: boolean;
  readonly geometryCreateRanges: readonly [
    PointSensitivityRange,
    PointSensitivityRange,
    PointSensitivityRange,
  ];
  readonly rawRatioRanges: readonly [PointSensitivityRange, PointSensitivityRange];
  readonly thresholdProximate: boolean;
  readonly candidateToLogicalReadyMedians: readonly [number, number, number];
  readonly geometryCreateShares: readonly [number, number, number];
  readonly levelDisposition: PointSensitivityDisposition;
}

export interface PointSensitivityAnalysis {
  readonly levels: readonly PointSensitivityLevelAnalysis[];
  readonly disposition: PointSensitivityDisposition | null;
  readonly prototypeTarget: PointSensitivityPrototypeTarget | null;
}

export interface PointSensitivityResult {
  readonly schema: typeof POINT_SENSITIVITY_RESULT_SCHEMA;
  readonly version: typeof POINT_SENSITIVITY_RESULT_VERSION;
  readonly experiment: typeof POINT_SENSITIVITY_EXPERIMENT;
  readonly measurementContract: typeof POINT_SENSITIVITY_MEASUREMENT_CONTRACT;
  readonly generatorVersion: typeof POINT_SENSITIVITY_GENERATOR_VERSION;
  readonly classification: "BENCHMARK_ONLY";
  readonly source: PointSensitivitySourceProvenance;
  readonly environment: BenchmarkEnvironment;
  readonly sessionConfiguration: PointSensitivitySessionConfiguration;
  readonly cells: readonly PointSensitivityCellResult[];
  readonly analysis: PointSensitivityAnalysis;
  readonly outcome: BenchmarkRunOutcome;
  readonly stopReason: BenchmarkStopReason;
  readonly warnings: readonly PointSensitivityWarning[];
}

export function pointSensitivitySessionConfiguration(): PointSensitivitySessionConfiguration {
  return {
    runKind: "POINT_SENSITIVITY",
    decisionBearing: true,
    strandLevels: POINT_SENSITIVITY_STRAND_LEVELS,
    pointLevels: POINT_SENSITIVITY_POINT_LEVELS,
    requestedBackends: ["AUTO"],
    cellOrder: POINT_SENSITIVITY_CELL_ORDER,
    warmupSamplesPerCell: 1,
    measuredSamplesPerCell: 5,
    previewColor: "#34251F",
    density: "HIGH",
    yaw: 0,
    pitch: 0,
    syncStageCeilingMs: 1000,
    logicalReadyCeilingMs: 3000,
    sessionCeilingMs: 900000,
  };
}

export function pointSensitivityComplexity(
  pointsPerStrand: PointSensitivityPointsPerStrand,
): {
  readonly controlSpansPerStrand: 2 | 5 | 7;
  readonly tubularSegmentsPerStrand: 6 | 15 | 21;
} {
  if (pointsPerStrand === 3) {
    return { controlSpansPerStrand: 2, tubularSegmentsPerStrand: 6 };
  }
  if (pointsPerStrand === 6) {
    return { controlSpansPerStrand: 5, tubularSegmentsPerStrand: 15 };
  }
  return { controlSpansPerStrand: 7, tubularSegmentsPerStrand: 21 };
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("Median requires evidence.");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summaryValues(
  cell: PointSensitivityCellResult,
  timing: "geometryCreateCpuMs" | "candidateToLogicalReadyMs",
): readonly number[] {
  return cell.rawMeasuredSamples.map((sample) => {
    const value = sample.timings[timing];
    if (sample.status !== "VALID" || value === null) {
      throw new Error("Complete S1 analysis requires valid timing evidence.");
    }
    return value;
  });
}

function range(values: readonly number[]): PointSensitivityRange {
  return { minimum: Math.min(...values), maximum: Math.max(...values) };
}

function thresholdInside(threshold: number, candidate: PointSensitivityRange): boolean {
  return threshold >= candidate.minimum && threshold <= candidate.maximum;
}

function levelDisposition(
  g3: number,
  g6: number,
  g8: number,
  monotonic: boolean,
  thresholdProximate: boolean,
): PointSensitivityDisposition {
  if (!monotonic || thresholdProximate) return "MIXED_OR_NONLINEAR";
  if (g3 <= 0.75 * g6 && g8 >= 1.15 * g6) {
    return "COUPLED_POINT_TESSELLATION_SENSITIVE";
  }
  if (g3 > 0.75 * g6 && g8 < 1.15 * g6) {
    return "WEAK_COUPLED_COMPLEXITY_SENSITIVITY";
  }
  return "MIXED_OR_NONLINEAR";
}

function analyzeLevel(
  strandCount: PointSensitivityStrandCount,
  cells: readonly PointSensitivityCellResult[],
): PointSensitivityLevelAnalysis {
  const at = (points: PointSensitivityPointsPerStrand): PointSensitivityCellResult => {
    const cell = cells.find((candidate) =>
      candidate.strandCount === strandCount && candidate.pointsPerStrand === points,
    );
    if (cell === undefined || cell.cellOutcome !== "COMPLETE") {
      throw new Error("Complete S1 analysis requires all three cells per strand level.");
    }
    return cell;
  };
  const geometry3 = summaryValues(at(3), "geometryCreateCpuMs");
  const geometry6 = summaryValues(at(6), "geometryCreateCpuMs");
  const geometry8 = summaryValues(at(8), "geometryCreateCpuMs");
  const ready3 = summaryValues(at(3), "candidateToLogicalReadyMs");
  const ready6 = summaryValues(at(6), "candidateToLogicalReadyMs");
  const ready8 = summaryValues(at(8), "candidateToLogicalReadyMs");
  const g3 = median(geometry3);
  const g6 = median(geometry6);
  const g8 = median(geometry8);
  const l3 = median(ready3);
  const l6 = median(ready6);
  const l8 = median(ready8);
  if (g6 <= 0 || l3 <= 0 || l6 <= 0 || l8 <= 0) {
    throw new Error("INSTRUMENTATION_FAILURE");
  }
  const ratio3 = { minimum: Math.min(...geometry3) / g6, maximum: Math.max(...geometry3) / g6 };
  const ratio8 = { minimum: Math.min(...geometry8) / g6, maximum: Math.max(...geometry8) / g6 };
  const thresholdProximate = thresholdInside(0.75, ratio3) || thresholdInside(1.15, ratio8);
  const monotonic = g3 < g6 && g6 < g8;
  return {
    strandCount,
    geometryCreateMedians: [g3, g6, g8],
    ratiosToP6: [g3 / g6, g8 / g6],
    strictMedianMonotonicity: monotonic,
    geometryCreateRanges: [range(geometry3), range(geometry6), range(geometry8)],
    rawRatioRanges: [ratio3, ratio8],
    thresholdProximate,
    candidateToLogicalReadyMedians: [l3, l6, l8],
    geometryCreateShares: [g3 / l3, g6 / l6, g8 / l8],
    levelDisposition: levelDisposition(g3, g6, g8, monotonic, thresholdProximate),
  };
}

function target(disposition: PointSensitivityDisposition): PointSensitivityPrototypeTarget {
  if (disposition === "COUPLED_POINT_TESSELLATION_SENSITIVE") {
    return "CONTROL_POINT_VS_TESSELLATION_DECOUPLING";
  }
  if (disposition === "WEAK_COUPLED_COMPLEXITY_SENSITIVITY") {
    return "PER_STRAND_FIXED_CONSTRUCTION_OVERHEAD";
  }
  return "NONE";
}

export function createPointSensitivityAnalysis(
  cells: readonly PointSensitivityCellResult[],
): PointSensitivityAnalysis {
  const levels = POINT_SENSITIVITY_STRAND_LEVELS.map((strandCount) =>
    analyzeLevel(strandCount, cells),
  );
  const first = levels[0].levelDisposition;
  const disposition = first === levels[1].levelDisposition &&
      first !== "MIXED_OR_NONLINEAR"
    ? first
    : "MIXED_OR_NONLINEAR";
  return { levels, disposition, prototypeTarget: target(disposition) };
}

export const EMPTY_POINT_SENSITIVITY_ANALYSIS: PointSensitivityAnalysis = Object.freeze({
  levels: Object.freeze([]),
  disposition: null,
  prototypeTarget: null,
});

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
    throw new Error(`${label} must have the exact S1 result shape.`);
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

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  for (const candidate of allowed) {
    if (value === candidate) return candidate;
  }
  throw new Error(`${label} is unsupported.`);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be nonempty text.`);
  }
  return value;
}

function isoDate(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) {
    throw new Error(`${label} must be an ISO date.`);
  }
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

type MissingStopReason = Exclude<BenchmarkStopReason, (typeof STOP_REASONS)[number]>;
const STOP_REASON_VOCABULARY_IS_COMPLETE: MissingStopReason extends never ? true : never = true;
void STOP_REASON_VOCABULARY_IS_COMPLETE;

const OWNED_EXECUTION_TIMING_ORDER = [
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

type CausalObservationAuthority = "NONE" | "REPORTED_PRE_ACCEPT" | "ACCEPTED" | "INHERITED";

type CausalPhase =
  | "QUIET_BOUNDARY"
  | "PRE_INPUT"
  | "INPUT_CONSTRUCTION_COMPLETE"
  | "INPUT_VALIDATION_COMPLETE"
  | "BACKEND_CONSTRUCTION_COMPLETE"
  | "SCENE_SETUP_COMPLETE"
  | "RENDERER_INITIALIZATION_COMPLETE"
  | "BACKEND_REPORTED_PRE_ACCEPT"
  | "OBSERVATION_ACCEPTED"
  | "GEOMETRY_SELECTION_COMPLETE"
  | "GEOMETRY_CREATE_COMPLETE"
  | "GEOMETRY_MERGE_COMPLETE"
  | "GEOMETRY_FINALIZE_COMPLETE"
  | "RENDER_SUBMISSION_COMPLETE"
  | "LOGICAL_READY_REACHED";

interface CausalPhaseDescriptor {
  readonly phase: CausalPhase;
  readonly ownedPrefixLength: number;
  readonly executed: boolean;
  readonly observation: CausalObservationAuthority;
  readonly logicalReady: boolean;
}

/**
 * Result-v1 proves compatibility with at least one lawful execution, not the
 * exact hidden runtime history. These phases are validator-only and are never
 * serialized. Adjacent phases remain separate where backend observation
 * authority or terminal evidence can change an acceptance decision.
 */
const CAUSAL_PHASES = [
  { phase: "QUIET_BOUNDARY", ownedPrefixLength: 0, executed: false, observation: "INHERITED", logicalReady: false },
  { phase: "PRE_INPUT", ownedPrefixLength: 0, executed: true, observation: "NONE", logicalReady: false },
  { phase: "INPUT_CONSTRUCTION_COMPLETE", ownedPrefixLength: 1, executed: true, observation: "NONE", logicalReady: false },
  { phase: "INPUT_VALIDATION_COMPLETE", ownedPrefixLength: 2, executed: true, observation: "NONE", logicalReady: false },
  { phase: "BACKEND_CONSTRUCTION_COMPLETE", ownedPrefixLength: 3, executed: true, observation: "NONE", logicalReady: false },
  { phase: "SCENE_SETUP_COMPLETE", ownedPrefixLength: 4, executed: true, observation: "NONE", logicalReady: false },
  { phase: "RENDERER_INITIALIZATION_COMPLETE", ownedPrefixLength: 5, executed: true, observation: "NONE", logicalReady: false },
  { phase: "BACKEND_REPORTED_PRE_ACCEPT", ownedPrefixLength: 5, executed: true, observation: "REPORTED_PRE_ACCEPT", logicalReady: false },
  { phase: "OBSERVATION_ACCEPTED", ownedPrefixLength: 5, executed: true, observation: "ACCEPTED", logicalReady: false },
  { phase: "GEOMETRY_SELECTION_COMPLETE", ownedPrefixLength: 6, executed: true, observation: "ACCEPTED", logicalReady: false },
  { phase: "GEOMETRY_CREATE_COMPLETE", ownedPrefixLength: 7, executed: true, observation: "ACCEPTED", logicalReady: false },
  { phase: "GEOMETRY_MERGE_COMPLETE", ownedPrefixLength: 8, executed: true, observation: "ACCEPTED", logicalReady: false },
  { phase: "GEOMETRY_FINALIZE_COMPLETE", ownedPrefixLength: 9, executed: true, observation: "ACCEPTED", logicalReady: false },
  { phase: "RENDER_SUBMISSION_COMPLETE", ownedPrefixLength: 10, executed: true, observation: "ACCEPTED", logicalReady: false },
  { phase: "LOGICAL_READY_REACHED", ownedPrefixLength: 10, executed: true, observation: "ACCEPTED", logicalReady: true },
] as const satisfies readonly CausalPhaseDescriptor[];

const ALL_EXECUTED_PHASES = CAUSAL_PHASES
  .filter((candidate) => candidate.executed)
  .map((candidate) => candidate.phase);

const EXECUTED_INSTRUMENTATION_PHASES = [
  "BACKEND_CONSTRUCTION_COMPLETE",
  "SCENE_SETUP_COMPLETE",
  "BACKEND_REPORTED_PRE_ACCEPT",
  "OBSERVATION_ACCEPTED",
  "GEOMETRY_SELECTION_COMPLETE",
  "GEOMETRY_CREATE_COMPLETE",
  "GEOMETRY_MERGE_COMPLETE",
  "GEOMETRY_FINALIZE_COMPLETE",
  "RENDER_SUBMISSION_COMPLETE",
] as const satisfies readonly CausalPhase[];

const SESSION_GUARD_PHASES = [
  "PRE_INPUT",
  "INPUT_CONSTRUCTION_COMPLETE",
  "INPUT_VALIDATION_COMPLETE",
  "BACKEND_CONSTRUCTION_COMPLETE",
  "SCENE_SETUP_COMPLETE",
  "BACKEND_REPORTED_PRE_ACCEPT",
  "OBSERVATION_ACCEPTED",
  "GEOMETRY_SELECTION_COMPLETE",
  "GEOMETRY_CREATE_COMPLETE",
  "GEOMETRY_MERGE_COMPLETE",
  "GEOMETRY_FINALIZE_COMPLETE",
  "RENDER_SUBMISSION_COMPLETE",
] as const satisfies readonly CausalPhase[];

const QUIET_OR_SESSION_GUARD_PHASES = [
  "QUIET_BOUNDARY",
  ...SESSION_GUARD_PHASES,
] as const satisfies readonly CausalPhase[];

const BACKEND_PROFILE_FAILURE_PHASES = [
  "PRE_INPUT",
  "INPUT_CONSTRUCTION_COMPLETE",
  "INPUT_VALIDATION_COMPLETE",
  "BACKEND_CONSTRUCTION_COMPLETE",
  "SCENE_SETUP_COMPLETE",
  "OBSERVATION_ACCEPTED",
  "GEOMETRY_SELECTION_COMPLETE",
  "GEOMETRY_CREATE_COMPLETE",
  "GEOMETRY_MERGE_COMPLETE",
  "GEOMETRY_FINALIZE_COMPLETE",
  "RENDER_SUBMISSION_COMPLETE",
] as const satisfies readonly CausalPhase[];

const SYNCHRONOUS_CEILING_PHASES = [
  "INPUT_CONSTRUCTION_COMPLETE",
  "INPUT_VALIDATION_COMPLETE",
  "BACKEND_CONSTRUCTION_COMPLETE",
  "SCENE_SETUP_COMPLETE",
  "GEOMETRY_SELECTION_COMPLETE",
  "GEOMETRY_CREATE_COMPLETE",
  "GEOMETRY_MERGE_COMPLETE",
  "GEOMETRY_FINALIZE_COMPLETE",
  "RENDER_SUBMISSION_COMPLETE",
  "LOGICAL_READY_REACHED",
] as const satisfies readonly CausalPhase[];

const LOGICAL_READY_CEILING_PHASES = [
  "BACKEND_CONSTRUCTION_COMPLETE",
  "SCENE_SETUP_COMPLETE",
  "BACKEND_REPORTED_PRE_ACCEPT",
  "OBSERVATION_ACCEPTED",
  "GEOMETRY_SELECTION_COMPLETE",
  "GEOMETRY_CREATE_COMPLETE",
  "GEOMETRY_MERGE_COMPLETE",
  "GEOMETRY_FINALIZE_COMPLETE",
  "RENDER_SUBMISSION_COMPLETE",
  "LOGICAL_READY_REACHED",
] as const satisfies readonly CausalPhase[];

type StopReasonReachability = "S1_REACHABLE" | "S1_UNREACHABLE" | "S1_CONTEXT_DEPENDENT";

interface StopReasonCausalRule {
  readonly reachability: StopReasonReachability;
  readonly phases: readonly CausalPhase[];
}

/** Complete vocabulary: adding a BenchmarkStopReason requires classifying it here. */
const STOP_REASON_CAUSAL_RULES = {
  NONE: { reachability: "S1_CONTEXT_DEPENDENT", phases: ["LOGICAL_READY_REACHED"] },
  CANCELLED_BY_OPERATOR: { reachability: "S1_REACHABLE", phases: QUIET_OR_SESSION_GUARD_PHASES },
  ROUTE_EXIT: { reachability: "S1_REACHABLE", phases: QUIET_OR_SESSION_GUARD_PHASES },
  AUTHORIZATION_LOST: { reachability: "S1_REACHABLE", phases: QUIET_OR_SESSION_GUARD_PHASES },
  PAGE_HIDDEN: { reachability: "S1_REACHABLE", phases: SESSION_GUARD_PHASES },
  CSS_VIEWPORT_CHANGED: { reachability: "S1_REACHABLE", phases: SESSION_GUARD_PHASES },
  DEVICE_PIXEL_RATIO_CHANGED: { reachability: "S1_REACHABLE", phases: SESSION_GUARD_PHASES },
  DRAWING_BUFFER_CHANGED: { reachability: "S1_REACHABLE", phases: ["BACKEND_REPORTED_PRE_ACCEPT"] },
  RENDERER_PIXEL_RATIO_CHANGED: { reachability: "S1_REACHABLE", phases: ["BACKEND_REPORTED_PRE_ACCEPT"] },
  SESSION_DEADLINE: { reachability: "S1_REACHABLE", phases: SESSION_GUARD_PHASES },
  INSTRUMENTATION_FAILURE: {
    reachability: "S1_CONTEXT_DEPENDENT",
    phases: ["QUIET_BOUNDARY", ...EXECUTED_INSTRUMENTATION_PHASES],
  },
  CLEANUP_INVARIANT_FAILURE: { reachability: "S1_CONTEXT_DEPENDENT", phases: ALL_EXECUTED_PHASES },
  SOURCE_TREE_DIRTY: { reachability: "S1_UNREACHABLE", phases: [] },
  PROVENANCE_UNAVAILABLE: { reachability: "S1_UNREACHABLE", phases: [] },
  BACKEND_PROFILE_FAILURE: { reachability: "S1_REACHABLE", phases: BACKEND_PROFILE_FAILURE_PHASES },
  RENDERER_INIT_FAILURE: { reachability: "S1_REACHABLE", phases: ["SCENE_SETUP_COMPLETE", "RENDERER_INITIALIZATION_COMPLETE"] },
  RENDER_SUBMIT_FAILURE: { reachability: "S1_REACHABLE", phases: ["GEOMETRY_FINALIZE_COMPLETE", "RENDER_SUBMISSION_COMPLETE"] },
  FORCED_BACKEND_MISMATCH: { reachability: "S1_UNREACHABLE", phases: [] },
  AUTO_BACKEND_DRIFT: { reachability: "S1_CONTEXT_DEPENDENT", phases: ["BACKEND_REPORTED_PRE_ACCEPT"] },
  SYNC_STAGE_CEILING: { reachability: "S1_CONTEXT_DEPENDENT", phases: SYNCHRONOUS_CEILING_PHASES },
  LOGICAL_READY_CEILING: { reachability: "S1_CONTEXT_DEPENDENT", phases: LOGICAL_READY_CEILING_PHASES },
} as const satisfies Record<BenchmarkStopReason, StopReasonCausalRule>;

const SYNCHRONOUS_EXECUTION_TIMING_PREFIXES = [
  { timing: "inputConstructionCpuMs", prefixLength: 1 },
  { timing: "inputValidationCpuMs", prefixLength: 2 },
  { timing: "backendConstructionCpuMs", prefixLength: 3 },
  { timing: "sceneSetupCpuMs", prefixLength: 4 },
  { timing: "geometrySelectCpuMs", prefixLength: 6 },
  { timing: "geometryCreateCpuMs", prefixLength: 7 },
  { timing: "geometryMergeCpuMs", prefixLength: 8 },
  { timing: "geometryFinalizeCpuMs", prefixLength: 9 },
  { timing: "firstRenderSubmitCpuMs", prefixLength: 10 },
] as const satisfies readonly {
  readonly timing: keyof BenchmarkSampleTimings;
  readonly prefixLength: number;
}[];

const LOGICAL_READY_SEQUENTIAL_TIMINGS = [
  "backendConstructionCpuMs",
  "sceneSetupCpuMs",
  "rendererInitWallMs",
  "geometrySelectCpuMs",
  "geometryCreateCpuMs",
  "geometryMergeCpuMs",
  "geometryFinalizeCpuMs",
  "firstRenderSubmitCpuMs",
] as const satisfies readonly (keyof BenchmarkSampleTimings)[];

type CausalGuardPosition =
  | "BEFORE_LOGICAL_READY"
  | "LOGICAL_CLOCK_VALIDATION"
  | "LOGICAL_READY_CEILING"
  | "AFTER_LOGICAL_READY"
  | "CLEANUP_OVERRIDE";

interface StopReasonGuardRule {
  readonly position: CausalGuardPosition;
  readonly afterLogicalReady?: CausalGuardPosition;
  readonly phasePositions?: Partial<Record<CausalPhase, CausalGuardPosition>>;
}

/**
 * Internal guard order at one causal boundary. Session/environment and pending
 * backend failures run before logical-clock validation; AUTO drift and renderer
 * environment acceptance run after the logical-ready ceiling. A teardown-only
 * synchronous ceiling is after logical readiness, unlike an owned-stage ceiling.
 */
const STOP_REASON_GUARD_RULES = {
  NONE: { position: "AFTER_LOGICAL_READY" },
  CANCELLED_BY_OPERATOR: { position: "BEFORE_LOGICAL_READY" },
  ROUTE_EXIT: { position: "BEFORE_LOGICAL_READY" },
  AUTHORIZATION_LOST: { position: "BEFORE_LOGICAL_READY" },
  PAGE_HIDDEN: { position: "BEFORE_LOGICAL_READY" },
  CSS_VIEWPORT_CHANGED: { position: "BEFORE_LOGICAL_READY" },
  DEVICE_PIXEL_RATIO_CHANGED: { position: "BEFORE_LOGICAL_READY" },
  DRAWING_BUFFER_CHANGED: { position: "AFTER_LOGICAL_READY" },
  RENDERER_PIXEL_RATIO_CHANGED: { position: "AFTER_LOGICAL_READY" },
  SESSION_DEADLINE: { position: "BEFORE_LOGICAL_READY" },
  INSTRUMENTATION_FAILURE: { position: "LOGICAL_CLOCK_VALIDATION" },
  CLEANUP_INVARIANT_FAILURE: { position: "CLEANUP_OVERRIDE" },
  SOURCE_TREE_DIRTY: { position: "AFTER_LOGICAL_READY" },
  PROVENANCE_UNAVAILABLE: { position: "AFTER_LOGICAL_READY" },
  BACKEND_PROFILE_FAILURE: { position: "BEFORE_LOGICAL_READY" },
  RENDERER_INIT_FAILURE: { position: "BEFORE_LOGICAL_READY" },
  RENDER_SUBMIT_FAILURE: {
    // An unrecorded submit failure follows the submit-entry logical guard, so
    // an already-proven pre-submit ceiling wins. Once submit is recorded, its
    // own work can cross the threshold and fail before the next logical guard.
    position: "AFTER_LOGICAL_READY",
    phasePositions: { RENDER_SUBMISSION_COMPLETE: "BEFORE_LOGICAL_READY" },
  },
  FORCED_BACKEND_MISMATCH: { position: "AFTER_LOGICAL_READY" },
  AUTO_BACKEND_DRIFT: { position: "AFTER_LOGICAL_READY" },
  SYNC_STAGE_CEILING: {
    position: "BEFORE_LOGICAL_READY",
    afterLogicalReady: "AFTER_LOGICAL_READY",
  },
  LOGICAL_READY_CEILING: { position: "LOGICAL_READY_CEILING" },
} as const satisfies Record<BenchmarkStopReason, StopReasonGuardRule>;

function stopReason(value: unknown, label: string): BenchmarkStopReason {
  return enumValue(value, STOP_REASONS, label);
}

function source(value: unknown): PointSensitivitySourceProvenance {
  const record = exactRecord(value, [
    "kind", "commit", "branch", "treeState", "observedAt", "nextVersion",
    "threeVersion", "generatorVersion", "geometryRecipe", "seed",
  ], "source");
  const commit = text(record.commit, "source.commit");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("source.commit is invalid.");
  if (record.kind !== "LOCAL_GIT" ||
      (record.treeState !== "CLEAN" && record.treeState !== "DIRTY")) {
    throw new Error("source Git identity is unsupported.");
  }
  if (
    record.generatorVersion !== POINT_SENSITIVITY_GENERATOR_VERSION ||
    record.geometryRecipe !== POINT_SENSITIVITY_GEOMETRY_RECIPE ||
    record.seed !== POINT_SENSITIVITY_SEED
  ) {
    throw new Error("source S1 generator identity is unsupported.");
  }
  return {
    kind: "LOCAL_GIT",
    commit,
    branch: text(record.branch, "source.branch"),
    treeState: record.treeState,
    observedAt: isoDate(record.observedAt, "source.observedAt"),
    nextVersion: text(record.nextVersion, "source.nextVersion"),
    threeVersion: text(record.threeVersion, "source.threeVersion"),
    generatorVersion: POINT_SENSITIVITY_GENERATOR_VERSION,
    geometryRecipe: POINT_SENSITIVITY_GEOMETRY_RECIPE,
    seed: POINT_SENSITIVITY_SEED,
  };
}

function operator(record: Record<string, unknown>): BenchmarkOperatorDeclaration {
  if (record.browserEngine !== "CHROMIUM_FAMILY" || record.osFamily !== "MACOS" ||
      record.architecture !== "ARM64" || record.deviceClass !== "PRIMARY_REFERENCE" ||
      record.powerMode !== "AC_POWER" || record.lowPowerState !== "OFF") {
    throw new Error("S1 requires the controlled primary-reference environment.");
  }
  const browserMajor = safeInteger(record.browserMajor, "environment.browserMajor");
  return {
    browserEngine: "CHROMIUM_FAMILY",
    browserMajor,
    osFamily: "MACOS",
    architecture: "ARM64",
    deviceClass: "PRIMARY_REFERENCE",
    powerMode: "AC_POWER",
    lowPowerState: "OFF",
  };
}

function environment(value: unknown): BenchmarkEnvironment {
  const record = exactRecord(value, [
    "rawUserAgent", "browserEngine", "browserMajor", "osFamily", "architecture",
    "deviceClass", "powerMode", "lowPowerState", "cssViewportWidth",
    "cssViewportHeight", "drawingBufferWidth", "drawingBufferHeight",
    "devicePixelRatio", "rendererPixelRatio", "startedAt", "endedAt",
  ], "environment");
  const declaration = operator(record);
  if (record.cssViewportWidth !== 800 || record.cssViewportHeight !== 600) {
    throw new Error("S1 viewport must be exactly 800 x 600.");
  }
  const startedAt = text(record.startedAt, "environment.startedAt");
  const endedAt = text(record.endedAt, "environment.endedAt");
  if (!Number.isFinite(Date.parse(startedAt)) || !Number.isFinite(Date.parse(endedAt)) ||
      Date.parse(startedAt) > Date.parse(endedAt)) {
    throw new Error("S1 environment dates are invalid.");
  }
  return {
    rawUserAgent: text(record.rawUserAgent, "environment.rawUserAgent"),
    ...declaration,
    cssViewportWidth: 800,
    cssViewportHeight: 600,
    drawingBufferWidth: safeInteger(record.drawingBufferWidth, "environment.drawingBufferWidth"),
    drawingBufferHeight: safeInteger(record.drawingBufferHeight, "environment.drawingBufferHeight"),
    devicePixelRatio: finiteNonnegative(record.devicePixelRatio, "environment.devicePixelRatio"),
    rendererPixelRatio: finiteNonnegative(record.rendererPixelRatio, "environment.rendererPixelRatio"),
    startedAt,
    endedAt,
  };
}

function configuration(value: unknown): PointSensitivitySessionConfiguration {
  const expected = pointSensitivitySessionConfiguration();
  const record = exactRecord(value, Object.keys(expected), "sessionConfiguration");
  if (JSON.stringify(record) !== JSON.stringify(expected)) {
    throw new Error("sessionConfiguration must match the frozen S1 schedule.");
  }
  return expected;
}

const RESOURCE_KEYS = [
  "candidateHosts", "activeHosts", "canvases", "observers", "timers",
  "animationFrames", "backends", "geometries",
] as const;

function cleanup(value: unknown, label: string): BenchmarkCleanupOutcome {
  const record = exactRecord(value, ["status", ...RESOURCE_KEYS, "finalOwnedResources"], label);
  const values = RESOURCE_KEYS.map((key) => safeInteger(record[key], `${label}.${key}`));
  const finalOwnedResources = safeInteger(record.finalOwnedResources, `${label}.finalOwnedResources`);
  if (values.reduce((sum, entry) => sum + entry, 0) !== finalOwnedResources) {
    throw new Error(`${label} resource sum is inconsistent.`);
  }
  if (record.status !== (finalOwnedResources === 0 ? "ZERO" : "NONZERO")) {
    throw new Error(`${label} status is inconsistent.`);
  }
  return {
    status: finalOwnedResources === 0 ? "ZERO" : "NONZERO",
    candidateHosts: values[0], activeHosts: values[1], canvases: values[2],
    observers: values[3], timers: values[4], animationFrames: values[5],
    backends: values[6], geometries: values[7], finalOwnedResources,
  };
}

function timings(value: unknown, label: string): BenchmarkSampleTimings {
  const record = exactRecord(value, BENCHMARK_TIMING_NAMES, label);
  const read = (name: (typeof BENCHMARK_TIMING_NAMES)[number]): number | null =>
    record[name] === null ? null : finiteNonnegative(record[name], `${label}.${name}`);
  return {
    inputConstructionCpuMs: read("inputConstructionCpuMs"),
    inputValidationCpuMs: read("inputValidationCpuMs"),
    backendConstructionCpuMs: read("backendConstructionCpuMs"),
    sceneSetupCpuMs: read("sceneSetupCpuMs"),
    rendererInitWallMs: read("rendererInitWallMs"),
    geometrySelectCpuMs: read("geometrySelectCpuMs"),
    geometryCreateCpuMs: read("geometryCreateCpuMs"),
    geometryMergeCpuMs: read("geometryMergeCpuMs"),
    geometryFinalizeCpuMs: read("geometryFinalizeCpuMs"),
    firstRenderSubmitCpuMs: read("firstRenderSubmitCpuMs"),
    candidateToLogicalReadyMs: read("candidateToLogicalReadyMs"),
    teardownCpuMs: read("teardownCpuMs"),
    totalSampleWallMs: read("totalSampleWallMs"),
  };
}

function sumRecordedTimings(
  timingsValue: BenchmarkSampleTimings,
  names: readonly (keyof BenchmarkSampleTimings)[],
): number {
  return names.reduce((sum, name) => sum + (timingsValue[name] ?? 0), 0);
}

function durationComparisonTolerance(left: number, right: number): number {
  return Number.EPSILON * Math.max(1, left, right) * 16;
}

function requireRecordedDurationContainment(
  enclosing: number,
  lowerBound: number,
  label: string,
): void {
  if (enclosing + durationComparisonTolerance(enclosing, lowerBound) < lowerBound) {
    throw new Error(`${label} is shorter than its safely contained recorded work.`);
  }
}

function inferredDurationSafelyReachesThreshold(
  inferredLowerBound: number,
  threshold: number,
): boolean {
  // Independently subtracted stage intervals may sum microscopically above an
  // enclosing source clock. Subtracting the existing comparison tolerance is
  // directional: equality or proximity never strengthens inferred evidence.
  return inferredLowerBound -
    durationComparisonTolerance(inferredLowerBound, threshold) >= threshold;
}

/**
 * The owned timings are sequential. candidateToLogicalReady encloses backend
 * construction through render submission, while totalSampleWall encloses the
 * two input stages, that candidate interval, and teardown. Hidden gaps add no
 * lower bound; overlapping enclosing/owned intervals are never added together.
 */
function validateRecordedTimingContainment(
  timingsValue: BenchmarkSampleTimings,
  reason: BenchmarkStopReason,
  label: string,
): void {
  const logicalOwnedLowerBound = sumRecordedTimings(
    timingsValue,
    LOGICAL_READY_SEQUENTIAL_TIMINGS,
  );
  const ready = timingsValue.candidateToLogicalReadyMs;
  if (ready !== null) {
    requireRecordedDurationContainment(
      ready,
      logicalOwnedLowerBound,
      `${label}.candidateToLogicalReadyMs`,
    );
  }

  const total = timingsValue.totalSampleWallMs;
  if (total === null) return;
  let candidateLowerBound = ready ?? logicalOwnedLowerBound;
  if (reason === "LOGICAL_READY_CEILING" && ready === null) {
    candidateLowerBound = Math.max(candidateLowerBound, 3000);
  }
  const totalLowerBound =
    (timingsValue.inputConstructionCpuMs ?? 0) +
    (timingsValue.inputValidationCpuMs ?? 0) +
    candidateLowerBound +
    (timingsValue.teardownCpuMs ?? 0);
  requireRecordedDurationContainment(
    total,
    totalLowerBound,
    `${label}.totalSampleWallMs`,
  );
}

const SAMPLE_STATUSES = [
  "VALID", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
] as const;
const WARMUP_STATUSES = [
  "VALID", "NOT_RUN", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
] as const;
const CELL_OUTCOMES = [
  "COMPLETE", "PARTIAL", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
] as const;
const RUN_OUTCOMES = [
  "COMPLETE", "PARTIAL", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
] as const;

function actualBackend(value: unknown, label: string): ActualRendererBackend | null {
  if (value === null) return null;
  return enumValue(value, ["WEBGPU", "WEBGL2"] as const, label);
}

function validateValidSampleEvidence(
  timingsValue: BenchmarkSampleTimings,
  cleanupValue: BenchmarkCleanupOutcome,
  backend: ActualRendererBackend | null,
  reason: BenchmarkStopReason,
  label: string,
): void {
  if (reason !== "NONE" || cleanupValue.status !== "ZERO" || backend === null ||
      Object.values(timingsValue).some((entry) => entry === null)) {
    throw new Error(`${label} valid evidence is incomplete.`);
  }
  const synchronous = BENCHMARK_TIMING_NAMES.filter((name) =>
    name !== "rendererInitWallMs" &&
    name !== "candidateToLogicalReadyMs" &&
    name !== "totalSampleWallMs",
  );
  for (const name of synchronous) {
    const measured = timingsValue[name];
    if (measured === null || measured >= 1000) {
      throw new Error(`${label}.${name} must be below the synchronous ceiling.`);
    }
  }
  if (timingsValue.candidateToLogicalReadyMs === null ||
      timingsValue.candidateToLogicalReadyMs >= 3000) {
    throw new Error(`${label}.candidateToLogicalReadyMs must be below its ceiling.`);
  }
}

function validateTerminalSampleEvidence(
  status: BenchmarkMeasuredSample["status"],
  reason: BenchmarkStopReason,
  timingsValue: BenchmarkSampleTimings,
  label: string,
): void {
  if (reason === "NONE" || status !== benchmarkTerminalOutcome(reason)) {
    throw new Error(`${label} terminal evidence is contradictory.`);
  }
}

function ownedTimingPrefixLength(
  timingsValue: BenchmarkSampleTimings,
  label: string,
): number {
  let missingSeen = false;
  let prefixLength = 0;
  for (const name of OWNED_EXECUTION_TIMING_ORDER) {
    const present = timingsValue[name] !== null;
    if (present && missingSeen) {
      throw new Error(`${label} owned timing evidence is not a lawful execution prefix.`);
    }
    if (present) prefixLength += 1;
    if (!present) missingSeen = true;
  }
  const teardownPresent = timingsValue.teardownCpuMs !== null;
  const totalPresent = timingsValue.totalSampleWallMs !== null;
  if (teardownPresent !== totalPresent) {
    throw new Error(`${label} terminal teardown/total timing evidence is inconsistent.`);
  }
  if (
    timingsValue.candidateToLogicalReadyMs !== null &&
    prefixLength !== OWNED_EXECUTION_TIMING_ORDER.length
  ) {
    throw new Error(`${label} logical-ready timing requires the complete owned-stage prefix.`);
  }
  return prefixLength;
}

function firstSynchronousCeilingPrefixLength(
  timingsValue: BenchmarkSampleTimings,
): number | null {
  for (const entry of SYNCHRONOUS_EXECUTION_TIMING_PREFIXES) {
    const measured = timingsValue[entry.timing];
    if (measured !== null && measured >= 1000) return entry.prefixLength;
  }
  return null;
}

function filterSynchronousCeilingCandidates(
  candidates: readonly CausalPhaseDescriptor[],
  reason: BenchmarkStopReason,
  timingsValue: BenchmarkSampleTimings,
  label: string,
): readonly CausalPhaseDescriptor[] {
  const executionCeilingPrefix = firstSynchronousCeilingPrefixLength(timingsValue);
  if (executionCeilingPrefix !== null) {
    if (reason !== "SYNC_STAGE_CEILING" && reason !== "CLEANUP_INVARIANT_FAILURE") {
      throw new Error(`${label} supersedes an earlier synchronous hard ceiling.`);
    }
    return candidates.filter((candidate) =>
      candidate.ownedPrefixLength === executionCeilingPrefix && !candidate.logicalReady,
    );
  }
  const teardownReachedCeiling =
    timingsValue.teardownCpuMs !== null && timingsValue.teardownCpuMs >= 1000;
  if (reason !== "SYNC_STAGE_CEILING") return candidates;
  if (!teardownReachedCeiling) {
    throw new Error(`${label} SYNC_STAGE_CEILING lacks supporting timing evidence.`);
  }
  return candidates.filter((candidate) => candidate.logicalReady);
}

function provenLogicalReadySequentialPrefix(
  timingsValue: BenchmarkSampleTimings,
  label: string,
): number {
  let provenSequentialPrefix = 0;
  for (const name of LOGICAL_READY_SEQUENTIAL_TIMINGS) {
    const measured = timingsValue[name];
    if (measured === null) break;
    if (inferredDurationSafelyReachesThreshold(provenSequentialPrefix, 3000)) {
      throw new Error(`${label} contains a stage after the logical-ready ceiling was proven.`);
    }
    provenSequentialPrefix += measured;
  }
  return provenSequentialPrefix;
}

function guardPositionForCandidate(
  reason: BenchmarkStopReason,
  candidate: CausalPhaseDescriptor,
): CausalGuardPosition {
  const rule: StopReasonGuardRule = STOP_REASON_GUARD_RULES[reason];
  const phasePosition = rule.phasePositions?.[candidate.phase];
  if (phasePosition !== undefined) return phasePosition;
  return candidate.logicalReady && rule.afterLogicalReady !== undefined
    ? rule.afterLogicalReady
    : rule.position;
}

function guardCanPrecedeOrExpressLogicalReadyCeiling(
  position: CausalGuardPosition,
): boolean {
  return position !== "AFTER_LOGICAL_READY";
}

function filterProvenLogicalReadyCeilingCandidates(
  candidates: readonly CausalPhaseDescriptor[],
  provenSequentialPrefix: number,
  ready: number | null,
  reason: BenchmarkStopReason,
  label: string,
): readonly CausalPhaseDescriptor[] {
  const recordedReadyProvesCeiling = ready !== null && ready >= 3000;
  const inferredPrefixProvesCeiling = inferredDurationSafelyReachesThreshold(
    provenSequentialPrefix,
    3000,
  );
  const provenCeiling = inferredPrefixProvesCeiling || recordedReadyProvesCeiling;
  if (inferredPrefixProvesCeiling && ready !== null) {
    throw new Error(`${label} claims logical readiness after its ceiling was proven.`);
  }
  if (!provenCeiling) return candidates;
  const feasible = candidates.filter((candidate) =>
    guardCanPrecedeOrExpressLogicalReadyCeiling(
      guardPositionForCandidate(reason, candidate),
    ),
  );
  if (feasible.length === 0) {
    throw new Error(`${label} supersedes an earlier logical-ready ceiling guard.`);
  }
  return feasible;
}

function validateClaimedLogicalReadyCeiling(
  ready: number | null,
  reason: BenchmarkStopReason,
  label: string,
): void {
  if (reason !== "LOGICAL_READY_CEILING" || ready === null || ready >= 3000) return;
  throw new Error(`${label} logical-ready timing is below its claimed ceiling.`);
}

function filterLogicalReadyCeilingCandidates(
  candidates: readonly CausalPhaseDescriptor[],
  reason: BenchmarkStopReason,
  timingsValue: BenchmarkSampleTimings,
  label: string,
): readonly CausalPhaseDescriptor[] {
  const provenSequentialPrefix = provenLogicalReadySequentialPrefix(timingsValue, label);
  const ready = timingsValue.candidateToLogicalReadyMs;
  validateClaimedLogicalReadyCeiling(ready, reason, label);
  return filterProvenLogicalReadyCeilingCandidates(
    candidates,
    provenSequentialPrefix,
    ready,
    reason,
    label,
  );
}

function causalPhaseDescriptor(phase: CausalPhase): CausalPhaseDescriptor {
  const descriptor = CAUSAL_PHASES.find((candidate) => candidate.phase === phase);
  if (descriptor === undefined) throw new Error("S1 causal phase table is incomplete.");
  return descriptor;
}

function causalCandidatesForTerminalSample(
  sampleValue: BenchmarkMeasuredSample,
  label: string,
): readonly CausalPhaseDescriptor[] {
  const prefixLength = ownedTimingPrefixLength(sampleValue.timings, label);
  const teardownPresent = sampleValue.timings.teardownCpuMs !== null;
  const logicalReadyPresent = sampleValue.timings.candidateToLogicalReadyMs !== null;
  const rule = STOP_REASON_CAUSAL_RULES[sampleValue.stopReason];
  let candidates: readonly CausalPhaseDescriptor[] = rule.phases
    .map(causalPhaseDescriptor)
    .filter((candidate) =>
      candidate.ownedPrefixLength === prefixLength &&
      candidate.executed === teardownPresent &&
      candidate.logicalReady === logicalReadyPresent,
    )
    .filter((candidate) => {
      if (candidate.observation === "NONE") return sampleValue.actualBackend === null;
      if (candidate.observation === "INHERITED") return sampleValue.actualBackend !== null;
      return sampleValue.actualBackend !== null;
    });

  candidates = filterSynchronousCeilingCandidates(
    candidates,
    sampleValue.stopReason,
    sampleValue.timings,
    label,
  );
  candidates = filterLogicalReadyCeilingCandidates(
    candidates,
    sampleValue.stopReason,
    sampleValue.timings,
    label,
  );
  if (
    sampleValue.stopReason === "CLEANUP_INVARIANT_FAILURE" &&
    (sampleValue.timings.teardownCpuMs === null || sampleValue.timings.totalSampleWallMs === null)
  ) {
    throw new Error(`${label} cleanup failure requires executed teardown evidence.`);
  }
  if (candidates.length === 0) {
    throw new Error(`${label} has no feasible lawful S1 causal state.`);
  }
  return candidates;
}

function measuredSample(value: unknown, index: number): BenchmarkMeasuredSample {
  const label = `rawMeasuredSamples[${index}]`;
  const record = exactRecord(value, [
    "ordinal", "status", "actualBackend", "timings", "cleanupOutcome", "stopReason",
  ], label);
  const status = enumValue(record.status, SAMPLE_STATUSES, `${label}.status`);
  const backend = actualBackend(record.actualBackend, `${label}.actualBackend`);
  const parsedTimings = timings(record.timings, `${label}.timings`);
  const parsedCleanup = cleanup(record.cleanupOutcome, `${label}.cleanupOutcome`);
  const parsedStopReason = stopReason(record.stopReason, `${label}.stopReason`);
  validateRecordedTimingContainment(parsedTimings, parsedStopReason, label);
  if (status === "VALID") {
    validateValidSampleEvidence(parsedTimings, parsedCleanup, backend, parsedStopReason, label);
  } else {
    validateTerminalSampleEvidence(status, parsedStopReason, parsedTimings, label);
  }
  return {
    ordinal: safeInteger(record.ordinal, `${label}.ordinal`),
    status,
    actualBackend: backend,
    timings: parsedTimings,
    cleanupOutcome: parsedCleanup,
    stopReason: parsedStopReason,
  };
}

function validateCellIdentity(
  record: Record<string, unknown>,
  index: number,
  label: string,
) {
  const expected = POINT_SENSITIVITY_CELL_ORDER[index];
  if (expected === undefined || record.strandCount !== expected.strandCount ||
      record.pointsPerStrand !== expected.pointsPerStrand) {
    throw new Error(`${label} violates the frozen S1 cell order.`);
  }
  const complexity = pointSensitivityComplexity(expected.pointsPerStrand);
  if (record.controlSpansPerStrand !== complexity.controlSpansPerStrand ||
      record.tubularSegmentsPerStrand !== complexity.tubularSegmentsPerStrand ||
      record.tubeSegmentsPerControlSpan !== 3 || record.radialSegments !== 4 ||
      record.requestedBackend !== "AUTO") {
    throw new Error(`${label} complexity identity is inconsistent.`);
  }
  return { expected, complexity };
}

function validateCompleteCellEvidence(
  warmupStatus: BenchmarkWarmupStatus,
  reason: BenchmarkStopReason,
  backend: ActualRendererBackend | null,
  cleanupValue: BenchmarkCleanupOutcome,
  samples: readonly BenchmarkMeasuredSample[],
  label: string,
): void {
  if (warmupStatus !== "VALID" || reason !== "NONE" || backend === null ||
      cleanupValue.status !== "ZERO" || samples.length !== 5 ||
      samples.some((sample) => sample.status !== "VALID" || sample.actualBackend !== backend)) {
    throw new Error(`${label} complete evidence is inconsistent.`);
  }
}

function validateTerminalCellEvidence(
  warmupStatus: BenchmarkWarmupStatus,
  outcome: BenchmarkCellOutcome,
  reason: BenchmarkStopReason,
  samples: readonly BenchmarkMeasuredSample[],
  label: string,
): void {
  if (reason === "NONE" || outcome !== benchmarkTerminalOutcome(reason)) {
    throw new Error(`${label} terminal outcome is inconsistent.`);
  }
  const terminal = benchmarkTerminalOutcome(reason);
  if (warmupStatus === "VALID") {
    const terminalSample = samples.at(-1);
    if (terminalSample === undefined || terminalSample.status !== terminal ||
        terminalSample.stopReason !== reason) {
      throw new Error(`${label} measured terminal evidence is inconsistent.`);
    }
    if (samples.slice(0, -1).some((sample) => sample.status !== "VALID")) {
      throw new Error(`${label} samples must be zero or more VALID samples followed by one terminal sample.`);
    }
    return;
  }
  if (warmupStatus !== terminal || samples.length !== 0) {
    throw new Error(`${label} warmup terminal evidence is inconsistent.`);
  }
}

function cell(value: unknown, index: number): PointSensitivityCellResult {
  const label = `cells[${index}]`;
  const record = exactRecord(value, [
    "strandCount", "pointsPerStrand", "controlSpansPerStrand",
    "tubularSegmentsPerStrand", "tubeSegmentsPerControlSpan", "radialSegments",
    "requestedBackend", "actualBackend", "warmupStatus", "rawMeasuredSamples",
    "metricSummaries", "cleanupOutcome", "cellOutcome", "cellStopReason",
  ], label);
  const identity = validateCellIdentity(record, index, label);
  if (!Array.isArray(record.rawMeasuredSamples)) {
    throw new Error(`${label}.rawMeasuredSamples must be an array.`);
  }
  const samples = record.rawMeasuredSamples.map(measuredSample);
  const expectedSummaries = createBenchmarkMetricSummaries(samples);
  if (JSON.stringify(record.metricSummaries) !== JSON.stringify(expectedSummaries)) {
    throw new Error(`${label} summaries must recompute from raw valid evidence.`);
  }
  const parsedCleanup = cleanup(record.cleanupOutcome, `${label}.cleanupOutcome`);
  const warmupStatus = enumValue(record.warmupStatus, WARMUP_STATUSES, `${label}.warmupStatus`);
  const cellOutcome = enumValue(record.cellOutcome, CELL_OUTCOMES, `${label}.cellOutcome`);
  const cellStopReason = stopReason(record.cellStopReason, `${label}.cellStopReason`);
  const parsedBackend = actualBackend(record.actualBackend, `${label}.actualBackend`);
  if (cellOutcome === "COMPLETE") {
    validateCompleteCellEvidence(
      warmupStatus, cellStopReason, parsedBackend, parsedCleanup, samples, label,
    );
  } else {
    validateTerminalCellEvidence(warmupStatus, cellOutcome, cellStopReason, samples, label);
  }
  if (samples.length > 5 || samples.some((entry, sampleIndex) => entry.ordinal !== sampleIndex + 1)) {
    throw new Error(`${label} measured sample cardinality or ordinals are invalid.`);
  }
  return {
    strandCount: identity.expected.strandCount,
    pointsPerStrand: identity.expected.pointsPerStrand,
    ...identity.complexity,
    tubeSegmentsPerControlSpan: 3,
    radialSegments: 4,
    requestedBackend: "AUTO",
    actualBackend: parsedBackend,
    warmupStatus,
    rawMeasuredSamples: samples,
    metricSummaries: expectedSummaries,
    cleanupOutcome: parsedCleanup,
    cellOutcome,
    cellStopReason,
  };
}

function warnings(value: unknown): readonly PointSensitivityWarning[] {
  if (!Array.isArray(value) || value.some((entry) => entry !== "AUTO_DID_NOT_SELECT_WEBGPU") ||
      new Set(value).size !== value.length) {
    throw new Error("warnings are unsupported or duplicated.");
  }
  return value.length === 0 ? [] : ["AUTO_DID_NOT_SELECT_WEBGPU"];
}

function validateResultIdentity(record: Record<string, unknown>): void {
  if (record.schema !== POINT_SENSITIVITY_RESULT_SCHEMA || record.version !== 1 ||
      record.experiment !== POINT_SENSITIVITY_EXPERIMENT ||
      record.measurementContract !== POINT_SENSITIVITY_MEASUREMENT_CONTRACT ||
      record.generatorVersion !== POINT_SENSITIVITY_GENERATOR_VERSION ||
      record.classification !== "BENCHMARK_ONLY") {
    throw new Error("S1 Result v1 identity is unsupported.");
  }
}

function readResultCells(value: unknown): readonly PointSensitivityCellResult[] {
  if (!Array.isArray(value) || value.length > 6) {
    throw new Error("S1 result cells are invalid.");
  }
  return value.map(cell);
}

function validateSessionCellHistory(
  cellsValue: readonly PointSensitivityCellResult[],
): void {
  let terminalSeen = false;
  for (const [index, entry] of cellsValue.entries()) {
    if (terminalSeen) {
      throw new Error(`cells[${index}] cannot follow a session-terminal S1 cell.`);
    }
    if (entry.cellOutcome !== "COMPLETE") terminalSeen = true;
  }
}

function validateS1ReachableStopReason(
  reason: BenchmarkStopReason,
  label: string,
): void {
  if (STOP_REASON_CAUSAL_RULES[reason].reachability === "S1_UNREACHABLE") {
    throw new Error(`${label} is not reachable in the AUTO-only S1 execution.`);
  }
}

function cleanupEvidenceMatches(
  left: BenchmarkCleanupOutcome,
  right: BenchmarkCleanupOutcome,
): boolean {
  return left.status === right.status &&
    left.finalOwnedResources === right.finalOwnedResources &&
    RESOURCE_KEYS.every((key) => left[key] === right[key]);
}

function validateCleanupCause(
  cleanupValue: BenchmarkCleanupOutcome,
  reason: BenchmarkStopReason,
  label: string,
): void {
  const cleanupFailed = cleanupValue.status === "NONZERO";
  if (cleanupFailed !== (reason === "CLEANUP_INVARIANT_FAILURE")) {
    throw new Error(`${label} cleanup evidence contradicts its terminal cause.`);
  }
}

function validateCellExecutionAndCleanup(
  entry: PointSensitivityCellResult,
  index: number,
): void {
  const label = `cells[${index}]`;
  validateS1ReachableStopReason(entry.cellStopReason, `${label}.cellStopReason`);
  for (const [sampleIndex, sampleValue] of entry.rawMeasuredSamples.entries()) {
    validateS1ReachableStopReason(
      sampleValue.stopReason,
      `${label}.rawMeasuredSamples[${sampleIndex}].stopReason`,
    );
    if (sampleValue.status === "VALID") continue;
    const sampleLabel = `${label}.rawMeasuredSamples[${sampleIndex}]`;
    validateCleanupCause(sampleValue.cleanupOutcome, sampleValue.stopReason, sampleLabel);
  }
  if (entry.cellOutcome === "COMPLETE") return;
  const terminalSample = entry.rawMeasuredSamples.at(-1);
  if (entry.warmupStatus === "VALID") {
    if (
      terminalSample === undefined ||
      !cleanupEvidenceMatches(entry.cleanupOutcome, terminalSample.cleanupOutcome)
    ) {
      throw new Error(`${label} cell cleanup contradicts its terminal sample cleanup.`);
    }
  }
  validateCleanupCause(entry.cleanupOutcome, entry.cellStopReason, label);
}

interface AnalysisRecomputation {
  readonly complete: boolean;
  readonly impossible: boolean;
  readonly analysis: PointSensitivityAnalysis;
}

function recomputeAnalysis(
  cellsValue: readonly PointSensitivityCellResult[],
): AnalysisRecomputation {
  const complete = cellsValue.length === 6 &&
    cellsValue.every((entry) => entry.cellOutcome === "COMPLETE");
  if (!complete) {
    return { complete: false, impossible: false, analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS };
  }
  try {
    return { complete: true, impossible: false, analysis: createPointSensitivityAnalysis(cellsValue) };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "INSTRUMENTATION_FAILURE") throw error;
    return { complete: true, impossible: true, analysis: EMPTY_POINT_SENSITIVITY_ANALYSIS };
  }
}

function validateAnalysisValue(value: unknown, expected: PointSensitivityAnalysis): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error("S1 analysis must exactly recompute from raw evidence.");
  }
}

function validateCompleteResultOutcome(
  outcome: BenchmarkRunOutcome,
  reason: BenchmarkStopReason,
): void {
  if (outcome !== "COMPLETE" || reason !== "NONE") {
    throw new Error("Complete S1 evidence requires COMPLETE/NONE.");
  }
}

function validateTerminalResultOutcome(
  outcome: BenchmarkRunOutcome,
  reason: BenchmarkStopReason,
  cellsValue: readonly PointSensitivityCellResult[],
): void {
  const terminalCell = cellsValue.at(-1);
  if (terminalCell === undefined || terminalCell.cellOutcome === "COMPLETE") {
    throw new Error("Non-complete S1 evidence requires an exact terminal cell.");
  }
  if (terminalCell.cellStopReason !== reason) {
    throw new Error("S1 result stopReason must exactly match its terminal cell reason.");
  }
  if (reason === "NONE" || outcome !== benchmarkTerminalOutcome(reason)) {
    throw new Error("Non-complete S1 evidence requires a truthful terminal outcome.");
  }
}

function validateImpossibleAnalysisOutcome(
  outcome: BenchmarkRunOutcome,
  reason: BenchmarkStopReason,
): void {
  if (reason !== "INSTRUMENTATION_FAILURE" || outcome !== "FAILED") {
    throw new Error("Impossible S1 analysis must fail as INSTRUMENTATION_FAILURE.");
  }
}

function validateResultOutcome(
  outcome: BenchmarkRunOutcome,
  reason: BenchmarkStopReason,
  analysisState: AnalysisRecomputation,
  cellsValue: readonly PointSensitivityCellResult[],
): void {
  if (!analysisState.complete) {
    validateTerminalResultOutcome(outcome, reason, cellsValue);
    return;
  }
  if (analysisState.impossible) {
    validateImpossibleAnalysisOutcome(outcome, reason);
    return;
  }
  validateCompleteResultOutcome(outcome, reason);
}

function validMeasuredBackend(
  entry: PointSensitivityCellResult,
  label: string,
): ActualRendererBackend | null {
  let backend: ActualRendererBackend | null = null;
  for (const sample of entry.rawMeasuredSamples) {
    if (sample.status !== "VALID") continue;
    if (sample.actualBackend === null) {
      throw new Error(`${label} valid measured backend is missing.`);
    }
    if (backend !== null && sample.actualBackend !== backend) {
      throw new Error(`${label} valid measured backends contradict each other.`);
    }
    backend ??= sample.actualBackend;
  }
  if (backend !== null && entry.actualBackend !== backend) {
    throw new Error(`${label} cell backend contradicts valid measured evidence.`);
  }
  return backend;
}

interface SessionCausalCandidate {
  readonly phase: CausalPhaseDescriptor;
  readonly establishedBackend: ActualRendererBackend | null;
}

function inheritedObservationAuthority(
  currentBackend: ActualRendererBackend | null,
  establishedBackend: ActualRendererBackend | null,
): ActualRendererBackend | undefined {
  if (establishedBackend === null || currentBackend !== establishedBackend) return undefined;
  return establishedBackend;
}

function acceptedObservationAuthority(
  currentBackend: ActualRendererBackend | null,
  establishedBackend: ActualRendererBackend | null,
): ActualRendererBackend | undefined {
  if (currentBackend === null) return undefined;
  if (establishedBackend !== null && currentBackend !== establishedBackend) return undefined;
  return establishedBackend ?? currentBackend;
}

function reportedObservationMustMatchEstablished(reason: BenchmarkStopReason): boolean {
  return reason === "DRAWING_BUFFER_CHANGED" || reason === "RENDERER_PIXEL_RATIO_CHANGED";
}

function reportedObservationAuthority(
  currentBackend: ActualRendererBackend | null,
  establishedBackend: ActualRendererBackend | null,
  reason: BenchmarkStopReason,
): ActualRendererBackend | null | undefined {
  if (currentBackend === null) return undefined;
  if (reason === "AUTO_BACKEND_DRIFT") {
    if (establishedBackend === null || currentBackend === establishedBackend) return undefined;
    return establishedBackend;
  }
  if (reportedObservationMustMatchEstablished(reason)) {
    return inheritedObservationAuthority(currentBackend, establishedBackend);
  }
  return establishedBackend;
}

function applyObservationAuthority(
  phase: CausalPhaseDescriptor,
  currentBackend: ActualRendererBackend | null,
  establishedBackend: ActualRendererBackend | null,
  reason: BenchmarkStopReason,
): ActualRendererBackend | null | undefined {
  if (phase.observation === "INHERITED") {
    return inheritedObservationAuthority(currentBackend, establishedBackend);
  }
  if (phase.observation === "NONE") {
    return currentBackend === null ? establishedBackend : undefined;
  }
  if (phase.observation === "ACCEPTED") {
    return acceptedObservationAuthority(currentBackend, establishedBackend);
  }
  return reportedObservationAuthority(currentBackend, establishedBackend, reason);
}

function applyBackendAuthorityToPhases(
  phases: readonly CausalPhaseDescriptor[],
  currentBackend: ActualRendererBackend | null,
  establishedBackend: ActualRendererBackend | null,
  reason: BenchmarkStopReason,
): readonly SessionCausalCandidate[] {
  const candidates: SessionCausalCandidate[] = [];
  for (const phase of phases) {
    const nextBackend = applyObservationAuthority(
      phase,
      currentBackend,
      establishedBackend,
      reason,
    );
    if (nextBackend !== undefined) {
      candidates.push({ phase, establishedBackend: nextBackend });
    }
  }
  return candidates;
}

function warmupTerminalCandidates(
  entry: PointSensitivityCellResult,
  establishedBackend: ActualRendererBackend | null,
): readonly SessionCausalCandidate[] {
  const phases = STOP_REASON_CAUSAL_RULES[entry.cellStopReason].phases
    .map(causalPhaseDescriptor)
    .filter((phase) => phase.executed);
  return applyBackendAuthorityToPhases(
    phases,
    entry.actualBackend,
    establishedBackend,
    entry.cellStopReason,
  );
}

function measuredTerminalCandidates(
  entry: PointSensitivityCellResult,
  establishedBackend: ActualRendererBackend,
  label: string,
): readonly SessionCausalCandidate[] {
  const terminalSample = entry.rawMeasuredSamples.at(-1);
  if (terminalSample === undefined || terminalSample.status === "VALID") {
    throw new Error(`${label} measured terminal sample is missing.`);
  }
  const phases = causalCandidatesForTerminalSample(terminalSample, `${label}.terminalSample`);
  return applyBackendAuthorityToPhases(
    phases,
    terminalSample.actualBackend,
    establishedBackend,
    terminalSample.stopReason,
  );
}

function acceptedWarmupBackend(
  entry: PointSensitivityCellResult,
  establishedBackend: ActualRendererBackend | null,
  label: string,
): ActualRendererBackend {
  if (entry.actualBackend === null) {
    throw new Error(`${label} successful warm-up requires an established backend.`);
  }
  if (establishedBackend !== null && entry.actualBackend !== establishedBackend) {
    throw new Error(`${label} backend contradicts preceding S1 backend evidence.`);
  }
  return establishedBackend ?? entry.actualBackend;
}

function finalSessionCausalCandidates(
  cellsValue: readonly PointSensitivityCellResult[],
): readonly SessionCausalCandidate[] {
  let establishedBackend: ActualRendererBackend | null = null;
  for (const [index, entry] of cellsValue.entries()) {
    const label = `cells[${index}]`;
    const validBackend = validMeasuredBackend(entry, label);
    if (entry.warmupStatus === "VALID") {
      establishedBackend = acceptedWarmupBackend(entry, establishedBackend, label);
      if (validBackend !== null && validBackend !== establishedBackend) {
        throw new Error(`${label} valid measured backend contradicts its warm-up authority.`);
      }
    }
    if (entry.cellOutcome === "COMPLETE") continue;
    let candidates: readonly SessionCausalCandidate[];
    if (entry.warmupStatus === "VALID") {
      if (establishedBackend === null) {
        throw new Error(`${label} successful warm-up backend authority is missing.`);
      }
      candidates = measuredTerminalCandidates(entry, establishedBackend, label);
    } else {
      candidates = warmupTerminalCandidates(entry, establishedBackend);
    }
    if (candidates.length === 0) {
      throw new Error(`${label} has no feasible lawful S1 causal state.`);
    }
    return candidates;
  }
  const phase = causalPhaseDescriptor("LOGICAL_READY_REACHED");
  return [{ phase, establishedBackend }];
}

function environmentAuthorityEstablished(environmentValue: BenchmarkEnvironment): boolean {
  if (environmentValue.devicePixelRatio <= 0) {
    throw new Error("S1 environment device-pixel-ratio evidence is inconsistent.");
  }
  const unestablished = environmentValue.drawingBufferWidth === 0 &&
    environmentValue.drawingBufferHeight === 0 &&
    environmentValue.rendererPixelRatio === 0;
  if (unestablished) return false;
  const rendererRatio = Math.min(environmentValue.devicePixelRatio, 2);
  const established = environmentValue.rendererPixelRatio === rendererRatio &&
    environmentValue.drawingBufferWidth === 800 * rendererRatio &&
    environmentValue.drawingBufferHeight === 600 * rendererRatio;
  if (!established) {
    throw new Error("S1 renderer environment buffer/pixel-ratio evidence is inconsistent.");
  }
  return true;
}

function validateCausalAuthorityEvidence(
  cellsValue: readonly PointSensitivityCellResult[],
  warningsValue: readonly PointSensitivityWarning[],
  environmentValue: BenchmarkEnvironment,
): void {
  const environmentEstablished = environmentAuthorityEstablished(environmentValue);
  const warningPresent = warningsValue.includes("AUTO_DID_NOT_SELECT_WEBGPU");
  const feasible = finalSessionCausalCandidates(cellsValue).filter((candidate) =>
    (candidate.establishedBackend !== null) === environmentEstablished &&
    (candidate.establishedBackend === "WEBGL2") === warningPresent,
  );
  if (feasible.length === 0) {
    throw new Error("S1 backend/environment/warning evidence has no feasible lawful causal state.");
  }
}

function validateExecutionCoherence(
  cellsValue: readonly PointSensitivityCellResult[],
  outcome: BenchmarkRunOutcome,
  resultStopReason: BenchmarkStopReason,
  warningsValue: readonly PointSensitivityWarning[],
  environmentValue: BenchmarkEnvironment,
  analysisState: AnalysisRecomputation,
): void {
  validateSessionCellHistory(cellsValue);
  validateS1ReachableStopReason(resultStopReason, "stopReason");
  for (const [index, entry] of cellsValue.entries()) {
    validateCellExecutionAndCleanup(entry, index);
  }
  validateResultOutcome(outcome, resultStopReason, analysisState, cellsValue);
  validateCausalAuthorityEvidence(cellsValue, warningsValue, environmentValue);
}

export function validatePointSensitivityResult(value: unknown): PointSensitivityResult {
  const record = exactRecord(value, [
    "schema", "version", "experiment", "measurementContract", "generatorVersion",
    "classification", "source", "environment", "sessionConfiguration", "cells",
    "analysis", "outcome", "stopReason", "warnings",
  ], "result");
  validateResultIdentity(record);
  const parsedCells = readResultCells(record.cells);
  const parsedSource = source(record.source);
  if (parsedSource.treeState !== "CLEAN") throw new Error("S1 requires clean source.");
  const parsedEnvironment = environment(record.environment);
  const parsedConfiguration = configuration(record.sessionConfiguration);
  const parsedStopReason = stopReason(record.stopReason, "stopReason");
  const outcome = enumValue(record.outcome, RUN_OUTCOMES, "outcome");
  const analysisState = recomputeAnalysis(parsedCells);
  validateAnalysisValue(record.analysis, analysisState.analysis);
  const parsedWarnings = warnings(record.warnings);
  validateExecutionCoherence(
    parsedCells,
    outcome,
    parsedStopReason,
    parsedWarnings,
    parsedEnvironment,
    analysisState,
  );
  return {
    schema: POINT_SENSITIVITY_RESULT_SCHEMA,
    version: POINT_SENSITIVITY_RESULT_VERSION,
    experiment: POINT_SENSITIVITY_EXPERIMENT,
    measurementContract: POINT_SENSITIVITY_MEASUREMENT_CONTRACT,
    generatorVersion: POINT_SENSITIVITY_GENERATOR_VERSION,
    classification: "BENCHMARK_ONLY",
    source: parsedSource,
    environment: parsedEnvironment,
    sessionConfiguration: parsedConfiguration,
    cells: parsedCells,
    analysis: analysisState.analysis,
    outcome,
    stopReason: parsedStopReason,
    warnings: parsedWarnings,
  };
}

export function serializePointSensitivityResult(value: unknown): string {
  return `${JSON.stringify(validatePointSensitivityResult(value), null, 2)}\n`;
}

export function pointSensitivityResultFilename(result: PointSensitivityResult): string {
  return `mira-r2ca-s1-v01-${result.environment.startedAt.replaceAll(":", "-")}.json`;
}
