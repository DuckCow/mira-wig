import { spawn } from "node:child_process";
import type { EventEmitter } from "node:events";
import { constants as fsConstants } from "node:fs";
import { access, lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { types as utilTypes } from "node:util";
import {
  TB1_COMMAND_TIMEOUT_MS,
  TB1_MAX_STDERR_BYTES,
  TB1_MAX_STDOUT_BYTES,
  TB2A_COMMAND_KINDS,
  buildTb2aReadOnlyCommand,
  parseTb2aCommandOutput,
  type Tb2aCommandKind,
  type Tb2aCommandResult,
} from "./refund-p3e-b2-bootstrap-readiness.mjs";

export const TB2A_SIGTERM_GRACE_MS = 2_000;
export const TB2A_CLOSE_DEADLINE_MS = 5_000;
export const TB2A_PROCESS_MODE_FIXTURE = "FIXTURE_SELF_CHECK";
export const TB2A_PROCESS_MODE_ATTENDED = "ATTENDED_GCLOUD";

export type Tb2aProcessMode =
  | typeof TB2A_PROCESS_MODE_FIXTURE
  | typeof TB2A_PROCESS_MODE_ATTENDED;

export type Tb2aProcessTiming = Readonly<{
  commandDeadlineMs: number;
  sigtermGraceMs: number;
  closeDeadlineMs: number;
}>;

export type Tb2aProcessDependencies = Readonly<{
  signalProcessGroup(pid: number, signal: NodeJS.Signals): void;
  spawnProcess?(request: Tb2aSpawnRequest): Tb2aChildProcess;
  validateExecutionDirectory?(
    candidate: string,
    repositoryRoot: string,
  ): Promise<string | null>;
}>;

export type Tb2aChildProcess = Readonly<
  Pick<EventEmitter, "off" | "on" | "once">
  & {
    pid?: number;
    stdout: Readable;
    stderr: Readable;
  }
>;

export type Tb2aSpawnRequest = Readonly<{
  executable: string;
  args: readonly string[];
  timing: Tb2aProcessTiming;
  options: Readonly<{
    cwd: string;
    env: Readonly<Record<string, string> & { NODE_ENV: "production" }>;
    shell: false;
    detached: true;
    stdio: readonly ["ignore", "pipe", "pipe"];
  }>;
}>;

export type Tb2aExecutableBoundary =
  | Readonly<{
    ok: true;
    launcherPath: string;
    pythonPath: string;
  }>
  | Readonly<{
    ok: false;
    reason: "EXECUTABLE_BOUNDARY_REJECTED";
  }>;

type SnapshotExecutionInputCommon = Readonly<{
  kind: Tb2aCommandKind;
  executable: string;
  args: readonly string[];
  env: Readonly<Record<string, string>>;
  cwd: string;
  repositoryRoot: string;
  projectId: string;
  projectNumber?: string;
  timing: Tb2aProcessTiming;
}>;

type SnapshotExecutionInput =
  | Readonly<SnapshotExecutionInputCommon & {
    mode: typeof TB2A_PROCESS_MODE_FIXTURE;
  }>
  | Readonly<SnapshotExecutionInputCommon & {
    mode: typeof TB2A_PROCESS_MODE_ATTENDED;
    pythonPath: string;
    cloudSdkConfigPath: string;
    configurationName: string;
    homePath: string;
    temporaryPath: string;
    path: string;
    utf8Locale: string;
  }>;

type AdmittedExecutionRequest = Readonly<{
  mode: Tb2aProcessMode;
  kind: Tb2aCommandKind;
  projectId: string;
  projectNumber?: string;
  configurationName?: string;
  cloudSdkConfigPath?: string;
  pythonPath?: string;
  timing: Tb2aProcessTiming;
  spawn: Tb2aSpawnRequest;
}>;

type BoundedProcessResult =
  | Readonly<{
    ok: true;
    stdout: Uint8Array;
  }>
  | Readonly<{
    ok: false;
    reason:
      | "OUTPUT_LIMIT_EXCEEDED"
      | "COMMAND_FAILED"
      | "PROCESS_TIMEOUT"
      | "PROCESS_SIGNALLED"
      | "PROCESS_TERMINATION_UNCONFIRMED";
  }>;

const ATTENDED_ENVIRONMENT_KEYS = Object.freeze([
  "CLOUDSDK_CONFIG",
  "CLOUDSDK_ACTIVE_CONFIG_NAME",
  "CLOUDSDK_CORE_PROJECT",
  "CLOUDSDK_PYTHON",
  "CLOUDSDK_CORE_DISABLE_PROMPTS",
  "CLOUDSDK_CORE_DISABLE_USAGE_REPORTING",
  "CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK",
  "CLOUDSDK_CORE_DISABLE_FILE_LOGGING",
  "CLOUDSDK_CORE_DISABLE_COLOR",
  "CLOUDSDK_CORE_USER_OUTPUT_ENABLED",
  "CLOUDSDK_CORE_VERBOSITY",
  "HOME",
  "TMPDIR",
  "PATH",
  "TERM",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
]);

const CREDENTIAL_ENVIRONMENT_NAMES = Object.freeze([
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "GCLOUD_PROJECT",
  "CLOUDSDK_CORE_ACCOUNT",
  "CLOUDSDK_AUTH_ACCESS_TOKEN_FILE",
  "CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE",
  "CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT",
  "CLOUDSDK_BILLING_QUOTA_PROJECT",
  "GOOGLE_CLOUD_QUOTA_PROJECT",
]);

const CREDENTIAL_ENVIRONMENT_PREFIXES = Object.freeze([
  "CLOUDSDK_API_ENDPOINT_OVERRIDES_",
  "CLOUDSDK_PROXY_",
]);

// This authority resists post-module-load global executable-path rebinding
// only. It does not protect a process whose source or runtime was controlled
// before this module evaluated.
const MODULE_NODE_EXECUTABLE_PATH = `${process.execPath}`;
const TB2A_REPOSITORY_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
const TB2A_FIXTURE_PATH = resolve(
  TB2A_REPOSITORY_ROOT,
  "src/lib/payment/refund/__tests__/fixtures/"
    + "refund-p3e-b2-child-fixture.mjs",
);
const EXECUTION_COMMON_KEYS = Object.freeze([
  "args",
  "cwd",
  "env",
  "executable",
  "kind",
  "mode",
  "projectId",
  "repositoryRoot",
]);
const FIXTURE_OPTIONAL_KEYS = Object.freeze([
  "projectNumber",
  "timing",
]);
const ATTENDED_REQUIRED_KEYS = Object.freeze([
  "cloudSdkConfigPath",
  "configurationName",
  "homePath",
  "path",
  "pythonPath",
  "temporaryPath",
  "utf8Locale",
]);
const ATTENDED_OPTIONAL_KEYS = Object.freeze([
  "projectNumber",
]);

export function buildTb2aAttendedEnvironment(
  input: Readonly<{
    cloudSdkConfigPath: string;
    configurationName: string;
    projectId: string;
    pythonPath: string;
    homePath: string;
    temporaryPath: string;
    path: string;
    utf8Locale: string;
  }>,
): Readonly<Record<string, string>> {
  if (utilTypes.isProxy(input)) {
    throw new Error("TB2A_ENVIRONMENT_REJECTED");
  }
  if (![
    input.cloudSdkConfigPath,
    input.pythonPath,
    input.homePath,
    input.temporaryPath,
  ].every(isAbsolute)
    || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,62}$/u.test(input.configurationName)
    || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(input.projectId)
    || input.path.length === 0
    || !/^[A-Za-z0-9_.@-]+$/u.test(input.utf8Locale)) {
    throw new Error("TB2A_ENVIRONMENT_REJECTED");
  }
  return frozenStringRecord([
    ["CLOUDSDK_CONFIG", input.cloudSdkConfigPath],
    ["CLOUDSDK_ACTIVE_CONFIG_NAME", input.configurationName],
    ["CLOUDSDK_CORE_PROJECT", input.projectId],
    ["CLOUDSDK_PYTHON", input.pythonPath],
    ["CLOUDSDK_CORE_DISABLE_PROMPTS", "1"],
    ["CLOUDSDK_CORE_DISABLE_USAGE_REPORTING", "true"],
    ["CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK", "true"],
    ["CLOUDSDK_CORE_DISABLE_FILE_LOGGING", "true"],
    ["CLOUDSDK_CORE_DISABLE_COLOR", "true"],
    ["CLOUDSDK_CORE_USER_OUTPUT_ENABLED", "true"],
    ["CLOUDSDK_CORE_VERBOSITY", "none"],
    ["HOME", input.homePath],
    ["TMPDIR", input.temporaryPath],
    ["PATH", input.path],
    ["TERM", "dumb"],
    ["LANG", input.utf8Locale],
    ["LC_ALL", input.utf8Locale],
    ["NODE_ENV", "production"],
  ]);
}

export function tb2aCredentialBearingEnvironmentPresent(
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  if (utilTypes.isProxy(environment)) return true;
  return Object.entries(environment).some(([name, value]) => (
    value !== undefined && value.length > 0
      && (CREDENTIAL_ENVIRONMENT_NAMES.includes(name)
        || CREDENTIAL_ENVIRONMENT_PREFIXES.some(
          (prefix) => name.startsWith(prefix),
        ))
  ));
}

export function validTb2aAttendedEnvironment(
  environment: Readonly<Record<string, string>>,
): boolean {
  if (utilTypes.isProxy(environment)) return false;
  const keys = Object.keys(environment).sort();
  const expected = [...ATTENDED_ENVIRONMENT_KEYS].sort();
  if (keys.length !== expected.length
    || !keys.every((key, index) => key === expected[index])) return false;
  const requiredValues = {
    CLOUDSDK_CORE_USER_OUTPUT_ENABLED: "true",
    CLOUDSDK_CORE_DISABLE_PROMPTS: "1",
    CLOUDSDK_CORE_DISABLE_USAGE_REPORTING: "true",
    CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK: "true",
    CLOUDSDK_CORE_DISABLE_FILE_LOGGING: "true",
    CLOUDSDK_CORE_DISABLE_COLOR: "true",
    CLOUDSDK_CORE_VERBOSITY: "none",
    TERM: "dumb",
    NODE_ENV: "production",
  };
  return Object.entries(requiredValues).every(
    ([name, value]) => environment[name] === value,
  )
    && environment.LANG === environment.LC_ALL
    && [
      environment.CLOUDSDK_CONFIG,
      environment.CLOUDSDK_PYTHON,
      environment.HOME,
      environment.TMPDIR,
    ].every((value) => isAbsolute(value ?? ""));
}

export async function validateTb2aExecutableBoundary(
  input: Readonly<{
    launcherPath: string;
    pythonPath: string;
    repositoryRoot: string;
  }>,
): Promise<Tb2aExecutableBoundary> {
  if (utilTypes.isProxy(input)) return rejectedExecutableBoundary();
  try {
    const [launcherPath, pythonPath] = await Promise.all([
      admittedExecutablePath(input.launcherPath, input.repositoryRoot),
      admittedExecutablePath(input.pythonPath, input.repositoryRoot),
    ]);
    if (!launcherPath || !pythonPath) return rejectedExecutableBoundary();
    return Object.freeze({ ok: true, launcherPath, pythonPath });
  } catch {
    return rejectedExecutableBoundary();
  }
}

async function admittedExecutablePath(
  candidate: string,
  repositoryRoot: string,
): Promise<string | null> {
  if (!isAbsolute(candidate) || !isAbsolute(repositoryRoot)) return null;
  const before = await lstat(candidate);
  if (before.isSymbolicLink() || !before.isFile()
    || (before.mode & 0o022) !== 0 || !safeExecutableOwner(before.uid)) {
    return null;
  }
  await access(candidate, fsConstants.X_OK);
  const [canonicalCandidate, canonicalRoot] = await Promise.all([
    realpath(candidate),
    realpath(repositoryRoot),
  ]);
  return pathOutside(canonicalCandidate, canonicalRoot)
    ? canonicalCandidate
    : null;
}

function safeExecutableOwner(uid: number): boolean {
  const current = typeof process.getuid === "function"
    ? process.getuid()
    : null;
  return uid === 0 || current !== null && uid === current;
}

function pathOutside(candidate: string, root: string): boolean {
  const relationship = relative(root, candidate);
  return relationship === ".."
    || relationship.startsWith(`..${sep}`)
    || isAbsolute(relationship);
}

function rejectedExecutableBoundary(): Tb2aExecutableBoundary {
  return Object.freeze({
    ok: false,
    reason: "EXECUTABLE_BOUNDARY_REJECTED",
  });
}

function snapshotTb2aExecutionInput(
  input: unknown,
): SnapshotExecutionInput | null {
  const descriptors = dataPropertyDescriptors(input);
  if (!descriptors) return null;
  const modeDescriptor = descriptors.get("mode");
  if (!modeDescriptor) return null;
  const mode: unknown = modeDescriptor.value;
  if (mode === TB2A_PROCESS_MODE_FIXTURE) {
    return snapshotFixtureInput(descriptors);
  }
  if (mode === TB2A_PROCESS_MODE_ATTENDED) {
    return snapshotAttendedInput(descriptors);
  }
  return null;
}

function snapshotFixtureInput(
  descriptors: ReadonlyMap<string, PropertyDescriptor>,
): SnapshotExecutionInput | null {
  if (!hasExactInputKeys(
    descriptors,
    EXECUTION_COMMON_KEYS,
    FIXTURE_OPTIONAL_KEYS,
  )) return null;
  const timing = descriptors.has("timing")
    ? copiedTiming(descriptors.get("timing")?.value)
    : canonicalAttendedTiming();
  const common = snapshotCommonInput(descriptors, timing);
  if (!common) return null;
  return Object.freeze({
    mode: TB2A_PROCESS_MODE_FIXTURE,
    ...common,
  });
}

function snapshotAttendedInput(
  descriptors: ReadonlyMap<string, PropertyDescriptor>,
): SnapshotExecutionInput | null {
  const required = Object.freeze([
    ...EXECUTION_COMMON_KEYS,
    ...ATTENDED_REQUIRED_KEYS,
  ]);
  if (!hasExactInputKeys(
    descriptors,
    required,
    ATTENDED_OPTIONAL_KEYS,
  )) return null;
  const common = snapshotCommonInput(
    descriptors,
    canonicalAttendedTiming(),
  );
  const pythonPath = stringDescriptorValue(descriptors, "pythonPath");
  const cloudSdkConfigPath = stringDescriptorValue(
    descriptors,
    "cloudSdkConfigPath",
  );
  const configurationName = stringDescriptorValue(
    descriptors,
    "configurationName",
  );
  const homePath = stringDescriptorValue(descriptors, "homePath");
  const temporaryPath = stringDescriptorValue(
    descriptors,
    "temporaryPath",
  );
  const path = stringDescriptorValue(descriptors, "path");
  const utf8Locale = stringDescriptorValue(descriptors, "utf8Locale");
  if (!common
    || pythonPath === null
    || cloudSdkConfigPath === null
    || configurationName === null
    || homePath === null
    || temporaryPath === null
    || path === null
    || utf8Locale === null) return null;
  return Object.freeze({
    mode: TB2A_PROCESS_MODE_ATTENDED,
    ...common,
    pythonPath,
    cloudSdkConfigPath,
    configurationName,
    homePath,
    temporaryPath,
    path,
    utf8Locale,
  });
}

function snapshotCommonInput(
  descriptors: ReadonlyMap<string, PropertyDescriptor>,
  timing: Tb2aProcessTiming | null,
): SnapshotExecutionInputCommon | null {
  const scalars = snapshotCommonScalars(descriptors);
  const args = copiedStringArray(descriptors.get("args")?.value);
  const env = copiedStringRecord(descriptors.get("env")?.value);
  const projectNumber = optionalStringDescriptorValue(
    descriptors,
    "projectNumber",
  );
  if (!scalars
    || !args
    || !env
    || !timing
    || !projectNumber.ok) return null;
  return Object.freeze({
    ...scalars,
    args,
    env,
    ...(projectNumber.value === undefined
      ? {}
      : { projectNumber: projectNumber.value }),
    timing,
  });
}

type SnapshotCommonScalars = Readonly<{
  kind: Tb2aCommandKind;
  executable: string;
  cwd: string;
  repositoryRoot: string;
  projectId: string;
}>;

function snapshotCommonScalars(
  descriptors: ReadonlyMap<string, PropertyDescriptor>,
): SnapshotCommonScalars | null {
  const kind = stringDescriptorValue(descriptors, "kind");
  const executable = stringDescriptorValue(descriptors, "executable");
  const cwd = stringDescriptorValue(descriptors, "cwd");
  const repositoryRoot = stringDescriptorValue(
    descriptors,
    "repositoryRoot",
  );
  const projectId = stringDescriptorValue(descriptors, "projectId");
  const candidates = Object.freeze({
    kind,
    executable,
    cwd,
    repositoryRoot,
    projectId,
  });
  return completeCommonScalars(candidates) ? candidates : null;
}

function completeCommonScalars(
  value: Readonly<{
    kind: string | null;
    executable: string | null;
    cwd: string | null;
    repositoryRoot: string | null;
    projectId: string | null;
  }>,
): value is SnapshotCommonScalars {
  return value.kind !== null
    && validCommandKind(value.kind)
    && value.executable !== null
    && value.cwd !== null
    && value.repositoryRoot !== null
    && value.projectId !== null;
}

function dataPropertyDescriptors(
  value: unknown,
): ReadonlyMap<string, PropertyDescriptor> | null {
  try {
    if (utilTypes.isProxy(value)) return null;
    if (!ordinaryDataObject(value)) return null;
    const descriptors = new Map<string, PropertyDescriptor>();
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return null;
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) return null;
      descriptors.set(key, descriptor);
    }
    return descriptors;
  } catch {
    return null;
  }
}

function ordinaryDataObject(
  value: unknown,
): value is Readonly<Record<PropertyKey, unknown>> {
  if (utilTypes.isProxy(value)
    || typeof value !== "object"
    || value === null
    || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactInputKeys(
  descriptors: ReadonlyMap<string, PropertyDescriptor>,
  required: readonly string[],
  optional: readonly string[],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => descriptors.has(key))
    && descriptors.size >= required.length
    && descriptors.size <= allowed.size
    && [...descriptors.keys()].every((key) => allowed.has(key));
}

function stringDescriptorValue(
  descriptors: ReadonlyMap<string, PropertyDescriptor>,
  key: string,
): string | null {
  const value: unknown = descriptors.get(key)?.value;
  return typeof value === "string" ? value : null;
}

function optionalStringDescriptorValue(
  descriptors: ReadonlyMap<string, PropertyDescriptor>,
  key: string,
): Readonly<{ ok: true; value?: string }> | Readonly<{ ok: false }> {
  if (!descriptors.has(key)) return Object.freeze({ ok: true });
  const value: unknown = descriptors.get(key)?.value;
  if (value === undefined) return Object.freeze({ ok: true });
  return typeof value === "string"
    ? Object.freeze({ ok: true, value })
    : Object.freeze({ ok: false });
}

function copiedStringArray(value: unknown): readonly string[] | null {
  try {
    if (utilTypes.isProxy(value)) return null;
    const length = exactStringArrayLength(value);
    return length === null ? null : copiedStringElements(value, length);
  } catch {
    return null;
  }
}

function exactStringArrayLength(value: unknown): number | null {
  if (utilTypes.isProxy(value)
    || !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, "length");
  const length: unknown = lengthDescriptor?.value;
  if (typeof length !== "number" || !Number.isSafeInteger(length)
    || length < 0) return null;
  const keys = Reflect.ownKeys(value);
  return keys.length === length + 1 && keys.includes("length")
    ? length
    : null;
}

function copiedStringElements(
  value: unknown,
  length: number,
): readonly string[] | null {
  if (utilTypes.isProxy(value) || !Array.isArray(value)) return null;
  const copied: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)
      || typeof descriptor.value !== "string") return null;
    copied.push(descriptor.value);
  }
  return Object.freeze(copied);
}

function copiedStringRecord(
  value: unknown,
): Readonly<Record<string, string>> | null {
  const descriptors = dataPropertyDescriptors(value);
  if (!descriptors) return null;
  const copied = emptyNullPrototypeStringRecord();
  for (const [key, descriptor] of descriptors) {
    const candidate: unknown = descriptor.value;
    if (typeof candidate !== "string") return null;
    defineStringDataProperty(copied, key, candidate);
  }
  return Object.freeze(copied);
}

function emptyNullPrototypeStringRecord(): Record<string, string> {
  const candidate: unknown = Object.create(null);
  if (!isNullPrototypeStringRecord(candidate)) {
    throw new Error("TB2A_NULL_RECORD_CONSTRUCTION_FAILED");
  }
  return candidate;
}

function isNullPrototypeStringRecord(
  value: unknown,
): value is Record<string, string> {
  return typeof value === "object"
    && value !== null
    && !utilTypes.isProxy(value)
    && Object.getPrototypeOf(value) === null;
}

function defineStringDataProperty(
  target: Record<string, string>,
  key: string,
  value: string,
): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function frozenStringRecord(
  entries: readonly (readonly [string, string])[],
): Readonly<Record<string, string>> {
  const record = emptyNullPrototypeStringRecord();
  for (const [key, value] of entries) {
    defineStringDataProperty(record, key, value);
  }
  return Object.freeze(record);
}

export async function executeTb2aProcessCommand(
  input: unknown,
  dependencies?: Tb2aProcessDependencies,
): Promise<Tb2aCommandResult> {
  const snapshot = snapshotTb2aExecutionInput(input);
  if (!snapshot) return rejectedCommandBeforeAttempt();
  const admitted = await admittedExecutionInput(
    snapshot,
    dependencies,
  ).catch(() => null);
  if (!admitted) {
    return rejectedCommandBeforeAttempt();
  }
  const processResult = await superviseBoundedProcess(
    admitted,
    dependencies ?? defaultProcessDependencies(),
  );
  if (!processResult.ok) {
    return Object.freeze({
      ok: false,
      reason: processResult.reason,
      attemptCount: 1,
    });
  }
  return parseTb2aCommandOutput(admitted.kind, processResult.stdout, {
    projectId: admitted.projectId,
    projectNumber: admitted.projectNumber,
  });
}

export function executeTb2aSelfCheckFixtureCommand(
  kind: Tb2aCommandKind,
  cwd: string,
  projectId: string,
  projectNumber?: string,
): Promise<Tb2aCommandResult> {
  return executeTb2aProcessCommand({
    mode: TB2A_PROCESS_MODE_FIXTURE,
    kind,
    executable: MODULE_NODE_EXECUTABLE_PATH,
    args: [TB2A_FIXTURE_PATH, `command:${kind}`],
    env: frozenStringRecord([]),
    cwd,
    repositoryRoot: TB2A_REPOSITORY_ROOT,
    projectId,
    ...(projectNumber === undefined ? {} : { projectNumber }),
  });
}

function rejectedCommandBeforeAttempt(): Tb2aCommandResult {
  return Object.freeze({
    ok: false,
    reason: "COMMAND_FAILED",
    attemptCount: 0,
  });
}

async function admittedExecutionInput(
  input: SnapshotExecutionInput,
  dependencies?: Tb2aProcessDependencies,
): Promise<AdmittedExecutionRequest | null> {
  const validateDirectory = dependencies?.validateExecutionDirectory
    ?? admittedExecutionDirectory;
  const cwd = await validateDirectory(
    input.cwd,
    input.repositoryRoot,
  );
  if (!cwd) return null;
  if (input.mode === TB2A_PROCESS_MODE_FIXTURE) {
    return admittedFixtureInput(input, cwd);
  }
  if (input.mode !== TB2A_PROCESS_MODE_ATTENDED) return null;
  return admittedAttendedInput(input, cwd);
}

async function admittedFixtureInput(
  input: Extract<
    SnapshotExecutionInput,
    { mode: typeof TB2A_PROCESS_MODE_FIXTURE }
  >,
  cwd: string,
): Promise<AdmittedExecutionRequest | null> {
  const [fixtureExecutable, fixturePath] = await Promise.all([
    admittedFixtureExecutable(input.executable),
    admittedFixturePath(input.args[0]),
  ]);
  if (!fixtureExecutable
    || !fixturePath
    || !validFixtureArgs(input)
    || input.repositoryRoot !== TB2A_REPOSITORY_ROOT
    || !exactEnvironment(input.env, Object.freeze({}))) return null;
  return freezeExecutionRequest({
    mode: TB2A_PROCESS_MODE_FIXTURE,
    kind: input.kind,
    executable: fixtureExecutable,
    args: input.args,
    env: Object.freeze({}),
    cwd,
    projectId: input.projectId,
    projectNumber: input.projectNumber,
    timing: input.timing,
  });
}

async function admittedAttendedInput(
  input: Extract<
    SnapshotExecutionInput,
    { mode: typeof TB2A_PROCESS_MODE_ATTENDED }
  >,
  cwd: string,
): Promise<AdmittedExecutionRequest | null> {
  const environmentInput = admittedEnvironmentInput(input);
  if (!environmentInput) return null;
  const boundary = await validateTb2aExecutableBoundary({
    launcherPath: input.executable,
    pythonPath: environmentInput.pythonPath,
    repositoryRoot: input.repositoryRoot,
  });
  if (!boundary.ok
    || boundary.launcherPath !== input.executable
    || boundary.pythonPath !== environmentInput.pythonPath) return null;
  const expectedArgs = buildTb2aReadOnlyCommand(input.kind, {
    projectId: input.projectId,
    configurationName: environmentInput.configurationName,
  });
  const expectedEnvironment = buildTb2aAttendedEnvironment(environmentInput);
  if (!exactStrings(input.args, expectedArgs)
    || !exactEnvironment(input.env, expectedEnvironment)) return null;
  return freezeExecutionRequest({
    mode: TB2A_PROCESS_MODE_ATTENDED,
    kind: input.kind,
    executable: boundary.launcherPath,
    args: expectedArgs,
    env: expectedEnvironment,
    cwd,
    projectId: input.projectId,
    projectNumber: input.projectNumber,
    configurationName: environmentInput.configurationName,
    cloudSdkConfigPath: environmentInput.cloudSdkConfigPath,
    pythonPath: boundary.pythonPath,
    timing: input.timing,
  });
}

async function admittedFixturePath(candidate: string | undefined): Promise<
  string | null
> {
  if (candidate !== TB2A_FIXTURE_PATH) return null;
  try {
    const before = await lstat(candidate);
    if (before.isSymbolicLink() || !before.isFile()) return null;
    const canonical = await realpath(candidate);
    return canonical === TB2A_FIXTURE_PATH ? canonical : null;
  } catch {
    return null;
  }
}

async function admittedFixtureExecutable(
  candidate: string,
): Promise<string | null> {
  if (candidate !== MODULE_NODE_EXECUTABLE_PATH) return null;
  try {
    const before = await lstat(MODULE_NODE_EXECUTABLE_PATH);
    if (before.isSymbolicLink() || !before.isFile()) return null;
    const canonical = await realpath(MODULE_NODE_EXECUTABLE_PATH);
    return canonical === MODULE_NODE_EXECUTABLE_PATH
      ? MODULE_NODE_EXECUTABLE_PATH
      : null;
  } catch {
    return null;
  }
}

async function admittedExecutionDirectory(
  candidate: string,
  repositoryRoot: string,
): Promise<string | null> {
  if (!isAbsolute(candidate) || !isAbsolute(repositoryRoot)) return null;
  try {
    const before = await lstat(candidate);
    if (before.isSymbolicLink() || !before.isDirectory()
      || (before.mode & 0o777) !== 0o700) return null;
    const [canonicalCandidate, canonicalRoot] = await Promise.all([
      realpath(candidate),
      realpath(repositoryRoot),
    ]);
    return pathOutside(canonicalCandidate, canonicalRoot)
      ? canonicalCandidate
      : null;
  } catch {
    return null;
  }
}

function copiedTiming(value: unknown): Tb2aProcessTiming | null {
  if (!exactTimingContainer(value)) return null;
  const commandDeadlineMs = timingNumber(value, "commandDeadlineMs");
  const sigtermGraceMs = timingNumber(value, "sigtermGraceMs");
  const closeDeadlineMs = timingNumber(value, "closeDeadlineMs");
  if (commandDeadlineMs === null
    || sigtermGraceMs === null
    || closeDeadlineMs === null) return null;
  return Object.freeze({
    commandDeadlineMs,
    sigtermGraceMs,
    closeDeadlineMs,
  });
}

function exactTimingContainer(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  if (utilTypes.isProxy(value)
    || typeof value !== "object"
    || value === null
    || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const expected = Object.freeze([
    "closeDeadlineMs",
    "commandDeadlineMs",
    "sigtermGraceMs",
  ]);
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length
    && expected.every((key) => keys.includes(key));
}

function timingNumber(
  value: Readonly<Record<string, unknown>>,
  key: string,
): number | null {
  const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined || !("value" in descriptor)) return null;
  const candidate: unknown = descriptor.value;
  return typeof candidate === "number"
    && Number.isSafeInteger(candidate)
    && candidate > 0
    ? candidate
    : null;
}

type Tb2aAttendedEnvironmentInput =
  Parameters<typeof buildTb2aAttendedEnvironment>[0];

function admittedEnvironmentInput(
  input: Extract<
    SnapshotExecutionInput,
    { mode: typeof TB2A_PROCESS_MODE_ATTENDED }
  >,
): Tb2aAttendedEnvironmentInput | null {
  if (typeof input.cloudSdkConfigPath !== "string"
    || typeof input.configurationName !== "string"
    || typeof input.pythonPath !== "string"
    || typeof input.homePath !== "string"
    || typeof input.temporaryPath !== "string"
    || typeof input.path !== "string"
    || typeof input.utf8Locale !== "string") return null;
  return Object.freeze({
    cloudSdkConfigPath: input.cloudSdkConfigPath,
    configurationName: input.configurationName,
    projectId: input.projectId,
    pythonPath: input.pythonPath,
    homePath: input.homePath,
    temporaryPath: input.temporaryPath,
    path: input.path,
    utf8Locale: input.utf8Locale,
  });
}

function validCommandKind(value: unknown): value is Tb2aCommandKind {
  return typeof value === "string"
    && TB2A_COMMAND_KINDS.some((kind) => kind === value);
}

function validFixtureArgs(
  input: Extract<
    SnapshotExecutionInput,
    { mode: typeof TB2A_PROCESS_MODE_FIXTURE }
  >,
): boolean {
  if (!Array.isArray(input.args)
    || input.args[0] !== TB2A_FIXTURE_PATH) return false;
  const fixtureMode: unknown = input.args[1];
  if (fixtureMode === `command:${input.kind}`) {
    return exactStrings(input.args, [TB2A_FIXTURE_PATH, fixtureMode]);
  }
  const simpleModes = Object.freeze([
    "normal",
    "fast-exit",
    "nonzero",
    "ignore-term",
    "stdout-cap",
    "stderr-cap",
    "invalid-utf8",
    "continuous-write",
  ]);
  if (typeof fixtureMode === "string"
    && simpleModes.includes(fixtureMode)) {
    return exactStrings(input.args, [TB2A_FIXTURE_PATH, fixtureMode]);
  }
  if (fixtureMode !== "exit-with-descendant"
    || typeof input.args[2] !== "string"
    || typeof input.args[3] !== "string") return false;
  return exactStrings(input.args, [
    TB2A_FIXTURE_PATH,
    fixtureMode,
    input.args[2],
    input.args[3],
  ]);
}

function exactStrings(
  value: readonly string[],
  expected: readonly string[],
): boolean {
  if (utilTypes.isProxy(value)
    || utilTypes.isProxy(expected)
    || !Array.isArray(value)
    || value.length !== expected.length) return false;
  return expected.every((expectedValue, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    return descriptor !== undefined
      && "value" in descriptor
      && descriptor.value === expectedValue;
  });
}

function exactEnvironment(
  value: Readonly<Record<string, string>>,
  expected: Readonly<Record<string, string>>,
): boolean {
  if (utilTypes.isProxy(value) || utilTypes.isProxy(expected)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  const expectedKeys = Object.keys(expected);
  if (keys.length !== expectedKeys.length
    || keys.some((key) => typeof key !== "string")) return false;
  return expectedKeys.every((key) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined
      && "value" in descriptor
      && descriptor.value === expected[key];
  });
}

function freezeExecutionRequest(
  input: Readonly<{
    mode: Tb2aProcessMode;
    kind: Tb2aCommandKind;
    executable: string;
    args: readonly string[];
    env: Readonly<Record<string, string>>;
    cwd: string;
    projectId: string;
    projectNumber?: string;
    configurationName?: string;
    cloudSdkConfigPath?: string;
    pythonPath?: string;
    timing: Tb2aProcessTiming;
  }>,
): AdmittedExecutionRequest {
  const timing = Object.freeze({
    commandDeadlineMs: input.timing.commandDeadlineMs,
    sigtermGraceMs: input.timing.sigtermGraceMs,
    closeDeadlineMs: input.timing.closeDeadlineMs,
  });
  const envDescriptors = dataPropertyDescriptors(input.env);
  if (!envDescriptors) {
    throw new Error("TB2A_ENVIRONMENT_RECONSTRUCTION_FAILED");
  }
  const envEntries: [string, string][] = [];
  for (const [key, descriptor] of envDescriptors) {
    const value: unknown = descriptor.value;
    if (typeof value !== "string") {
      throw new Error("TB2A_ENVIRONMENT_RECONSTRUCTION_FAILED");
    }
    envEntries.push([key, value]);
  }
  envEntries.push(["NODE_ENV", "production"]);
  const env = frozenStringRecord(envEntries);
  if (!isProductionEnvironment(env)) {
    throw new Error("TB2A_ENVIRONMENT_RECONSTRUCTION_FAILED");
  }
  const spawnRequest: Tb2aSpawnRequest = Object.freeze({
    executable: input.executable,
    args: Object.freeze([...input.args]),
    timing,
    options: Object.freeze({
      cwd: input.cwd,
      env,
      shell: false,
      detached: true,
      stdio: Object.freeze(["ignore", "pipe", "pipe"] as const),
    }),
  });
  return Object.freeze({
    mode: input.mode,
    kind: input.kind,
    projectId: input.projectId,
    ...(input.projectNumber === undefined
      ? {}
      : { projectNumber: input.projectNumber }),
    ...(input.configurationName === undefined
      ? {}
      : { configurationName: input.configurationName }),
    ...(input.cloudSdkConfigPath === undefined
      ? {}
      : { cloudSdkConfigPath: input.cloudSdkConfigPath }),
    ...(input.pythonPath === undefined
      ? {}
      : { pythonPath: input.pythonPath }),
    timing,
    spawn: spawnRequest,
  });
}

function isProductionEnvironment(
  value: Readonly<Record<string, string>>,
): value is Readonly<
  Record<string, string> & { NODE_ENV: "production" }
> {
  return value.NODE_ENV === "production";
}

function canonicalAttendedTiming(): Tb2aProcessTiming {
  return Object.freeze({
    commandDeadlineMs: TB1_COMMAND_TIMEOUT_MS,
    sigtermGraceMs: TB2A_SIGTERM_GRACE_MS,
    closeDeadlineMs: TB2A_CLOSE_DEADLINE_MS,
  });
}

function defaultProcessDependencies(): Tb2aProcessDependencies {
  return Object.freeze({
    signalProcessGroup(pid, signal) {
      process.kill(-pid, signal);
    },
    spawnProcess(request) {
      return spawn(request.executable, [...request.args], {
        cwd: request.options.cwd,
        env: request.options.env,
        shell: request.options.shell,
        detached: request.options.detached,
        stdio: ["ignore", "pipe", "pipe"],
      });
    },
  });
}

function superviseBoundedProcess(
  input: AdmittedExecutionRequest,
  dependencies: Tb2aProcessDependencies,
): Promise<BoundedProcessResult> {
  return new Promise((resolve) => {
    const spawnProcess = dependencies.spawnProcess
      ?? defaultProcessDependencies().spawnProcess;
    if (!spawnProcess) {
      resolve(Object.freeze({ ok: false, reason: "COMMAND_FAILED" }));
      return;
    }
    let child: Tb2aChildProcess;
    try {
      child = spawnProcess(input.spawn);
    } catch {
      resolve(Object.freeze({ ok: false, reason: "COMMAND_FAILED" }));
      return;
    }
    const state = processState();
    let detachPipes = () => undefined;
    const detachStatefulChildHandlers = () => {
      installLateChildErrorSafetySink(child, state.closeObserved);
      child.off("error", onChildError);
      child.off("exit", onChildExit);
      child.off("close", onChildClose);
    };
    const settle = () => {
      if (state.settled) return;
      state.settled = true;
      detachPipes();
      detachPipes = () => undefined;
      detachStatefulChildHandlers();
      clearProcessTimers(state);
      resolve(finishBoundedProcess(state));
    };
    const control: ProcessControl = Object.freeze({
      settle,
      detachPipes: () => detachPipes(),
    });
    const commandTimer = setTimeout(() => {
      if (state.settled) return;
      latchReason(state, "PROCESS_TIMEOUT");
      requestTermination(child, state, input.timing, dependencies, control);
    }, input.timing.commandDeadlineMs);
    state.timers.add(commandTimer);

    const onStdout = (chunk: Buffer) => {
      if (state.settled) return;
      captureChunk(
        chunk,
        state.stdout,
        TB1_MAX_STDOUT_BYTES,
        state,
        child,
        input.timing,
        dependencies,
        control,
      );
    };
    const onStderr = (chunk: Buffer) => {
      if (state.settled) return;
      captureChunk(
        chunk,
        state.stderr,
        TB1_MAX_STDERR_BYTES,
        state,
        child,
        input.timing,
        dependencies,
        control,
      );
    };
    detachPipes = () => {
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
    };
    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.once("error", onChildError);
    child.once("exit", onChildExit);
    child.once("close", onChildClose);

    function onChildError(): void {
      if (state.settled) return;
      latchReason(state, "COMMAND_FAILED");
      beginCloseDeadline(child, state, input.timing, control);
    }

    function onChildExit(
      code: number | null,
      signal: NodeJS.Signals | null,
    ): void {
      if (state.settled) return;
      state.exitObserved = true;
      if (signal !== null) latchReason(state, "PROCESS_SIGNALLED");
      if (signal === null && code !== 0) latchReason(state, "COMMAND_FAILED");
      beginCloseDeadline(child, state, input.timing, control);
    }

    function onChildClose(): void {
      if (state.settled) return;
      state.closeObserved = true;
      settle();
    }
  });
}

function tb2aLateChildErrorSafetySink(): void {
  // A post-settlement child error must not become an unhandled EventEmitter
  // error. This stateless sink captures no error or supervision state.
}

function removeTb2aLateErrorSafetySinkOnClose(
  this: Tb2aChildProcess,
): void {
  this.off("error", tb2aLateChildErrorSafetySink);
  this.off("close", removeTb2aLateErrorSafetySinkOnClose);
}

function installLateChildErrorSafetySink(
  child: Tb2aChildProcess,
  closeObserved: boolean,
): void {
  child.on("error", tb2aLateChildErrorSafetySink);
  if (!closeObserved) {
    child.once("close", removeTb2aLateErrorSafetySinkOnClose);
    return;
  }
  queueMicrotask(() => {
    child.off("error", tb2aLateChildErrorSafetySink);
  });
}

type ProcessCapture = {
  chunks: Buffer[];
  bytes: number;
};

type ProcessState = {
  reason:
    | "OUTPUT_LIMIT_EXCEEDED"
    | "COMMAND_FAILED"
    | "PROCESS_TIMEOUT"
    | "PROCESS_SIGNALLED"
    | null;
  terminationUnconfirmed: boolean;
  terminationStarted: boolean;
  exitObserved: boolean;
  closeObserved: boolean;
  closeDeadlineStarted: boolean;
  settled: boolean;
  stdout: ProcessCapture;
  stderr: ProcessCapture;
  timers: Set<ReturnType<typeof setTimeout>>;
};

type ProcessControl = Readonly<{
  settle(): void;
  detachPipes(): void;
}>;

function processState(): ProcessState {
  return {
    reason: null,
    terminationUnconfirmed: false,
    terminationStarted: false,
    exitObserved: false,
    closeObserved: false,
    closeDeadlineStarted: false,
    settled: false,
    stdout: { chunks: [], bytes: 0 },
    stderr: { chunks: [], bytes: 0 },
    timers: new Set(),
  };
}

function captureChunk(
  chunk: Buffer,
  capture: ProcessCapture,
  limit: number,
  state: ProcessState,
  child: Tb2aChildProcess,
  timing: Tb2aProcessTiming,
  dependencies: Tb2aProcessDependencies,
  control: ProcessControl,
): void {
  capture.bytes += chunk.byteLength;
  if (capture.bytes <= limit) capture.chunks.push(Buffer.from(chunk));
  if (capture.bytes <= limit || state.reason !== null) return;
  latchReason(state, "OUTPUT_LIMIT_EXCEEDED");
  requestTermination(child, state, timing, dependencies, control);
}

function latchReason(
  state: ProcessState,
  reason: Exclude<ProcessState["reason"], null>,
): void {
  state.reason ??= reason;
}

function requestTermination(
  child: Tb2aChildProcess,
  state: ProcessState,
  timing: Tb2aProcessTiming,
  dependencies: Tb2aProcessDependencies,
  control: ProcessControl,
): void {
  if (state.settled || state.terminationStarted || state.exitObserved) return;
  state.terminationStarted = true;
  const { pid } = child;
  if (pid === undefined) {
    state.terminationUnconfirmed = true;
    beginCloseDeadline(child, state, timing, control);
    return;
  }
  if (!signalGroup(pid, "SIGTERM", state, dependencies)) {
    beginCloseDeadline(child, state, timing, control);
    return;
  }
  const graceTimer = setTimeout(() => {
    if (state.settled || state.exitObserved || state.closeObserved) return;
    signalGroup(pid, "SIGKILL", state, dependencies);
    beginCloseDeadline(child, state, timing, control);
  }, timing.sigtermGraceMs);
  state.timers.add(graceTimer);
}

function signalGroup(
  pid: number,
  signal: NodeJS.Signals,
  state: ProcessState,
  dependencies: Tb2aProcessDependencies,
): boolean {
  try {
    dependencies.signalProcessGroup(pid, signal);
    return true;
  } catch {
    state.terminationUnconfirmed = true;
    return false;
  }
}

function beginCloseDeadline(
  child: Tb2aChildProcess,
  state: ProcessState,
  timing: Tb2aProcessTiming,
  control: ProcessControl,
): void {
  if (state.settled || state.closeDeadlineStarted || state.closeObserved) return;
  state.closeDeadlineStarted = true;
  const closeTimer = setTimeout(() => {
    if (state.settled || state.closeObserved) return;
    state.terminationUnconfirmed = true;
    control.detachPipes();
    child.stdout.destroy();
    child.stderr.destroy();
    control.settle();
  }, timing.closeDeadlineMs);
  state.timers.add(closeTimer);
}

function finishBoundedProcess(state: ProcessState): BoundedProcessResult {
  if (state.terminationUnconfirmed) {
    return Object.freeze({
      ok: false,
      reason: "PROCESS_TERMINATION_UNCONFIRMED",
    });
  }
  if (state.reason !== null) {
    return Object.freeze({ ok: false, reason: state.reason });
  }
  return Object.freeze({
    ok: true,
    stdout: Buffer.concat(state.stdout.chunks),
  });
}

function clearProcessTimers(state: ProcessState): void {
  for (const timer of state.timers) clearTimeout(timer);
  state.timers.clear();
}
