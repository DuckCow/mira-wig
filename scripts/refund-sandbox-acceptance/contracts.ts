import { randomBytes } from "node:crypto";

export const H1_COMMANDS = [
  "plan", "populate-fixtures", "inspect", "validate-db", "validate-fixtures", "execute", "status",
  "resume", "resume-post", "seal", "report", "cleanup-db", "purge-raw",
] as const;
export type H1Command = (typeof H1_COMMANDS)[number];

export const H1_SCENARIOS = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;
export type H1Scenario = (typeof H1_SCENARIOS)[number];

const RUN_ID = /^sbx-\d{8}T\d{6}Z-[0-9a-f]{16}$/;
const PROVIDER_COMMANDS: readonly H1Command[] = ["execute", "resume", "resume-post"];
const SCENARIO_COMMANDS: readonly H1Command[] = [
  "populate-fixtures", "execute", "resume", "resume-post", "seal",
];
const RUN_COMMANDS: readonly H1Command[] = H1_COMMANDS.filter((command) => command !== "plan");

export type ParsedH1Command =
  | Readonly<{
    command: "populate-fixtures";
    runId: string;
    sourceRunId: string;
    witnessRunId: string;
    scenarioId: "S3";
  }>
  | Readonly<{
    command: Exclude<H1Command, "populate-fixtures">;
    runId: string | null;
    scenarioId: H1Scenario | null;
  }>;

export class H1ContractError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "H1ContractError";
  }
}

export function generateRunId(now = new Date(), random = randomBytes): string {
  if (Number.isNaN(now.getTime())) throw contractError("INVALID_CLOCK", "Run clock is invalid.");
  const iso = now.toISOString();
  const timestamp = `${iso.slice(0, 19).replace(/[-:]/g, "")}Z`;
  return `sbx-${timestamp}-${random(8).toString("hex")}`;
}

export function parseRunId(value: unknown): string {
  if (typeof value !== "string" || !RUN_ID.test(value)) {
    throw contractError("INVALID_RUN_ID", "Run id is invalid.");
  }
  const timestamp = value.slice(4, 20);
  const canonical = `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`
    + `T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.000Z`;
  const parsed = new Date(canonical);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== canonical) {
    throw contractError("INVALID_RUN_ID", "Run id is invalid.");
  }
  return value;
}

export function parseScenarioId(value: unknown): H1Scenario {
  if (value === "S1" || value === "S2" || value === "S3"
    || value === "S4" || value === "S5" || value === "S6") return value;
  throw contractError("INVALID_SCENARIO", "Scenario id is invalid.");
}

export function parseH1Command(argv: readonly string[]): ParsedH1Command {
  const [rawCommand, ...flags] = argv;
  if (!isH1Command(rawCommand)) {
    throw contractError("INVALID_COMMAND", "Command is invalid.");
  }
  const values = parseFlags(flags);
  if (rawCommand === "populate-fixtures") return parsePopulationCommand(values);
  return parseRegularCommand(rawCommand, values);
}

function parseRegularCommand(
  command: Exclude<H1Command, "populate-fixtures">,
  values: Readonly<Record<string, string | undefined>>,
): Exclude<ParsedH1Command, Readonly<{ command: "populate-fixtures" }>> {
  const runId = RUN_COMMANDS.includes(command) ? parseRunId(values.run) : null;
  const scenarioId = SCENARIO_COMMANDS.includes(command)
    ? parseScenarioId(values.scenario)
    : null;
  if (!RUN_COMMANDS.includes(command) && values.run !== undefined) throw unexpectedArgument();
  if (!SCENARIO_COMMANDS.includes(command) && values.scenario !== undefined) {
    throw unexpectedArgument();
  }
  if (values.sourceRun !== undefined || values.witnessRun !== undefined) throw unexpectedArgument();
  return Object.freeze({ command, runId, scenarioId });
}

function parsePopulationCommand(
  values: Readonly<Record<string, string | undefined>>,
): Extract<ParsedH1Command, Readonly<{ command: "populate-fixtures" }>> {
  let runId: string;
  let sourceRunId: string;
  let witnessRunId: string;
  try {
    runId = parseRunId(values.run);
  } catch {
    throw populationContractError("FIXTURE_POPULATION_TARGET_INVALID");
  }
  try {
    sourceRunId = parseRunId(values.sourceRun);
  } catch {
    throw populationContractError("FIXTURE_POPULATION_SOURCE_INVALID");
  }
  try {
    witnessRunId = parseRunId(values.witnessRun);
  } catch {
    throw populationContractError("FIXTURE_POPULATION_WITNESS_INVALID");
  }
  if (values.scenario !== "S3") {
    throw populationContractError("FIXTURE_POPULATION_SCENARIO_UNSUPPORTED");
  }
  return Object.freeze({
    command: "populate-fixtures", runId, sourceRunId, witnessRunId, scenarioId: "S3",
  });
}

function isH1Command(value: string | undefined): value is H1Command {
  return value !== undefined && H1_COMMANDS.some((command) => command === value);
}

export function commandCanContactProvider(command: H1Command): boolean {
  return PROVIDER_COMMANDS.includes(command);
}

export function requireRunAcknowledgement(
  env: Readonly<Record<string, string | undefined>>,
  runId: string,
): void {
  if (env.MIRA_TOSS_SANDBOX_ACCEPTANCE_CONFIRM !== runId) {
    throw contractError("CONFIRMATION_REQUIRED", "Run confirmation is required.");
  }
}

export function requireCleanupAcknowledgement(
  env: Readonly<Record<string, string | undefined>>,
  runId: string,
): void {
  if (env.MIRA_TOSS_SANDBOX_ACCEPTANCE_CLEANUP_CONFIRM !== runId) {
    throw contractError("CLEANUP_CONFIRMATION_REQUIRED", "Cleanup confirmation is required.");
  }
}

export function requirePurgeAcknowledgement(
  env: Readonly<Record<string, string | undefined>>,
  runId: string,
): void {
  if (env.MIRA_TOSS_SANDBOX_ACCEPTANCE_PURGE_CONFIRM !== runId) {
    throw contractError("PURGE_CONFIRMATION_REQUIRED", "Raw purge confirmation is required.");
  }
}

export function requireFixturePopulationAcknowledgement(
  env: Readonly<Record<string, string | undefined>>,
  runId: string,
): void {
  if (env.MIRA_TOSS_SANDBOX_ACCEPTANCE_POPULATE_CONFIRM !== runId) {
    throw populationContractError("FIXTURE_POPULATION_CONFIRMATION_REQUIRED");
  }
}

function parseFlags(flags: readonly string[]): Readonly<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    const key = parsedFlagKey(flag, value);
    if (result[key] !== undefined) throw unexpectedArgument();
    result[key] = value;
  }
  return Object.freeze(result);
}

function parsedFlagKey(flag: string | undefined, value: string | undefined): string {
  if (!value || value.startsWith("--")) throw unexpectedArgument();
  if (flag === "--run" || flag === "--scenario") return flag.slice(2);
  if (flag === "--source-run") return "sourceRun";
  if (flag === "--witness-run") return "witnessRun";
  throw unexpectedArgument();
}

function populationContractError(code: string): H1ContractError {
  return contractError(code, code);
}

function unexpectedArgument(): H1ContractError {
  return contractError("INVALID_ARGUMENTS", "Command arguments are invalid.");
}

function contractError(code: string, message: string): H1ContractError {
  return new H1ContractError(code, message);
}
