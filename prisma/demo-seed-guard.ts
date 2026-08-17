export const DEMO_SEED_ACKNOWLEDGEMENT_PREFIX =
  "DEMO_ONLY_ERASE_AND_REPLACE_TARGET:";

const DEFAULT_POSTGRESQL_PORT = 5432;
const REQUIRED_DEMO_SEED_SCHEMA = "public";
const SAFE_DEMO_SEED_ERROR_CODES = Object.freeze([
  "DEMO_SEED_PRODUCTION_POSTURE_REJECTED",
  "DEMO_SEED_EXPECTED_DATABASE_REQUIRED",
  "DEMO_SEED_EXPECTED_DATABASE_INVALID",
  "DEMO_SEED_DATABASE_URL_REQUIRED",
  "DEMO_SEED_DATABASE_URL_INVALID",
  "DEMO_SEED_CONFIGURED_DATABASE_MISMATCH",
  "DEMO_SEED_ACKNOWLEDGEMENT_REQUIRED",
  "DEMO_SEED_ACKNOWLEDGEMENT_MISMATCH",
  "DEMO_SEED_REPORTED_DATABASE_INVALID",
  "DEMO_SEED_REPORTED_DATABASE_MISMATCH",
  "DEMO_SEED_REPORTED_USERNAME_MISMATCH",
  "DEMO_SEED_REPORTED_SCHEMA_MISMATCH",
] as const);

type DemoSeedEnvironment = Readonly<Record<string, string | undefined>>;

export type DemoSeedPgConfig = Readonly<{
  user: string;
  password?: string;
  host: string;
  port: number;
  database: string;
}>;

export type DemoSeedPrismaPgOptions = Readonly<{
  schema: typeof REQUIRED_DEMO_SEED_SCHEMA;
}>;

export type AuthorizedDemoSeedTarget = Readonly<{
  acknowledgementIdentity: string;
  pgConfig: DemoSeedPgConfig;
  prismaPgOptions: DemoSeedPrismaPgOptions;
}>;

export type ReportedDemoSeedDatabaseIdentity = Readonly<{
  databaseName: string;
  currentUser: string;
  currentSchema: string;
}>;

export function authorizeDemoSeedEnvironment(
  env: DemoSeedEnvironment,
): AuthorizedDemoSeedTarget {
  if (isProductionPosture(env)) throw new Error("DEMO_SEED_PRODUCTION_POSTURE_REJECTED");

  const expectedDatabase = env.MIRA_DEMO_SEED_EXPECTED_DATABASE;
  if (!expectedDatabase) throw new Error("DEMO_SEED_EXPECTED_DATABASE_REQUIRED");
  if (!isExactDatabaseIdentity(expectedDatabase)) {
    throw new Error("DEMO_SEED_EXPECTED_DATABASE_INVALID");
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DEMO_SEED_DATABASE_URL_REQUIRED");
  const target = authorizedTargetFromDatabaseUrl(databaseUrl);
  if (target.pgConfig.database !== expectedDatabase) {
    throw new Error("DEMO_SEED_CONFIGURED_DATABASE_MISMATCH");
  }

  const acknowledgement = env.MIRA_DEMO_SEED_ACKNOWLEDGEMENT;
  if (!acknowledgement) throw new Error("DEMO_SEED_ACKNOWLEDGEMENT_REQUIRED");
  if (acknowledgement !== `${DEMO_SEED_ACKNOWLEDGEMENT_PREFIX}${target.acknowledgementIdentity}`) {
    throw new Error("DEMO_SEED_ACKNOWLEDGEMENT_MISMATCH");
  }

  return target;
}

export function assertDemoSeedReportedDatabaseIdentity(
  target: AuthorizedDemoSeedTarget,
  reported: ReportedDemoSeedDatabaseIdentity,
): void {
  if (reported.databaseName !== target.pgConfig.database) {
    throw new Error("DEMO_SEED_REPORTED_DATABASE_MISMATCH");
  }
  if (reported.currentUser !== target.pgConfig.user) {
    throw new Error("DEMO_SEED_REPORTED_USERNAME_MISMATCH");
  }
  if (reported.currentSchema !== target.prismaPgOptions.schema) {
    throw new Error("DEMO_SEED_REPORTED_SCHEMA_MISMATCH");
  }
}

export function sanitizedDemoSeedError(error: unknown): Error {
  if (error instanceof Error && SAFE_DEMO_SEED_ERROR_CODES.some((code) => (
    error.message === code
  ))) return new Error(error.message);
  return new Error("DEMO_SEED_OPERATION_FAILED");
}

function isProductionPosture(env: DemoSeedEnvironment): boolean {
  return normalized(env.NODE_ENV) === "production"
    || normalized(env.VERCEL_ENV) === "production"
    || normalized(env.PAYMENT_MODE) === "live";
}

function normalized(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase();
}

function isExactDatabaseIdentity(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(value);
}

type ParsedDemoSeedDatabaseUrl = Readonly<{
  username: string;
  password?: string;
  hostname: string;
  port: number;
  databaseName: string;
  schema: typeof REQUIRED_DEMO_SEED_SCHEMA;
}>;

const DEMO_SEED_DATABASE_URL_PATTERN =
  /^(postgres(?:ql)?):\/\/([^:@/?#]+)(?::([^@/?#]+))?@([^:/?#]+)(?::([^/?#]+))?\/([^/?#]+)(?:\?([^#]*))?$/u;

function authorizedTargetFromDatabaseUrl(raw: string): AuthorizedDemoSeedTarget {
  const parsed = parsedDatabaseUrl(raw);
  const pgConfig = demoSeedPgConfig(parsed);
  const prismaPgOptions = Object.freeze({ schema: parsed.schema });
  return Object.freeze({
    acknowledgementIdentity: `postgresql://${pgConfig.user}@${pgConfig.host}`
      + `:${pgConfig.port}/${pgConfig.database}?schema=${prismaPgOptions.schema}`,
    pgConfig,
    prismaPgOptions,
  });
}

function parsedDatabaseUrl(raw: string): ParsedDemoSeedDatabaseUrl {
  const matched = DEMO_SEED_DATABASE_URL_PATTERN.exec(raw);
  if (!matched) throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
  const username = decodedIdentifier(matched[2] ?? "");
  const password = matched[3] === undefined ? undefined : decodedSecret(matched[3]);
  const hostname = normalizedHostname(matched[4] ?? "");
  const port = normalizedPort(matched[5]);
  const databaseName = decodedIdentifier(matched[6] ?? "");
  const schema = normalizedSchema(matched[7]);
  if (!isExactDatabaseIdentity(username) || !isExactDatabaseIdentity(databaseName)) {
    throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
  }
  return Object.freeze({
    username,
    ...(password === undefined ? {} : { password }),
    hostname,
    port,
    databaseName,
    schema,
  });
}

function demoSeedPgConfig(parsed: ParsedDemoSeedDatabaseUrl): DemoSeedPgConfig {
  const config: {
    user: string;
    password?: string;
    host: string;
    port: number;
    database: string;
  } = {
    user: parsed.username,
    host: parsed.hostname,
    port: parsed.port,
    database: parsed.databaseName,
  };
  if (parsed.password !== undefined) {
    Object.defineProperty(config, "password", {
      value: parsed.password,
      enumerable: false,
    });
  }
  return Object.freeze(config);
}

function decodedIdentifier(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
  }
}

function decodedSecret(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
  }
}

function normalizedHostname(value: string): string {
  const hostname = value.toLowerCase();
  if (isCanonicalIpv4Hostname(hostname)) return hostname;
  if (isApproximateNumericIpv4Hostname(hostname)) {
    throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
  }
  if (isDnsHostname(hostname)) return hostname;
  throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
}

function isCanonicalIpv4Hostname(value: string): boolean {
  const components = value.split(".");
  return components.length === 4 && components.every((component) => (
    /^(?:0|[1-9][0-9]{0,2})$/u.test(component) && Number(component) <= 255
  ));
}

function isApproximateNumericIpv4Hostname(value: string): boolean {
  const components = value.split(".");
  return components.length <= 4 && components.every((component) => (
    /^(?:[0-9]+|0x[0-9a-f]+)$/u.test(component)
  ));
}

function isDnsHostname(value: string): boolean {
  if (!value || value.length > 253 || value.endsWith(".")) return false;
  return value.split(".").every((label) => (
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)
  ));
}

function normalizedPort(value: string | undefined): number {
  if (!value) return DEFAULT_POSTGRESQL_PORT;
  if (!/^[1-9][0-9]{0,4}$/u.test(value)) {
    throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
  }
  const port = Number(value);
  if (port > 65_535) {
    throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
  }
  return port;
}

function normalizedSchema(
  query: string | undefined,
): typeof REQUIRED_DEMO_SEED_SCHEMA {
  if (query === undefined || query === "schema=public") return REQUIRED_DEMO_SEED_SCHEMA;
  throw new Error("DEMO_SEED_DATABASE_URL_INVALID");
}
