import {
  RENDERER_BENCHMARK_GENERATOR_VERSION,
  RENDERER_BENCHMARK_GEOMETRY_RECIPE,
  RENDERER_BENCHMARK_POINTS_PER_STRAND,
  RENDERER_BENCHMARK_SEED,
  RENDERER_BENCHMARK_STRAND_LEVELS,
  type RendererBenchmarkStrandCount,
} from "./benchmark-input";
import type { BenchmarkSourceProvenance } from "./benchmark-provenance.server";

export const RENDERER_BENCHMARK_RESULT_SCHEMA = "mira.render-lab.r2ca-result";
export const RENDERER_BENCHMARK_RESULT_VERSION = 2;
export const RENDERER_BENCHMARK_MEASUREMENT_CONTRACT = "r2ca-v0.3";

export const BENCHMARK_TIMING_NAMES = [
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
  "candidateToLogicalReadyMs",
  "teardownCpuMs",
  "totalSampleWallMs",
] as const;

const SYNCHRONOUS_CEILING_TIMING_NAMES = [
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
] as const satisfies readonly BenchmarkTimingName[];

export type BenchmarkTimingName = (typeof BENCHMARK_TIMING_NAMES)[number];
export type BenchmarkRunKind = "CHARACTERIZATION" | "VERIFICATION_SMOKE";
export type RequestedRendererBackend = "AUTO" | "WEBGL2";
export type ActualRendererBackend = "WEBGPU" | "WEBGL2";
export type BrowserEngine = "CHROMIUM_FAMILY" | "WEBKIT";
export type OsFamily = "MACOS" | "IOS" | "WINDOWS" | "LINUX" | "ANDROID" | "OTHER";
export type Architecture = "ARM64" | "X86_64" | "OTHER" | "UNAVAILABLE";
export type DeviceClass = "PRIMARY_REFERENCE" | "LOWER_CAPABILITY" | "OTHER_DECLARED";
export type PowerMode = "AC_POWER" | "BATTERY" | "UNKNOWN";
export type LowPowerState = "ON" | "OFF" | "UNKNOWN";
export type BenchmarkWarning = "NON_DECISION_BEARING" | "AUTO_DID_NOT_SELECT_WEBGPU";

export type BenchmarkStopReason =
  | "NONE"
  | "CANCELLED_BY_OPERATOR"
  | "ROUTE_EXIT"
  | "AUTHORIZATION_LOST"
  | "PAGE_HIDDEN"
  | "CSS_VIEWPORT_CHANGED"
  | "DEVICE_PIXEL_RATIO_CHANGED"
  | "DRAWING_BUFFER_CHANGED"
  | "RENDERER_PIXEL_RATIO_CHANGED"
  | "SESSION_DEADLINE"
  | "INSTRUMENTATION_FAILURE"
  | "CLEANUP_INVARIANT_FAILURE"
  | "SOURCE_TREE_DIRTY"
  | "PROVENANCE_UNAVAILABLE"
  | "BACKEND_PROFILE_FAILURE"
  | "RENDERER_INIT_FAILURE"
  | "RENDER_SUBMIT_FAILURE"
  | "FORCED_BACKEND_MISMATCH"
  | "AUTO_BACKEND_DRIFT"
  | "SYNC_STAGE_CEILING"
  | "LOGICAL_READY_CEILING";

export type BenchmarkSampleStatus =
  | "VALID"
  | "STOPPED"
  | "FAILED"
  | "INVALIDATED"
  | "CANCELLED";
export type BenchmarkWarmupStatus =
  | "VALID"
  | "NOT_RUN"
  | "STOPPED"
  | "FAILED"
  | "INVALIDATED"
  | "CANCELLED";
export type BenchmarkCellOutcome =
  | "COMPLETE"
  | "PARTIAL"
  | "STOPPED"
  | "FAILED"
  | "INVALIDATED"
  | "CANCELLED";
export type BenchmarkRunOutcome =
  | "COMPLETE"
  | "PARTIAL"
  | "STOPPED"
  | "FAILED"
  | "INVALIDATED"
  | "CANCELLED";

export type BenchmarkTerminalOutcome =
  | "STOPPED"
  | "FAILED"
  | "INVALIDATED"
  | "CANCELLED";

export interface BenchmarkOperatorDeclaration {
  readonly browserEngine: BrowserEngine;
  readonly browserMajor: number;
  readonly osFamily: OsFamily;
  readonly architecture: Architecture;
  readonly deviceClass: DeviceClass;
  readonly powerMode: PowerMode;
  readonly lowPowerState: LowPowerState;
}

export interface BenchmarkEnvironment extends BenchmarkOperatorDeclaration {
  readonly rawUserAgent: string;
  readonly cssViewportWidth: number;
  readonly cssViewportHeight: number;
  readonly drawingBufferWidth: number;
  readonly drawingBufferHeight: number;
  readonly devicePixelRatio: number;
  readonly rendererPixelRatio: number;
  readonly startedAt: string;
  readonly endedAt: string;
}

export interface BenchmarkProfileOrder {
  readonly strandCount: RendererBenchmarkStrandCount;
  readonly requestedBackends: readonly RequestedRendererBackend[];
}

export interface BenchmarkSessionConfiguration {
  readonly runKind: BenchmarkRunKind;
  readonly decisionBearing: boolean;
  readonly strandLevels: readonly RendererBenchmarkStrandCount[];
  readonly pointsPerStrand: typeof RENDERER_BENCHMARK_POINTS_PER_STRAND;
  readonly requestedBackends: readonly RequestedRendererBackend[];
  readonly profileOrderByLevel: readonly BenchmarkProfileOrder[];
  readonly warmupSamplesPerCell: 1;
  readonly measuredSamplesPerCell: 1 | 5;
  readonly previewColor: "#34251F";
  readonly density: "HIGH";
  readonly yaw: 0;
  readonly pitch: 0;
  readonly syncStageCeilingMs: 1000;
  readonly logicalReadyCeilingMs: 3000;
  readonly sessionCeilingMs: 900000;
}

export interface BenchmarkOwnedResources {
  readonly candidateHosts: number;
  readonly activeHosts: number;
  readonly canvases: number;
  readonly observers: number;
  readonly timers: number;
  readonly animationFrames: number;
  readonly backends: number;
  readonly geometries: number;
  readonly finalOwnedResources: number;
}

export interface BenchmarkCleanupOutcome extends BenchmarkOwnedResources {
  readonly status: "ZERO" | "NONZERO";
}

export type BenchmarkSampleTimings = Readonly<
  Record<BenchmarkTimingName, number | null>
>;

export interface BenchmarkMeasuredSample {
  readonly ordinal: number;
  readonly status: BenchmarkSampleStatus;
  readonly actualBackend: ActualRendererBackend | null;
  readonly timings: BenchmarkSampleTimings;
  readonly cleanupOutcome: BenchmarkCleanupOutcome;
  readonly stopReason: BenchmarkStopReason;
}

export interface BenchmarkMetricSummary {
  readonly count: number;
  readonly median: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly rawValues: readonly number[];
}

export type BenchmarkMetricSummaries = Readonly<
  Record<BenchmarkTimingName, BenchmarkMetricSummary>
>;

export interface BenchmarkCellResult {
  readonly strandCount: RendererBenchmarkStrandCount;
  readonly pointsPerStrand: typeof RENDERER_BENCHMARK_POINTS_PER_STRAND;
  readonly requestedBackend: RequestedRendererBackend;
  readonly actualBackend: ActualRendererBackend | null;
  readonly warmupStatus: BenchmarkWarmupStatus;
  readonly rawMeasuredSamples: readonly BenchmarkMeasuredSample[];
  readonly metricSummaries: BenchmarkMetricSummaries;
  readonly cleanupOutcome: BenchmarkCleanupOutcome;
  readonly cellOutcome: BenchmarkCellOutcome;
  readonly cellStopReason: BenchmarkStopReason;
}

export interface RendererBenchmarkResult {
  readonly schema: typeof RENDERER_BENCHMARK_RESULT_SCHEMA;
  readonly version: typeof RENDERER_BENCHMARK_RESULT_VERSION;
  readonly measurementContract: typeof RENDERER_BENCHMARK_MEASUREMENT_CONTRACT;
  readonly classification: "BENCHMARK_ONLY";
  readonly source: BenchmarkSourceProvenance;
  readonly environment: BenchmarkEnvironment;
  readonly sessionConfiguration: BenchmarkSessionConfiguration;
  readonly cells: readonly BenchmarkCellResult[];
  readonly outcome: BenchmarkRunOutcome;
  readonly stopReason: BenchmarkStopReason;
  readonly warnings: readonly BenchmarkWarning[];
}

const STOP_REASONS: readonly BenchmarkStopReason[] = [
  "NONE", "CANCELLED_BY_OPERATOR", "ROUTE_EXIT", "AUTHORIZATION_LOST",
  "PAGE_HIDDEN", "CSS_VIEWPORT_CHANGED", "DEVICE_PIXEL_RATIO_CHANGED",
  "DRAWING_BUFFER_CHANGED", "RENDERER_PIXEL_RATIO_CHANGED", "SESSION_DEADLINE",
  "INSTRUMENTATION_FAILURE", "CLEANUP_INVARIANT_FAILURE", "SOURCE_TREE_DIRTY",
  "PROVENANCE_UNAVAILABLE", "BACKEND_PROFILE_FAILURE", "RENDERER_INIT_FAILURE",
  "RENDER_SUBMIT_FAILURE", "FORCED_BACKEND_MISMATCH", "AUTO_BACKEND_DRIFT",
  "SYNC_STAGE_CEILING", "LOGICAL_READY_CEILING",
];
const SAMPLE_STATUSES: readonly BenchmarkSampleStatus[] = [
  "VALID", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
];
const WARMUP_STATUSES: readonly BenchmarkWarmupStatus[] = [
  "VALID", "NOT_RUN", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
];
const CELL_OUTCOMES: readonly BenchmarkCellOutcome[] = [
  "COMPLETE", "PARTIAL", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
];
const RUN_OUTCOMES: readonly BenchmarkRunOutcome[] = [
  "COMPLETE", "PARTIAL", "STOPPED", "FAILED", "INVALIDATED", "CANCELLED",
];
const BROWSER_ENGINES: readonly BrowserEngine[] = ["CHROMIUM_FAMILY", "WEBKIT"];
const OS_FAMILIES: readonly OsFamily[] = [
  "MACOS", "IOS", "WINDOWS", "LINUX", "ANDROID", "OTHER",
];
const ARCHITECTURES: readonly Architecture[] = ["ARM64", "X86_64", "OTHER", "UNAVAILABLE"];
const DEVICE_CLASSES: readonly DeviceClass[] = [
  "PRIMARY_REFERENCE", "LOWER_CAPABILITY", "OTHER_DECLARED",
];
const POWER_MODES: readonly PowerMode[] = ["AC_POWER", "BATTERY", "UNKNOWN"];
const LOW_POWER_STATES: readonly LowPowerState[] = ["ON", "OFF", "UNKNOWN"];
const WARNINGS: readonly BenchmarkWarning[] = [
  "NON_DECISION_BEARING", "AUTO_DID_NOT_SELECT_WEBGPU",
];
const REQUESTED_BACKENDS: readonly RequestedRendererBackend[] = ["AUTO", "WEBGL2"];
const ACTUAL_BACKENDS: readonly ActualRendererBackend[] = ["WEBGPU", "WEBGL2"];
const RESOURCE_KEYS = [
  "candidateHosts", "activeHosts", "canvases", "observers", "timers",
  "animationFrames", "backends", "geometries",
] as const;

const TERMINAL_OUTCOME_BY_REASON = {
  CANCELLED_BY_OPERATOR: "CANCELLED",
  ROUTE_EXIT: "CANCELLED",
  PAGE_HIDDEN: "INVALIDATED",
  CSS_VIEWPORT_CHANGED: "INVALIDATED",
  DEVICE_PIXEL_RATIO_CHANGED: "INVALIDATED",
  DRAWING_BUFFER_CHANGED: "INVALIDATED",
  RENDERER_PIXEL_RATIO_CHANGED: "INVALIDATED",
  BACKEND_PROFILE_FAILURE: "FAILED",
  RENDERER_INIT_FAILURE: "FAILED",
  RENDER_SUBMIT_FAILURE: "FAILED",
  INSTRUMENTATION_FAILURE: "FAILED",
  CLEANUP_INVARIANT_FAILURE: "FAILED",
  AUTHORIZATION_LOST: "STOPPED",
  SESSION_DEADLINE: "STOPPED",
  SOURCE_TREE_DIRTY: "STOPPED",
  PROVENANCE_UNAVAILABLE: "STOPPED",
  FORCED_BACKEND_MISMATCH: "STOPPED",
  AUTO_BACKEND_DRIFT: "STOPPED",
  SYNC_STAGE_CEILING: "STOPPED",
  LOGICAL_READY_CEILING: "STOPPED",
} as const satisfies Record<
  Exclude<BenchmarkStopReason, "NONE">,
  BenchmarkTerminalOutcome
>;

export function benchmarkTerminalOutcome(
  reason: BenchmarkStopReason,
): BenchmarkTerminalOutcome {
  if (reason === "NONE") throw new Error("NONE has no terminal outcome.");
  return TERMINAL_OUTCOME_BY_REASON[reason];
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
    throw new Error(`${label} must have the exact result shape.`);
  }
  return value;
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

function enumNumber<T extends number>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  for (const candidate of allowed) {
    if (value === candidate) return candidate;
  }
  throw new Error(`${label} is unsupported.`);
}

function finiteNonnegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite nonnegative number.`);
  }
  return value;
}

function safeCount(value: unknown, label: string): number {
  const count = finiteNonnegative(value, label);
  if (!Number.isSafeInteger(count)) throw new Error(`${label} must be a safe integer.`);
  return count;
}

function nonemptyText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be nonempty text.`);
  }
  return value;
}

function isoDate(value: unknown, label: string): string {
  const text = nonemptyText(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO date.`);
  return text;
}

function exactNumber(value: unknown, expected: number, label: string): void {
  if (value !== expected) throw new Error(`${label} must be ${expected}.`);
}

function exactSeed(value: unknown, label: string): typeof RENDERER_BENCHMARK_SEED {
  exactNumber(value, RENDERER_BENCHMARK_SEED, label);
  return RENDERER_BENCHMARK_SEED;
}

function exactSix(value: unknown, label: string): 6 {
  exactNumber(value, 6, label);
  return 6;
}

function exactOne(value: unknown, label: string): 1 {
  exactNumber(value, 1, label);
  return 1;
}

function exactThousand(value: unknown, label: string): 1000 {
  exactNumber(value, 1000, label);
  return 1000;
}

function exactThreeThousand(value: unknown, label: string): 3000 {
  exactNumber(value, 3000, label);
  return 3000;
}

function exactSessionCeiling(value: unknown, label: string): 900000 {
  exactNumber(value, 900000, label);
  return 900000;
}

function nullableBackend(value: unknown, label: string): ActualRendererBackend | null {
  if (value === null) return null;
  return enumValue(value, ACTUAL_BACKENDS, label);
}

function readSource(value: unknown): BenchmarkSourceProvenance {
  const record = exactRecord(value, [
    "kind", "commit", "branch", "treeState", "observedAt", "nextVersion",
    "threeVersion", "generatorVersion", "geometryRecipe", "seed",
  ], "source");
  if (record.kind !== "LOCAL_GIT") throw new Error("source.kind must be LOCAL_GIT.");
  const commit = nonemptyText(record.commit, "source.commit");
  if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("source.commit is invalid.");
  if (record.treeState !== "CLEAN" && record.treeState !== "DIRTY") {
    throw new Error("source.treeState is unsupported.");
  }
  return {
    kind: "LOCAL_GIT",
    commit,
    branch: nonemptyText(record.branch, "source.branch"),
    treeState: record.treeState,
    observedAt: isoDate(record.observedAt, "source.observedAt"),
    nextVersion: nonemptyText(record.nextVersion, "source.nextVersion"),
    threeVersion: nonemptyText(record.threeVersion, "source.threeVersion"),
    generatorVersion: enumValue(record.generatorVersion, [RENDERER_BENCHMARK_GENERATOR_VERSION], "source.generatorVersion"),
    geometryRecipe: enumValue(record.geometryRecipe, [RENDERER_BENCHMARK_GEOMETRY_RECIPE], "source.geometryRecipe"),
    seed: exactSeed(record.seed, "source.seed"),
  };
}

function readEnvironment(value: unknown): BenchmarkEnvironment {
  const record = exactRecord(value, [
    "rawUserAgent", "browserEngine", "browserMajor", "osFamily", "architecture",
    "deviceClass", "powerMode", "lowPowerState", "cssViewportWidth",
    "cssViewportHeight", "drawingBufferWidth", "drawingBufferHeight",
    "devicePixelRatio", "rendererPixelRatio", "startedAt", "endedAt",
  ], "environment");
  const startedAt = isoDate(record.startedAt, "environment.startedAt");
  const endedAt = isoDate(record.endedAt, "environment.endedAt");
  if (Date.parse(startedAt) > Date.parse(endedAt)) {
    throw new Error("environment.startedAt must not follow endedAt.");
  }
  exactNumber(record.cssViewportWidth, 800, "environment.cssViewportWidth");
  exactNumber(record.cssViewportHeight, 600, "environment.cssViewportHeight");
  return {
    rawUserAgent: nonemptyText(record.rawUserAgent, "environment.rawUserAgent"),
    browserEngine: enumValue(record.browserEngine, BROWSER_ENGINES, "environment.browserEngine"),
    browserMajor: safeCount(record.browserMajor, "environment.browserMajor"),
    osFamily: enumValue(record.osFamily, OS_FAMILIES, "environment.osFamily"),
    architecture: enumValue(record.architecture, ARCHITECTURES, "environment.architecture"),
    deviceClass: enumValue(record.deviceClass, DEVICE_CLASSES, "environment.deviceClass"),
    powerMode: enumValue(record.powerMode, POWER_MODES, "environment.powerMode"),
    lowPowerState: enumValue(record.lowPowerState, LOW_POWER_STATES, "environment.lowPowerState"),
    cssViewportWidth: 800,
    cssViewportHeight: 600,
    drawingBufferWidth: safeCount(record.drawingBufferWidth, "environment.drawingBufferWidth"),
    drawingBufferHeight: safeCount(record.drawingBufferHeight, "environment.drawingBufferHeight"),
    devicePixelRatio: finiteNonnegative(record.devicePixelRatio, "environment.devicePixelRatio"),
    rendererPixelRatio: finiteNonnegative(record.rendererPixelRatio, "environment.rendererPixelRatio"),
    startedAt,
    endedAt,
  };
}

export const CHARACTERIZATION_PROFILE_ORDER: readonly BenchmarkProfileOrder[] = [
  { strandCount: 72, requestedBackends: ["AUTO", "WEBGL2"] },
  { strandCount: 144, requestedBackends: ["WEBGL2", "AUTO"] },
  { strandCount: 288, requestedBackends: ["AUTO", "WEBGL2"] },
  { strandCount: 576, requestedBackends: ["WEBGL2", "AUTO"] },
  { strandCount: 1152, requestedBackends: ["AUTO", "WEBGL2"] },
];
const SMOKE_STRAND_LEVELS: readonly RendererBenchmarkStrandCount[] = [72];

function sameArray(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function readProfileOrder(value: unknown, runKind: BenchmarkRunKind): readonly BenchmarkProfileOrder[] {
  if (!Array.isArray(value)) throw new Error("profileOrderByLevel must be an array.");
  const expected = runKind === "CHARACTERIZATION"
    ? CHARACTERIZATION_PROFILE_ORDER
    : CHARACTERIZATION_PROFILE_ORDER.slice(0, 1);
  const parsed = value.map((entry, index) => {
    const record = exactRecord(entry, ["strandCount", "requestedBackends"], `profileOrderByLevel[${index}]`);
    if (!Array.isArray(record.requestedBackends)) {
      throw new Error(`profileOrderByLevel[${index}].requestedBackends must be an array.`);
    }
    const requestedBackends = record.requestedBackends.map((backend, backendIndex) =>
      enumValue(backend, REQUESTED_BACKENDS, `profileOrderByLevel[${index}].requestedBackends[${backendIndex}]`),
    );
    return {
      strandCount: enumNumber(record.strandCount, RENDERER_BENCHMARK_STRAND_LEVELS, `profileOrderByLevel[${index}].strandCount`),
      requestedBackends,
    };
  });
  if (
    parsed.length !== expected.length ||
    parsed.some((entry, index) =>
      entry.strandCount !== expected[index].strandCount ||
      !sameArray(entry.requestedBackends, expected[index].requestedBackends),
    )
  ) {
    throw new Error("profileOrderByLevel must match the v0.3 schedule.");
  }
  return parsed;
}

const CONFIGURATION_KEYS = [
    "runKind", "decisionBearing", "strandLevels", "pointsPerStrand",
    "requestedBackends", "profileOrderByLevel", "warmupSamplesPerCell",
    "measuredSamplesPerCell", "previewColor", "density", "yaw", "pitch",
    "syncStageCeilingMs", "logicalReadyCeilingMs", "sessionCeilingMs",
] as const;

function configurationLevels(runKind: BenchmarkRunKind): readonly RendererBenchmarkStrandCount[] {
  return runKind === "CHARACTERIZATION"
    ? RENDERER_BENCHMARK_STRAND_LEVELS
    : SMOKE_STRAND_LEVELS;
}

function validateConfigurationAxes(
  record: Record<string, unknown>,
  levels: readonly RendererBenchmarkStrandCount[],
): void {
  if (!Array.isArray(record.strandLevels) || !sameArray(record.strandLevels, levels)) {
    throw new Error("sessionConfiguration.strandLevels violates the run kind.");
  }
  if (!Array.isArray(record.requestedBackends) || !sameArray(record.requestedBackends, REQUESTED_BACKENDS)) {
    throw new Error("sessionConfiguration.requestedBackends must be AUTO then WEBGL2.");
  }
}

function validateFixedStimulus(record: Record<string, unknown>): void {
  const fixed = record.previewColor === "#34251F" && record.density === "HIGH";
  if (!fixed || record.yaw !== 0 || record.pitch !== 0) {
    throw new Error("sessionConfiguration visual stimulus is not fixed v0.3 state.");
  }
}

function readConfiguration(value: unknown): BenchmarkSessionConfiguration {
  const record = exactRecord(value, CONFIGURATION_KEYS, "sessionConfiguration");
  const runKind = enumValue(record.runKind, ["CHARACTERIZATION", "VERIFICATION_SMOKE"], "sessionConfiguration.runKind");
  const expectedLevels = configurationLevels(runKind);
  validateConfigurationAxes(record, expectedLevels);
  const decisionBearing = runKind === "CHARACTERIZATION";
  if (record.decisionBearing !== decisionBearing) {
    throw new Error("sessionConfiguration.decisionBearing violates the run kind.");
  }
  const measuredSamplesPerCell = runKind === "CHARACTERIZATION" ? 5 : 1;
  exactNumber(record.measuredSamplesPerCell, measuredSamplesPerCell, "sessionConfiguration.measuredSamplesPerCell");
  validateFixedStimulus(record);
  return {
    runKind,
    decisionBearing,
    strandLevels: expectedLevels,
    pointsPerStrand: exactSix(record.pointsPerStrand, "sessionConfiguration.pointsPerStrand"),
    requestedBackends: REQUESTED_BACKENDS,
    profileOrderByLevel: readProfileOrder(record.profileOrderByLevel, runKind),
    warmupSamplesPerCell: exactOne(record.warmupSamplesPerCell, "sessionConfiguration.warmupSamplesPerCell"),
    measuredSamplesPerCell,
    previewColor: "#34251F",
    density: "HIGH",
    yaw: 0,
    pitch: 0,
    syncStageCeilingMs: exactThousand(record.syncStageCeilingMs, "sessionConfiguration.syncStageCeilingMs"),
    logicalReadyCeilingMs: exactThreeThousand(record.logicalReadyCeilingMs, "sessionConfiguration.logicalReadyCeilingMs"),
    sessionCeilingMs: exactSessionCeiling(record.sessionCeilingMs, "sessionConfiguration.sessionCeilingMs"),
  };
}

function readCleanup(value: unknown, label: string): BenchmarkCleanupOutcome {
  const record = exactRecord(value, ["status", ...RESOURCE_KEYS, "finalOwnedResources"], label);
  const resources = RESOURCE_KEYS.map((key) => safeCount(record[key], `${label}.${key}`));
  const finalOwnedResources = safeCount(record.finalOwnedResources, `${label}.finalOwnedResources`);
  const total = resources.reduce((sum, count) => sum + count, 0);
  if (total !== finalOwnedResources) {
    throw new Error(`${label}.finalOwnedResources must equal the owned resource sum.`);
  }
  const status = enumValue(record.status, ["ZERO", "NONZERO"], `${label}.status`);
  if ((status === "ZERO") !== (finalOwnedResources === 0)) {
    throw new Error(`${label}.status is inconsistent with final ownership.`);
  }
  return {
    status,
    candidateHosts: resources[0], activeHosts: resources[1], canvases: resources[2],
    observers: resources[3], timers: resources[4], animationFrames: resources[5],
    backends: resources[6], geometries: resources[7], finalOwnedResources,
  };
}

function readTimings(value: unknown, label: string): BenchmarkSampleTimings {
  const record = exactRecord(value, BENCHMARK_TIMING_NAMES, label);
  const timing = (name: BenchmarkTimingName): number | null =>
    record[name] === null ? null : finiteNonnegative(record[name], `${label}.${name}`);
  return {
    inputConstructionCpuMs: timing("inputConstructionCpuMs"),
    inputValidationCpuMs: timing("inputValidationCpuMs"),
    backendConstructionCpuMs: timing("backendConstructionCpuMs"),
    sceneSetupCpuMs: timing("sceneSetupCpuMs"),
    rendererInitWallMs: timing("rendererInitWallMs"),
    geometrySelectCpuMs: timing("geometrySelectCpuMs"),
    geometryCreateCpuMs: timing("geometryCreateCpuMs"),
    geometryMergeCpuMs: timing("geometryMergeCpuMs"),
    geometryFinalizeCpuMs: timing("geometryFinalizeCpuMs"),
    firstRenderSubmitCpuMs: timing("firstRenderSubmitCpuMs"),
    candidateToLogicalReadyMs: timing("candidateToLogicalReadyMs"),
    teardownCpuMs: timing("teardownCpuMs"),
    totalSampleWallMs: timing("totalSampleWallMs"),
  };
}

function validateValidSampleEvidence(
  timings: BenchmarkSampleTimings,
  cleanupOutcome: BenchmarkCleanupOutcome,
  actualBackend: ActualRendererBackend | null,
  stopReason: BenchmarkStopReason,
  label: string,
): void {
  if (stopReason !== "NONE" || cleanupOutcome.status !== "ZERO") {
    throw new Error(`${label} valid evidence requires no stop and zero cleanup.`);
  }
  if (actualBackend === null) {
    throw new Error(`${label} valid evidence requires an actual backend.`);
  }
  for (const timing of Object.values(timings)) {
    if (timing === null) throw new Error(`${label} valid evidence requires every timing.`);
  }
  validateValidSampleCeilings(timings, label);
}

function validateValidSampleCeilings(
  timings: BenchmarkSampleTimings,
  label: string,
): void {
  for (const name of SYNCHRONOUS_CEILING_TIMING_NAMES) {
    const timing = timings[name];
    if (timing === null || timing >= 1000) {
      throw new Error(`${label}.${name} must be below the synchronous ceiling.`);
    }
  }
  if (
    timings.candidateToLogicalReadyMs === null ||
    timings.candidateToLogicalReadyMs >= 3000
  ) {
    throw new Error(`${label}.candidateToLogicalReadyMs must be below the logical-ready ceiling.`);
  }
}

function readSample(value: unknown, index: number): BenchmarkMeasuredSample {
  const label = `rawMeasuredSamples[${index}]`;
  const record = exactRecord(value, [
    "ordinal", "status", "actualBackend", "timings", "cleanupOutcome", "stopReason",
  ], label);
  const status = enumValue(record.status, SAMPLE_STATUSES, `${label}.status`);
  const stopReason = enumValue(record.stopReason, STOP_REASONS, `${label}.stopReason`);
  const timings = readTimings(record.timings, `${label}.timings`);
  const cleanupOutcome = readCleanup(record.cleanupOutcome, `${label}.cleanupOutcome`);
  const actualBackend = nullableBackend(record.actualBackend, `${label}.actualBackend`);
  if (status === "VALID") {
    validateValidSampleEvidence(timings, cleanupOutcome, actualBackend, stopReason, label);
  } else {
    if (stopReason === "NONE") {
      throw new Error(`${label} non-valid evidence requires a stop reason.`);
    }
    if (status !== benchmarkTerminalOutcome(stopReason)) {
      throw new Error(`${label} status contradicts its stop reason.`);
    }
  }
  return {
    ordinal: safeCount(record.ordinal, `${label}.ordinal`),
    status,
    actualBackend,
    timings,
    cleanupOutcome,
    stopReason,
  };
}

function readSummary(value: unknown, label: string): BenchmarkMetricSummary {
  const record = exactRecord(value, ["count", "median", "minimum", "maximum", "rawValues"], label);
  if (!Array.isArray(record.rawValues)) throw new Error(`${label}.rawValues must be an array.`);
  const rawValues = record.rawValues.map((entry, index) =>
    finiteNonnegative(entry, `${label}.rawValues[${index}]`),
  );
  const count = safeCount(record.count, `${label}.count`);
  if (count !== rawValues.length) throw new Error(`${label}.count must match rawValues.`);
  const nullable = (entry: unknown, field: string): number | null =>
    entry === null ? null : finiteNonnegative(entry, `${label}.${field}`);
  return {
    count,
    median: nullable(record.median, "median"),
    minimum: nullable(record.minimum, "minimum"),
    maximum: nullable(record.maximum, "maximum"),
    rawValues,
  };
}

function readSummaries(value: unknown, label: string): BenchmarkMetricSummaries {
  const record = exactRecord(value, BENCHMARK_TIMING_NAMES, label);
  const summary = (name: BenchmarkTimingName): BenchmarkMetricSummary =>
    readSummary(record[name], `${label}.${name}`);
  return {
    inputConstructionCpuMs: summary("inputConstructionCpuMs"),
    inputValidationCpuMs: summary("inputValidationCpuMs"),
    backendConstructionCpuMs: summary("backendConstructionCpuMs"),
    sceneSetupCpuMs: summary("sceneSetupCpuMs"),
    rendererInitWallMs: summary("rendererInitWallMs"),
    geometrySelectCpuMs: summary("geometrySelectCpuMs"),
    geometryCreateCpuMs: summary("geometryCreateCpuMs"),
    geometryMergeCpuMs: summary("geometryMergeCpuMs"),
    geometryFinalizeCpuMs: summary("geometryFinalizeCpuMs"),
    firstRenderSubmitCpuMs: summary("firstRenderSubmitCpuMs"),
    candidateToLogicalReadyMs: summary("candidateToLogicalReadyMs"),
    teardownCpuMs: summary("teardownCpuMs"),
    totalSampleWallMs: summary("totalSampleWallMs"),
  };
}

function readCell(value: unknown, index: number): BenchmarkCellResult {
  const label = `cells[${index}]`;
  const record = exactRecord(value, [
    "strandCount", "pointsPerStrand", "requestedBackend", "actualBackend",
    "warmupStatus", "rawMeasuredSamples", "metricSummaries", "cleanupOutcome",
    "cellOutcome", "cellStopReason",
  ], label);
  if (!Array.isArray(record.rawMeasuredSamples)) {
    throw new Error(`${label}.rawMeasuredSamples must be an array.`);
  }
  return {
    strandCount: enumNumber(record.strandCount, RENDERER_BENCHMARK_STRAND_LEVELS, `${label}.strandCount`),
    pointsPerStrand: exactSix(record.pointsPerStrand, `${label}.pointsPerStrand`),
    requestedBackend: enumValue(record.requestedBackend, REQUESTED_BACKENDS, `${label}.requestedBackend`),
    actualBackend: nullableBackend(record.actualBackend, `${label}.actualBackend`),
    warmupStatus: enumValue(record.warmupStatus, WARMUP_STATUSES, `${label}.warmupStatus`),
    rawMeasuredSamples: record.rawMeasuredSamples.map(readSample),
    metricSummaries: readSummaries(record.metricSummaries, `${label}.metricSummaries`),
    cleanupOutcome: readCleanup(record.cleanupOutcome, `${label}.cleanupOutcome`),
    cellOutcome: enumValue(record.cellOutcome, CELL_OUTCOMES, `${label}.cellOutcome`),
    cellStopReason: enumValue(record.cellStopReason, STOP_REASONS, `${label}.cellStopReason`),
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function validateSummarySemantics(cell: BenchmarkCellResult, label: string): void {
  const validSamples = cell.rawMeasuredSamples.filter((sample) => sample.status === "VALID");
  for (const name of BENCHMARK_TIMING_NAMES) {
    const rawValues = validSamples.map((sample) => sample.timings[name]);
    if (rawValues.some((value) => value === null)) {
      throw new Error(`${label}.${name} valid timing is missing.`);
    }
    const numbers = rawValues.filter((value): value is number => value !== null);
    const expected = {
      count: numbers.length,
      median: median(numbers),
      minimum: numbers.length === 0 ? null : Math.min(...numbers),
      maximum: numbers.length === 0 ? null : Math.max(...numbers),
      rawValues: numbers,
    };
    if (JSON.stringify(cell.metricSummaries[name]) !== JSON.stringify(expected)) {
      throw new Error(`${label}.${name} summary must exactly recompute raw valid evidence.`);
    }
  }
}

function schedule(configuration: BenchmarkSessionConfiguration): readonly {
  readonly strandCount: RendererBenchmarkStrandCount;
  readonly requestedBackend: RequestedRendererBackend;
}[] {
  return configuration.profileOrderByLevel.flatMap((level) =>
    level.requestedBackends.map((requestedBackend) => ({
      strandCount: level.strandCount,
      requestedBackend,
    })),
  );
}

function nextScheduleIndex(
  expected: ReturnType<typeof schedule>,
  priorIndex: number,
  cell: BenchmarkCellResult,
  label: string,
): number {
  const index = expected.findIndex((entry, candidateIndex) =>
    candidateIndex > priorIndex &&
    entry.strandCount === cell.strandCount &&
    entry.requestedBackend === cell.requestedBackend,
  );
  if (index < 0) throw new Error(`${label} violates the schedule order.`);
  return index;
}

function validateProfileProgression(
  cell: BenchmarkCellResult,
  priorByProfile: Map<RequestedRendererBackend, BenchmarkCellResult>,
  label: string,
): void {
  const prior = priorByProfile.get(cell.requestedBackend);
  const levelIndex = RENDERER_BENCHMARK_STRAND_LEVELS.indexOf(cell.strandCount);
  if (levelIndex === 0) {
    if (prior !== undefined) throw new Error(`${label} repeated its profile start.`);
  } else {
    const requiredPrior = RENDERER_BENCHMARK_STRAND_LEVELS[levelIndex - 1];
    if (
      prior?.strandCount !== requiredPrior ||
      prior.cellOutcome !== "COMPLETE"
    ) {
      throw new Error(`${label} advanced without its immediately prior completed level.`);
    }
  }
  priorByProfile.set(cell.requestedBackend, cell);
}

function validateAutoBackend(
  cell: BenchmarkCellResult,
  established: ActualRendererBackend | null,
): ActualRendererBackend | null {
  if (cell.requestedBackend !== "AUTO") return established;
  if (cell.cellStopReason === "AUTO_BACKEND_DRIFT") {
    return validateAutoDriftBackend(cell, established);
  }
  if (cell.actualBackend === null) return established;
  if (established === null) return cell.actualBackend;
  if (established !== cell.actualBackend) {
    throw new Error("AUTO actual backend drifted without the required stop.");
  }
  return established;
}

function validateAutoDriftBackend(
  cell: BenchmarkCellResult,
  established: ActualRendererBackend | null,
): ActualRendererBackend {
  const measuredDrift = cell.warmupStatus === "VALID";
  const baselineBackend = measuredDrift ? established ?? cell.actualBackend : established;
  const driftBackend = measuredDrift
    ? terminalSampleBackend(cell)
    : cell.actualBackend;
  const cellBaselineChanged = measuredDrift && cell.actualBackend !== baselineBackend;
  if (
    baselineBackend === null ||
    driftBackend === null ||
    baselineBackend === driftBackend ||
    cellBaselineChanged
  ) {
    throw new Error("AUTO_BACKEND_DRIFT requires a changed actual backend.");
  }
  return baselineBackend;
}

function terminalSampleBackend(cell: BenchmarkCellResult): ActualRendererBackend | null {
  const terminal = cell.rawMeasuredSamples.at(-1);
  return terminal === undefined ? null : terminal.actualBackend;
}

function validateBackendConsistency(cell: BenchmarkCellResult, label: string): void {
  const inconsistentValidSample = cell.rawMeasuredSamples.some((sample) =>
    sample.status === "VALID" && cell.actualBackend !== sample.actualBackend,
  );
  if (inconsistentValidSample) throw new Error(`${label} valid sample backend is inconsistent.`);
}

function validateCompleteCell(
  cell: BenchmarkCellResult,
  requiredSamples: number,
  label: string,
): void {
  const validAuthority = cell.cellStopReason === "NONE" &&
    cell.warmupStatus === "VALID" &&
    cell.cleanupOutcome.status === "ZERO" &&
    cell.actualBackend !== null;
  if (!validAuthority) throw new Error(`${label} complete outcome is inconsistent.`);
  const validCardinality = cell.rawMeasuredSamples.length === requiredSamples &&
    cell.rawMeasuredSamples.every((sample) => sample.status === "VALID");
  if (!validCardinality) throw new Error(`${label} complete cardinality is invalid.`);
  if (
    cell.requestedBackend === "WEBGL2" &&
    cell.actualBackend !== "WEBGL2"
  ) {
    throw new Error(`${label} forced WEBGL2 complete evidence must use WEBGL2.`);
  }
}

function validateTerminalCell(
  cell: BenchmarkCellResult,
  label: string,
): void {
  if (cell.cellStopReason === "NONE") {
    throw new Error(`${label} non-complete outcome requires a stop reason.`);
  }
  const terminal = benchmarkTerminalOutcome(cell.cellStopReason);
  if (cell.cellOutcome !== terminal) {
    throw new Error(`${label} outcome contradicts its stop reason.`);
  }
  if (cell.warmupStatus === "VALID") {
    const terminalSample = cell.rawMeasuredSamples.at(-1);
    if (
      terminalSample === undefined ||
      terminalSample.status !== terminal ||
      terminalSample.stopReason !== cell.cellStopReason
    ) {
      throw new Error(`${label} measured terminal evidence is inconsistent.`);
    }
    return;
  }
  if (cell.warmupStatus !== terminal || cell.rawMeasuredSamples.length !== 0) {
    throw new Error(`${label} warmup terminal evidence is inconsistent.`);
  }
}

function validateMeasuredOrdinals(cell: BenchmarkCellResult, label: string): void {
  for (const [index, sample] of cell.rawMeasuredSamples.entries()) {
    if (sample.ordinal !== index + 1) {
      throw new Error(`${label} measured sample ordinals must be exactly 1..N.`);
    }
  }
}

function validateCellOutcome(
  cell: BenchmarkCellResult,
  configuration: BenchmarkSessionConfiguration,
  label: string,
): void {
  if (cell.cellOutcome === "COMPLETE") {
    validateCompleteCell(cell, configuration.measuredSamplesPerCell, label);
  } else {
    validateTerminalCell(cell, label);
  }
  if (cell.rawMeasuredSamples.length > configuration.measuredSamplesPerCell) {
    throw new Error(`${label} exceeds measured sample cardinality.`);
  }
  validateMeasuredOrdinals(cell, label);
}

function validateCellSemantics(
  cells: readonly BenchmarkCellResult[],
  configuration: BenchmarkSessionConfiguration,
): void {
  const expected = schedule(configuration);
  const priorByProfile = new Map<RequestedRendererBackend, BenchmarkCellResult>();
  let scheduleIndex = -1;
  let autoBackend: ActualRendererBackend | null = null;
  for (const [index, cell] of cells.entries()) {
    const label = `cells[${index}]`;
    scheduleIndex = nextScheduleIndex(expected, scheduleIndex, cell, label);
    validateProfileProgression(cell, priorByProfile, label);
    validateBackendConsistency(cell, label);
    autoBackend = validateAutoBackend(cell, autoBackend);
    validateCellOutcome(cell, configuration, label);
    validateSummarySemantics(cell, `${label}.metricSummaries`);
  }
}

export function createBenchmarkMetricSummaries(
  samples: readonly BenchmarkMeasuredSample[],
): BenchmarkMetricSummaries {
  const valid = samples.filter((sample) => sample.status === "VALID");
  const summarize = (name: BenchmarkTimingName): BenchmarkMetricSummary => {
    const rawValues = valid
      .map((sample) => sample.timings[name])
      .filter((value): value is number => value !== null);
    return {
      count: rawValues.length,
      median: median(rawValues),
      minimum: rawValues.length === 0 ? null : Math.min(...rawValues),
      maximum: rawValues.length === 0 ? null : Math.max(...rawValues),
      rawValues,
    };
  };
  return {
    inputConstructionCpuMs: summarize("inputConstructionCpuMs"),
    inputValidationCpuMs: summarize("inputValidationCpuMs"),
    backendConstructionCpuMs: summarize("backendConstructionCpuMs"),
    sceneSetupCpuMs: summarize("sceneSetupCpuMs"),
    rendererInitWallMs: summarize("rendererInitWallMs"),
    geometrySelectCpuMs: summarize("geometrySelectCpuMs"),
    geometryCreateCpuMs: summarize("geometryCreateCpuMs"),
    geometryMergeCpuMs: summarize("geometryMergeCpuMs"),
    geometryFinalizeCpuMs: summarize("geometryFinalizeCpuMs"),
    firstRenderSubmitCpuMs: summarize("firstRenderSubmitCpuMs"),
    candidateToLogicalReadyMs: summarize("candidateToLogicalReadyMs"),
    teardownCpuMs: summarize("teardownCpuMs"),
    totalSampleWallMs: summarize("totalSampleWallMs"),
  };
}

function readResultArrays(record: Record<string, unknown>): {
  readonly cells: readonly unknown[];
  readonly warnings: readonly unknown[];
} {
  if (!Array.isArray(record.cells) || !Array.isArray(record.warnings)) {
    throw new Error("Result cells and warnings must be arrays.");
  }
  return { cells: record.cells, warnings: record.warnings };
}

function validateRunAuthority(
  source: BenchmarkSourceProvenance,
  configuration: BenchmarkSessionConfiguration,
  warnings: readonly BenchmarkWarning[],
): void {
  if (configuration.runKind === "CHARACTERIZATION" && source.treeState !== "CLEAN") {
    throw new Error("Decision-bearing characterization requires clean source.");
  }
  if (
    configuration.runKind === "VERIFICATION_SMOKE" &&
    !warnings.includes("NON_DECISION_BEARING")
  ) {
    throw new Error("Verification smoke must disclose NON_DECISION_BEARING.");
  }
}

function validateRunOutcome(
  outcome: BenchmarkRunOutcome,
  stopReason: BenchmarkStopReason,
  cells: readonly BenchmarkCellResult[],
  configuration: BenchmarkSessionConfiguration,
): void {
  if (outcome !== "COMPLETE") {
    if (stopReason === "NONE") throw new Error("Non-complete result requires a stop reason.");
    if (outcome !== benchmarkTerminalOutcome(stopReason)) {
      throw new Error("Result outcome contradicts its stop reason.");
    }
    return;
  }
  const complete = stopReason === "NONE" &&
    cells.length === schedule(configuration).length &&
    cells.every((cell) => cell.cellOutcome === "COMPLETE");
  if (!complete) throw new Error("Complete result outcome is inconsistent.");
}

function validateCompleteEnvironment(
  environment: BenchmarkEnvironment,
  cells: readonly BenchmarkCellResult[],
): void {
  if (!cells.some((cell) => cell.cellOutcome === "COMPLETE")) return;
  if (
    environment.drawingBufferWidth <= 0 ||
    environment.drawingBufferHeight <= 0 ||
    environment.devicePixelRatio <= 0 ||
    environment.rendererPixelRatio <= 0
  ) {
    throw new Error("Complete evidence requires positive buffer and pixel-ratio values.");
  }
  if (
    environment.drawingBufferWidth !== 800 * environment.rendererPixelRatio ||
    environment.drawingBufferHeight !== 600 * environment.rendererPixelRatio
  ) {
    throw new Error("Complete evidence drawing buffer must exactly match the fixed viewport and renderer pixel ratio.");
  }
}

export function validateRendererBenchmarkResult(value: unknown): RendererBenchmarkResult {
  const record = exactRecord(value, [
    "schema", "version", "measurementContract", "classification", "source",
    "environment", "sessionConfiguration", "cells", "outcome", "stopReason",
    "warnings",
  ], "result");
  if (record.schema !== RENDERER_BENCHMARK_RESULT_SCHEMA || record.version !== 2) {
    throw new Error("Result schema/version is unsupported.");
  }
  if (record.measurementContract !== RENDERER_BENCHMARK_MEASUREMENT_CONTRACT) {
    throw new Error("Result measurementContract is unsupported.");
  }
  if (record.classification !== "BENCHMARK_ONLY") {
    throw new Error("Result classification must be BENCHMARK_ONLY.");
  }
  const arrays = readResultArrays(record);
  const source = readSource(record.source);
  const environment = readEnvironment(record.environment);
  const sessionConfiguration = readConfiguration(record.sessionConfiguration);
  const cells = arrays.cells.map(readCell);
  const outcome = enumValue(record.outcome, RUN_OUTCOMES, "outcome");
  const stopReason = enumValue(record.stopReason, STOP_REASONS, "stopReason");
  const warnings = arrays.warnings.map((warning, index) =>
    enumValue(warning, WARNINGS, `warnings[${index}]`),
  );
  if (new Set(warnings).size !== warnings.length) throw new Error("warnings must be unique.");
  validateRunAuthority(source, sessionConfiguration, warnings);
  validateCellSemantics(cells, sessionConfiguration);
  validateCompleteEnvironment(environment, cells);
  validateRunOutcome(outcome, stopReason, cells, sessionConfiguration);
  return {
    schema: RENDERER_BENCHMARK_RESULT_SCHEMA,
    version: RENDERER_BENCHMARK_RESULT_VERSION,
    measurementContract: RENDERER_BENCHMARK_MEASUREMENT_CONTRACT,
    classification: "BENCHMARK_ONLY",
    source,
    environment,
    sessionConfiguration,
    cells,
    outcome,
    stopReason,
    warnings,
  };
}

export function serializeRendererBenchmarkResult(value: unknown): string {
  return `${JSON.stringify(validateRendererBenchmarkResult(value), null, 2)}\n`;
}

export function rendererBenchmarkResultFilename(result: RendererBenchmarkResult): string {
  return `mira-r2ca-v03-${result.sessionConfiguration.runKind.toLowerCase()}-${result.environment.startedAt.replaceAll(":", "-")}.json`;
}
