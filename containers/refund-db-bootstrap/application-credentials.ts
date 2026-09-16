import {
  createHash,
  createHmac,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";
import { Client, escapeIdentifier, escapeLiteral } from "pg";

export const APPLICATION_CREDENTIAL_MODE =
  "materialize-application-credentials" as const;
export const CANARY_CREDENTIAL_RECOVERY_MODE =
  "recover-canary-application-credential" as const;
export const APPLICATION_ROLES = Object.freeze([
  "mira_refund_preflight",
  "mira_refund_canary",
] as const);
export const APPLICATION_SECRETS = Object.freeze({
  mira_refund_preflight:
    "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-preflight-database-url",
  mira_refund_canary:
    "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-canary-database-url",
} as const);

const DATABASE_NAME = "refund_sandbox";
const INSTANCE_CONNECTION_NAME =
  "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18";
const SOCKET_HOST = `/cloudsql/${INSTANCE_CONNECTION_NAME}`;
const SCRAM_ITERATIONS = 4_096;
const PASSWORD_BYTES = 32;
const SCRAM_SALT_BYTES = 16;
const SECRET_MANAGER_API = "https://secretmanager.googleapis.com/v1";
const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const REQUEST_TIMEOUT_MS = 30_000;

export type ApplicationRole = (typeof APPLICATION_ROLES)[number];

export type ApplicationCredential = Readonly<{
  role: ApplicationRole;
  password: string;
  verifier: string;
  databaseUrl: string;
}>;

export type SecretVersionEvidence = Readonly<{
  secretResourceName: string;
  version: "1";
  state: "ENABLED";
  createTime: string;
  checksumAcknowledged: true;
  versionCount: 1;
}>;

export type ApplicationCredentialMaterializationResult = Readonly<{
  code: "APP_CREDENTIAL_MATERIALIZATION_COMPLETE";
  mode: typeof APPLICATION_CREDENTIAL_MODE;
  databasePasswordTransaction: "COMMITTED";
  passwordLogins: readonly Readonly<{
    role: ApplicationRole;
    currentDatabase: typeof DATABASE_NAME;
    verified: true;
  }>[];
  secrets: readonly SecretVersionEvidence[];
  secretPayloadReads: 0;
  applicationRuntimeExecutions: 0;
  providerEffects: 0;
}>;

export type CanaryCredentialRecoveryResult = Readonly<{
  code: "APP_CREDENTIAL_CANARY_RECOVERY_COMPLETE";
  mode: typeof CANARY_CREDENTIAL_RECOVERY_MODE;
  databasePasswordTransaction: "COMMITTED";
  passwordLogin: Readonly<{
    role: "mira_refund_canary";
    currentDatabase: typeof DATABASE_NAME;
    verified: true;
  }>;
  secret: SecretVersionEvidence;
  secretPayloadReads: 0;
  applicationRuntimeExecutions: 0;
  providerEffects: 0;
}>;

export type ApplicationCredentialFailureCode =
  | "SECRET_METADATA_UNAVAILABLE"
  | "SECRET_VERSION_BASELINE_DRIFT"
  | "APPLICATION_PASSWORD_TRANSACTION_FAILED"
  | "APPLICATION_PASSWORD_LOGIN_FAILED"
  | "SECRET_VERSION_ADD_FAILED"
  | "SECRET_VERSION_ADD_AMBIGUOUS_ZERO"
  | "SECRET_VERSION_ADD_AMBIGUOUS_ONE"
  | "SECRET_VERSION_ADD_AMBIGUOUS_DRIFT"
  | "SECRET_VERSION_POSTCONDITION_FAILED";

export class ApplicationCredentialFailure extends Error {
  readonly code: ApplicationCredentialFailureCode;
  readonly secretResourceName?: string;
  readonly versionCount?: number;

  constructor(
    code: ApplicationCredentialFailureCode,
    details: Readonly<{ secretResourceName?: string; versionCount?: number }> = {},
  ) {
    super(code);
    this.name = "ApplicationCredentialFailure";
    this.code = code;
    this.secretResourceName = details.secretResourceName;
    this.versionCount = details.versionCount;
  }
}

type PasswordSqlClient = Readonly<{
  query: (sql: string) => Promise<unknown>;
}>;
type LoginClient = Readonly<{
  connect: () => Promise<unknown>;
  query: (sql: string) => Promise<Readonly<{ rows: readonly Readonly<{
    currentUser: string;
    currentDatabase: string;
    one: number;
  }>[] }>>;
  end: () => Promise<void>;
}>;

export type SecretMetadataClient = Readonly<{
  listVersions: (secretResourceName: string) => Promise<Readonly<{
    count: number;
    versions: readonly Readonly<{
      name: string;
      state: string;
      createTime: string;
      checksumAcknowledged: boolean;
    }>[];
  }>>;
  addVersionOnce: (
    secretResourceName: string,
    payload: Buffer,
    checksum: number,
  ) => Promise<Readonly<{
    name: string;
    state: string;
    createTime: string;
    checksumAcknowledged: boolean;
  }>>;
}>;

export type ApplicationCredentialDependencies = Readonly<{
  secretManager: SecretMetadataClient;
  generateCredential: (role: ApplicationRole) => ApplicationCredential;
  generateAndSetPasswords: (
    generateCredential: (role: ApplicationRole) => ApplicationCredential,
  ) => Promise<readonly ApplicationCredential[]>;
  verifyPasswordLogins: (
    credentials: readonly ApplicationCredential[],
  ) => Promise<void>;
}>;

export type CanaryCredentialRecoveryDependencies = Readonly<{
  secretManager: SecretMetadataClient;
  generateCredential: (role: ApplicationRole) => ApplicationCredential;
  generateAndSetCanaryPassword: (
    generateCredential: (role: ApplicationRole) => ApplicationCredential,
  ) => Promise<ApplicationCredential>;
  verifyCanaryPasswordLogin: (credential: ApplicationCredential) => Promise<void>;
}>;

export async function materializeApplicationCredentials(
  dependencies: ApplicationCredentialDependencies,
): Promise<ApplicationCredentialMaterializationResult> {
  for (const role of APPLICATION_ROLES) {
    const secret = APPLICATION_SECRETS[role];
    const metadata = await requireVersionMetadata(dependencies.secretManager, secret);
    if (metadata.count !== 0) {
      throw new ApplicationCredentialFailure("SECRET_VERSION_BASELINE_DRIFT", {
        secretResourceName: secret,
        versionCount: metadata.count,
      });
    }
  }

  const credentials = await dependencies.generateAndSetPasswords(
    dependencies.generateCredential,
  );
  requireExactCredentialSet(credentials);
  await dependencies.verifyPasswordLogins(credentials);

  const secrets: SecretVersionEvidence[] = [];
  for (const credential of credentials) {
    secrets.push(await publishCredential(
      dependencies.secretManager,
      APPLICATION_SECRETS[credential.role],
      credential.databaseUrl,
    ));
  }

  return Object.freeze({
    code: "APP_CREDENTIAL_MATERIALIZATION_COMPLETE",
    mode: APPLICATION_CREDENTIAL_MODE,
    databasePasswordTransaction: "COMMITTED",
    passwordLogins: Object.freeze(APPLICATION_ROLES.map((role) => Object.freeze({
      role,
      currentDatabase: DATABASE_NAME,
      verified: true,
    }))),
    secrets: Object.freeze(secrets),
    secretPayloadReads: 0,
    applicationRuntimeExecutions: 0,
    providerEffects: 0,
  });
}

export async function recoverCanaryApplicationCredential(
  dependencies: CanaryCredentialRecoveryDependencies,
): Promise<CanaryCredentialRecoveryResult> {
  const preflightSecret = APPLICATION_SECRETS.mira_refund_preflight;
  const preflight = await requireVersionMetadata(
    dependencies.secretManager,
    preflightSecret,
  );
  const preflightVersion = preflight.versions[0];
  if (preflight.count !== 1 || preflight.versions.length !== 1
    || !preflightVersion
    || !exactEnabledVersion(preflightVersion, preflightSecret, "1")) {
    throw new ApplicationCredentialFailure("SECRET_VERSION_BASELINE_DRIFT", {
      secretResourceName: preflightSecret,
      versionCount: preflight.count,
    });
  }

  const canarySecret = APPLICATION_SECRETS.mira_refund_canary;
  const canary = await requireVersionMetadata(dependencies.secretManager, canarySecret);
  if (canary.count !== 0 || canary.versions.length !== 0) {
    throw new ApplicationCredentialFailure("SECRET_VERSION_BASELINE_DRIFT", {
      secretResourceName: canarySecret,
      versionCount: canary.count,
    });
  }

  const credential = await dependencies.generateAndSetCanaryPassword(
    dependencies.generateCredential,
  );
  requireExactCanaryCredential(credential);
  await dependencies.verifyCanaryPasswordLogin(credential);
  const secret = await publishCredential(
    dependencies.secretManager,
    canarySecret,
    credential.databaseUrl,
  );

  return Object.freeze({
    code: "APP_CREDENTIAL_CANARY_RECOVERY_COMPLETE",
    mode: CANARY_CREDENTIAL_RECOVERY_MODE,
    databasePasswordTransaction: "COMMITTED",
    passwordLogin: Object.freeze({
      role: "mira_refund_canary",
      currentDatabase: DATABASE_NAME,
      verified: true,
    }),
    secret,
    secretPayloadReads: 0,
    applicationRuntimeExecutions: 0,
    providerEffects: 0,
  });
}

export function generateApplicationCredential(role: ApplicationRole): ApplicationCredential {
  requireExactRole(role);
  const password = randomBytes(PASSWORD_BYTES).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43}$/u.test(password)) {
    throw new ApplicationCredentialFailure("APPLICATION_PASSWORD_TRANSACTION_FAILED");
  }
  const verifier = postgresScramSha256Verifier(
    password,
    randomBytes(SCRAM_SALT_BYTES),
  );
  return Object.freeze({
    role,
    password,
    verifier,
    databaseUrl: canonicalApplicationDatabaseUrl(role, password),
  });
}

export function postgresScramSha256Verifier(
  asciiPassword: string,
  salt: Uint8Array,
  iterations = SCRAM_ITERATIONS,
): string {
  if (!/^[\x21-\x7e]+$/u.test(asciiPassword)
    || salt.byteLength !== SCRAM_SALT_BYTES
    || iterations !== SCRAM_ITERATIONS) {
    throw new Error("SCRAM_INPUT_INVALID");
  }
  const saltedPassword = pbkdf2Sync(
    Buffer.from(asciiPassword, "utf8"),
    salt,
    iterations,
    32,
    "sha256",
  );
  const clientKey = createHmac("sha256", saltedPassword)
    .update("Client Key", "utf8")
    .digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword)
    .update("Server Key", "utf8")
    .digest();
  try {
    return `SCRAM-SHA-256$${iterations}:${Buffer.from(salt).toString("base64")}`
      + `$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
  } finally {
    saltedPassword.fill(0);
    clientKey.fill(0);
    storedKey.fill(0);
    serverKey.fill(0);
  }
}

export function canonicalApplicationDatabaseUrl(
  role: ApplicationRole,
  password: string,
): string {
  requireExactRole(role);
  if (!/^[A-Za-z0-9_-]+$/u.test(password)) throw new Error("PASSWORD_SHAPE_INVALID");
  const url = new URL(`postgresql://localhost:5432/${DATABASE_NAME}`);
  url.username = role;
  url.password = password;
  return `${url.toString()}?host=${SOCKET_HOST}`;
}

export function applicationPasswordSql(credential: ApplicationCredential): string {
  requireExactRole(credential.role);
  if (!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$/u
    .test(credential.verifier)) {
    throw new Error("SCRAM_VERIFIER_INVALID");
  }
  return `ALTER ROLE ${escapeIdentifier(credential.role)} PASSWORD ${escapeLiteral(credential.verifier)}`;
}

export async function setApplicationPasswords<Database extends PasswordSqlClient>(
  database: Database,
  credentials: readonly ApplicationCredential[],
  verifyExactPrivileges: (database: Database) => Promise<void>,
): Promise<void> {
  requireExactCredentialSet(credentials);
  await verifyExactPrivileges(database);
  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    for (const credential of credentials) {
      await database.query(applicationPasswordSql(credential));
    }
    await verifyExactPrivileges(database);
    await database.query("COMMIT");
    transactionOpen = false;
  } catch {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => undefined);
    throw new ApplicationCredentialFailure("APPLICATION_PASSWORD_TRANSACTION_FAILED");
  }
}

export async function setCanaryApplicationPassword<Database extends PasswordSqlClient>(
  database: Database,
  credential: ApplicationCredential,
  verifyExactPrivileges: (database: Database) => Promise<void>,
): Promise<void> {
  requireExactCanaryCredential(credential);
  await verifyExactPrivileges(database);
  let transactionOpen = false;
  try {
    await database.query("BEGIN");
    transactionOpen = true;
    await database.query(applicationPasswordSql(credential));
    await verifyExactPrivileges(database);
    await database.query("COMMIT");
    transactionOpen = false;
  } catch {
    if (transactionOpen) await database.query("ROLLBACK").catch(() => undefined);
    throw new ApplicationCredentialFailure("APPLICATION_PASSWORD_TRANSACTION_FAILED");
  }
}

export async function verifyApplicationPasswordLogins(
  credentials: readonly ApplicationCredential[],
  createClient: (databaseUrl: string) => LoginClient =
    (databaseUrl) => new Client({ connectionString: databaseUrl }),
): Promise<void> {
  requireExactCredentialSet(credentials);
  for (const credential of credentials) {
    await verifyOneApplicationPasswordLogin(credential, createClient);
  }
}

export async function verifyCanaryApplicationPasswordLogin(
  credential: ApplicationCredential,
  createClient: (databaseUrl: string) => LoginClient =
    (databaseUrl) => new Client({ connectionString: databaseUrl }),
): Promise<void> {
  requireExactCanaryCredential(credential);
  await verifyOneApplicationPasswordLogin(credential, createClient);
}

async function verifyOneApplicationPasswordLogin(
  credential: ApplicationCredential,
  createClient: (databaseUrl: string) => LoginClient,
): Promise<void> {
  const database = createClient(credential.databaseUrl);
  try {
    await database.connect();
    const result = await database.query(`
      SELECT current_user AS "currentUser",
        current_database() AS "currentDatabase",
        1::int AS one
    `);
    requirePasswordLoginResult(result.rows, credential.role);
  } catch {
    throw new ApplicationCredentialFailure("APPLICATION_PASSWORD_LOGIN_FAILED");
  } finally {
    await database.end().catch(() => undefined);
  }
}

function requirePasswordLoginResult(
  rows: readonly Readonly<{
    currentUser: string;
    currentDatabase: string;
    one: number;
  }>[],
  role: ApplicationRole,
): void {
  if (rows.length !== 1
    || rows[0]?.currentUser !== role
    || rows[0]?.currentDatabase !== DATABASE_NAME
    || rows[0]?.one !== 1) {
    throw new Error("PASSWORD_LOGIN_POSTCONDITION_FAILED");
  }
}

export function crc32c(value: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of value) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0x82f6_3b78 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

export class RestSecretMetadataClient implements SecretMetadataClient {
  private accessToken: Promise<string> | null = null;

  async listVersions(secretResourceName: string) {
    requireExactSecret(secretResourceName);
    let response: Response;
    try {
      response = await fetch(
        `${SECRET_MANAGER_API}/${secretResourceName}/versions?pageSize=2`,
        await this.request("GET"),
      );
    } catch {
      throw new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE", {
        secretResourceName,
      });
    }
    if (!response.ok) {
      throw new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE", {
        secretResourceName,
      });
    }
    const value = await safeJson(response);
    return parseVersionList(value, secretResourceName);
  }

  async addVersionOnce(secretResourceName: string, payload: Buffer, checksum: number) {
    requireExactSecret(secretResourceName);
    const request = await this.request("POST", JSON.stringify({
      payload: {
        data: payload.toString("base64"),
        data_crc32c: String(checksum),
      },
    }));
    let response: Response;
    try {
      response = await fetch(
        `${SECRET_MANAGER_API}/${secretResourceName}:addVersion`,
        request,
      );
    } catch {
      throw new SecretAddAmbiguous();
    }
    if (!response.ok) {
      if (response.status >= 400 && response.status < 500
        && response.status !== 408 && response.status !== 429) {
        throw new ApplicationCredentialFailure("SECRET_VERSION_ADD_FAILED", {
          secretResourceName,
        });
      }
      throw new SecretAddAmbiguous();
    }
    try {
      return parseVersion(await safeJson(response), secretResourceName);
    } catch {
      throw new SecretAddAmbiguous();
    }
  }

  private async request(method: "GET" | "POST", body?: string): Promise<RequestInit> {
    const token = await (this.accessToken ??= fetchMetadataAccessToken());
    return Object.freeze({
      method,
      body,
      headers: Object.freeze({
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      }),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}

class SecretAddAmbiguous extends Error {}

async function publishCredential(
  client: SecretMetadataClient,
  secretResourceName: string,
  databaseUrl: string,
): Promise<SecretVersionEvidence> {
  const before = await requireVersionMetadata(client, secretResourceName);
  if (before.count !== 0) {
    throw new ApplicationCredentialFailure("SECRET_VERSION_BASELINE_DRIFT", {
      secretResourceName,
      versionCount: before.count,
    });
  }
  const payload = Buffer.from(databaseUrl, "utf8");
  const added = await addCredentialVersion(client, secretResourceName, payload);
  requireExactEnabledVersion(added, secretResourceName, "1");
  const after = await requireVersionMetadata(client, secretResourceName);
  const version = after.versions[0];
  if (after.count !== 1 || after.versions.length !== 1
    || !version || !exactEnabledVersion(version, secretResourceName, "1")) {
    throw new ApplicationCredentialFailure("SECRET_VERSION_POSTCONDITION_FAILED", {
      secretResourceName,
      versionCount: after.count,
    });
  }
  return Object.freeze({
    secretResourceName,
    version: "1",
    state: "ENABLED",
    createTime: version.createTime,
    checksumAcknowledged: true,
    versionCount: 1,
  });
}

async function addCredentialVersion(
  client: SecretMetadataClient,
  secretResourceName: string,
  payload: Buffer,
): Promise<Awaited<ReturnType<SecretMetadataClient["addVersionOnce"]>>> {
  try {
    return await client.addVersionOnce(secretResourceName, payload, crc32c(payload));
  } catch (error) {
    if (!(error instanceof SecretAddAmbiguous)) throw error;
    const observed = await requireVersionMetadata(client, secretResourceName);
    throw ambiguousVersionFailure(secretResourceName, observed.count);
  } finally {
    payload.fill(0);
  }
}

function ambiguousVersionFailure(
  secretResourceName: string,
  versionCount: number,
): ApplicationCredentialFailure {
  let code: ApplicationCredentialFailureCode;
  if (versionCount === 0) code = "SECRET_VERSION_ADD_AMBIGUOUS_ZERO";
  else if (versionCount === 1) code = "SECRET_VERSION_ADD_AMBIGUOUS_ONE";
  else code = "SECRET_VERSION_ADD_AMBIGUOUS_DRIFT";
  return new ApplicationCredentialFailure(code, { secretResourceName, versionCount });
}

function requireExactEnabledVersion(
  version: Readonly<{
    name: string;
    state: string;
    createTime: string;
    checksumAcknowledged: boolean;
  }>,
  secretResourceName: string,
  expectedVersion: string,
): void {
  if (!exactEnabledVersion(version, secretResourceName, expectedVersion)) {
    throw new ApplicationCredentialFailure("SECRET_VERSION_POSTCONDITION_FAILED", {
      secretResourceName,
    });
  }
}

function exactEnabledVersion(
  version: Readonly<{
    name: string;
    state: string;
    createTime: string;
    checksumAcknowledged: boolean;
  }>,
  secretResourceName: string,
  expectedVersion: string,
): boolean {
  return exactSecretVersionName(version.name, secretResourceName, expectedVersion)
    && version.state === "ENABLED"
    && version.checksumAcknowledged
    && validTimestamp(version.createTime);
}

async function requireVersionMetadata(
  client: SecretMetadataClient,
  secretResourceName: string,
) {
  try {
    return await client.listVersions(secretResourceName);
  } catch (error) {
    if (error instanceof ApplicationCredentialFailure) throw error;
    throw new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE", {
      secretResourceName,
    });
  }
}

async function fetchMetadataAccessToken(): Promise<string> {
  let response: Response;
  try {
    response = await fetch(METADATA_TOKEN_URL, {
      method: "GET",
      headers: { "Metadata-Flavor": "Google" },
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE");
  }
  if (!response.ok || response.headers.get("metadata-flavor") !== "Google") {
    throw new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE");
  }
  const value = await safeJson(response);
  if (!isRecord(value)
    || typeof value.access_token !== "string"
    || value.access_token.length < 32
    || value.token_type !== "Bearer") {
    throw new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE");
  }
  return value.access_token;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE");
  }
}

function parseVersionList(value: unknown, secretResourceName: string) {
  if (!isRecord(value)) throw metadataInvalid(secretResourceName);
  const rawVersions = value.versions ?? [];
  const totalSize = decimalInteger(value.totalSize ?? 0);
  if (!Array.isArray(rawVersions) || totalSize === null
    || rawVersions.length > 2 || totalSize < rawVersions.length
    || (value.nextPageToken !== undefined
      && typeof value.nextPageToken !== "string")) {
    throw metadataInvalid(secretResourceName);
  }
  const versions = rawVersions.map((entry) => parseVersion(entry, secretResourceName));
  return Object.freeze({ count: totalSize, versions: Object.freeze(versions) });
}

function parseVersion(value: unknown, secretResourceName: string) {
  if (!isRecord(value)
    || typeof value.name !== "string"
    || !exactSecretVersionName(value.name, secretResourceName)
    || typeof value.state !== "string"
    || typeof value.createTime !== "string"
    || typeof value.clientSpecifiedPayloadChecksum !== "boolean") {
    throw metadataInvalid(secretResourceName);
  }
  return Object.freeze({
    name: value.name,
    state: value.state,
    createTime: value.createTime,
    checksumAcknowledged: value.clientSpecifiedPayloadChecksum,
  });
}

function exactSecretVersionName(
  value: string,
  secretResourceName: string,
  expectedVersion?: string,
): boolean {
  const match = /^projects\/([^/]+)\/secrets\/([^/]+)\/versions\/([1-9][0-9]*)$/u.exec(value);
  if (!match) return false;
  const expectedSecret = /^projects\/mira-refund-sandbox-0001\/secrets\/([^/]+)$/u
    .exec(secretResourceName)?.[1];
  return (match[1] === "mira-refund-sandbox-0001" || match[1] === "925882331349")
    && match[2] === expectedSecret
    && (expectedVersion === undefined || match[3] === expectedVersion);
}

function metadataInvalid(secretResourceName: string): ApplicationCredentialFailure {
  return new ApplicationCredentialFailure("SECRET_METADATA_UNAVAILABLE", {
    secretResourceName,
  });
}

function decimalInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validTimestamp(value: string): boolean {
  return value.length > 0 && Number.isFinite(Date.parse(value));
}

function requireExactRole(value: string): asserts value is ApplicationRole {
  if (!APPLICATION_ROLES.some((role) => role === value)) throw new Error("ROLE_INVALID");
}

function requireExactSecret(value: string): void {
  if (!Object.values(APPLICATION_SECRETS).some((secret) => secret === value)) {
    throw new Error("SECRET_INVALID");
  }
}

function requireExactCredentialSet(
  credentials: readonly ApplicationCredential[],
): void {
  if (credentials.length !== APPLICATION_ROLES.length
    || credentials.some((credential, index) => credential.role !== APPLICATION_ROLES[index])) {
    throw new Error("CREDENTIAL_SET_INVALID");
  }
}

function requireExactCanaryCredential(credential: ApplicationCredential): void {
  if (credential.role !== "mira_refund_canary") throw new Error("CREDENTIAL_SET_INVALID");
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}
