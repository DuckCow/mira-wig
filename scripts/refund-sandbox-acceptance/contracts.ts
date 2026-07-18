import { randomBytes } from "node:crypto";

export const H1_COMMANDS = [
  "plan", "inspect", "validate-db", "validate-fixtures", "execute", "status",
  "resume", "resume-post", "seal", "report", "cleanup-db", "purge-raw",
] as const;
export type H1Command = (typeof H1_COMMANDS)[number];

export const H1_SCENARIOS = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;
export type H1Scenario = (typeof H1_SCENARIOS)[number];

const RUN_ID = /^sbx-\d{8}T\d{6}Z-[0-9a-f]{16}$/;
const PROVIDER_COMMANDS: readonly H1Command[] = ["execute", "resume", "resume-post"];
const SCENARIO_COMMANDS: readonly H1Command[] = [
  "execute", "resume", "resume-post", "seal",
];
const RUN_COMMANDS: readonly H1Command[] = H1_COMMANDS.filter((command) => command !== "plan");

export type ParsedH1Command = Readonly<{
  command: H1Command;
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
  const timestamp = value.slice(4, 19);
  const parsed = new Date(
    `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`
      + `T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}Z`,
  );
  if (Number.isNaN(parsed.getTime())) throw contractError("INVALID_RUN_ID", "Run id is invalid.");
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
  const runId = RUN_COMMANDS.includes(rawCommand) ? parseRunId(values.run) : null;
  const scenarioId = SCENARIO_COMMANDS.includes(rawCommand)
    ? parseScenarioId(values.scenario)
    : null;
  if (!RUN_COMMANDS.includes(rawCommand) && values.run !== undefined) throw unexpectedArgument();
  if (!SCENARIO_COMMANDS.includes(rawCommand) && values.scenario !== undefined) {
    throw unexpectedArgument();
  }
  return Object.freeze({ command: rawCommand, runId, scenarioId });
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

function parseFlags(flags: readonly string[]): Readonly<Record<string, string | undefined>> {
  const result: Record<string, string | undefined> = {};
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if ((flag !== "--run" && flag !== "--scenario") || !value || value.startsWith("--")) {
      throw unexpectedArgument();
    }
    const key = flag.slice(2);
    if (result[key] !== undefined) throw unexpectedArgument();
    result[key] = value;
  }
  return Object.freeze(result);
}

function unexpectedArgument(): H1ContractError {
  return contractError("INVALID_ARGUMENTS", "Command arguments are invalid.");
}

function contractError(code: string, message: string): H1ContractError {
  return new H1ContractError(code, message);
}
