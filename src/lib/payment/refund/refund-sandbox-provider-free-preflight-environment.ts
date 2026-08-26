import { parse as parsePgConnectionString } from "pg-connection-string";
import { exactRefundRuntimeRecord } from "./refund-runtime-exact";
import { REFUND_EXECUTION_ACTIVATION_KEYS } from "./execution-activation";

export const REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE =
  "P3E_PROVIDER_FREE_PREFLIGHT";
export const REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY =
  "MIRA_REFUND_P3E_PREFLIGHT_MODE";

const FORBIDDEN_EXACT_KEYS = Object.freeze([
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CREDENTIALS",
  "GOOGLE_OAUTH_ACCESS_TOKEN",
  "CLOUDSDK_AUTH_ACCESS_TOKEN",
  "CLOUDSDK_CORE_PROJECT",
  "REFUND_CANARY_TARGET",
  "REFUND_CANARY_APPROVAL",
  "REFUND_CANARY_SECRET_GENERATION",
  "TOSS_BASE_URL",
  "PAYPAL_BASE_URL",
] as const);
const FORBIDDEN_PREFIXES = Object.freeze([
  "TOSS_",
  "NEXT_PUBLIC_TOSS_",
  "PAYPAL_",
  "NEXT_PUBLIC_PAYPAL_",
  "MIRA_TOSS_SANDBOX_ACCEPTANCE_",
  "EXIMBAY_",
  "NEXT_PUBLIC_EXIMBAY_",
  "MIRA_REFUND_EXIMBAY_CANARY_",
  "PG",
] as const);
const CLOUD_SQL_SOCKET = /^\/cloudsql\/[a-z][a-z0-9-]{4,28}[a-z0-9]:asia-northeast3:[a-z][a-z0-9-]{0,61}[a-z0-9]$/u;
const FORBIDDEN_DATABASE_IDENTITY = /(?:^|[_-])(?:prod(?:uction)?|dev(?:elopment)?|acceptance|test)(?:$|[_-])/iu;
const CLOUD_SQL_DATABASE_ROLE = /^[a-z][a-z0-9_]{0,62}$/u;
const EXACT_PG_CONFIGURATION_KEYS = Object.freeze([
  "database", "host", "password", "port", "user",
] as const);

type PreflightEnv = Readonly<Record<string, string | undefined>>;

export type RefundSandboxProviderFreePreflightEnvironment = Readonly<{
  DATABASE_URL: string;
  activationEnvironment: PreflightEnv;
}>;

export type CanonicalRefundCloudSqlDatabaseUrl = Readonly<{
  socketHost: string;
  instanceConnectionName: string;
}>;

export function safeRefundSandboxProviderFreePreflightEnvironment(
  env: unknown,
): RefundSandboxProviderFreePreflightEnvironment | null {
  const inspected = exactRefundRuntimeRecord(env, undefined, true);
  if (!inspected || !isStringEnvironment(inspected)) return null;
  if (inspected[REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]
    !== REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE) return null;
  if (hasForbiddenValue(inspected)) return null;
  const connectionString = inspected.DATABASE_URL;
  if (typeof connectionString !== "string"
    || parseCanonicalRefundCloudSqlDatabaseUrl(connectionString) === null) {
    return null;
  }
  return Object.freeze({
    DATABASE_URL: connectionString,
    activationEnvironment: Object.freeze({ ...inspected }),
  });
}

function isStringEnvironment(
  value: Readonly<Record<string, unknown>>,
): value is Readonly<Record<string, string | undefined>> {
  return Object.values(value).every(
    (entry) => entry === undefined || typeof entry === "string",
  );
}

function hasForbiddenValue(env: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(env).some(([key, value]) => {
    if (typeof value !== "string" || value.trim().length === 0) return false;
    return REFUND_EXECUTION_ACTIVATION_KEYS.some((activationKey) => activationKey === key)
      || FORBIDDEN_EXACT_KEYS.some((forbidden) => forbidden === key)
      || FORBIDDEN_PREFIXES.some((prefix) => key.startsWith(prefix))
      || /(?:PROVIDER.*BASE_URL|CANARY.*(?:TARGET|APPROVAL|SECRET)|ACCEPTANCE)/iu.test(key);
  });
}

export function parseCanonicalRefundCloudSqlDatabaseUrl(
  value: unknown,
): CanonicalRefundCloudSqlDatabaseUrl | null {
  if (typeof value !== "string") return null;
  try {
    const rawSocket = exactRawCloudSqlSocket(value);
    if (rawSocket === null) return null;
    const url = new URL(value);
    const database = decodeURIComponent(url.pathname).slice(1);
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const socket = exactCloudSqlSocketParameter(url);
    if (socket === null || socket !== rawSocket) return null;
    const parsed = parsePgConnectionString(value);
    if (!canonicalCloudSqlUrl(url, database, user, password, socket)
      || !matchingPgConfiguration(parsed, database, user, password, socket)) return null;
    return Object.freeze({
      socketHost: socket,
      instanceConnectionName: socket.slice("/cloudsql/".length),
    });
  } catch {
    return null;
  }
}

function exactRawCloudSqlSocket(value: string): string | null {
  const queryDelimiter = value.indexOf("?");
  if (queryDelimiter < 0 || queryDelimiter !== value.lastIndexOf("?")) return null;
  if (value.includes("#")) return null;
  const rawQuery = value.slice(queryDelimiter + 1);
  if (!rawQuery.startsWith("host=")) return null;
  const rawSocket = rawQuery.slice("host=".length);
  return CLOUD_SQL_SOCKET.test(rawSocket) ? rawSocket : null;
}

function canonicalCloudSqlUrl(
  url: URL,
  database: string,
  user: string,
  password: string,
  socket: string,
): boolean {
  return validCanonicalAuthority(url)
    && validCanonicalIdentity(database, user, password)
    && CLOUD_SQL_SOCKET.test(socket);
}

function validCanonicalAuthority(url: URL): boolean {
  return validPostgresqlProtocol(url.protocol)
    && url.hostname === "localhost"
    && url.port === "5432"
    && url.hash.length === 0;
}

function validCanonicalIdentity(database: string, user: string, password: string): boolean {
  return validCloudDatabaseName(database)
    && CLOUD_SQL_DATABASE_ROLE.test(user)
    && validPassword(password);
}

function matchingPgConfiguration(
  parsed: Readonly<Record<string, unknown>>,
  database: string,
  user: string,
  password: string,
  socket: string,
): boolean {
  return exactPgConfiguration(parsed)
    && parsed.host === socket
    && parsed.database === database
    && parsed.user === user
    && parsed.password === password
    && parsed.port === "5432";
}

function exactCloudSqlSocketParameter(url: URL): string | null {
  const seen = new Set<string>();
  let socket: string | null = null;
  for (const [key, value] of url.searchParams.entries()) {
    if (seen.has(key)) return null;
    seen.add(key);
    if (key !== "host") return null;
    socket = value;
  }
  return seen.size === 1 ? socket : null;
}

function exactPgConfiguration(value: Readonly<Record<string, unknown>>): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === EXACT_PG_CONFIGURATION_KEYS.length
    && keys.every((key, index) => key === EXACT_PG_CONFIGURATION_KEYS[index]);
}

function validPassword(value: string): boolean {
  if (value.length === 0 || value.length > 1_024) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return false;
  }
  return true;
}

function validPostgresqlProtocol(protocol: string): boolean {
  return protocol === "postgresql:" || protocol === "postgres:";
}

function validCloudDatabaseName(database: string): boolean {
  if (database.length === 0 || database.length > 63) return false;
  if (!/^[a-z][a-z0-9_-]*$/u.test(database)) return false;
  if (FORBIDDEN_DATABASE_IDENTITY.test(database)) return false;
  return !["wig_platform", "wig_platform_acceptance", "wig_platform_test"].includes(database);
}
