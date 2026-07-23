import { Client } from "pg";

type AdmissionEnv = Readonly<Record<string, string | undefined>>;

export const REFUND_PROVIDER_CONTACT_ADMISSION_KEY_VERSION =
  "mira-refund-provider-contact-admission/v1";
export const REFUND_PROVIDER_CONTACT_ADMISSION_KEY = Object.freeze([
  1_296_646_721,
  1_380_336_385,
] as const);
export const REFUND_PROVIDER_CONTACT_ADMISSION_APPLICATION_NAME =
  "mira_refund_provider_contact_admission";

const ACQUIRE_SQL =
  "SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired";
const RELEASE_SQL =
  "SELECT pg_advisory_unlock($1::integer, $2::integer) AS released";

export type RefundProviderContactAdmissionResult<Result> =
  | Readonly<{ outcome: "ACQUIRED"; result: Result }>
  | Readonly<{ outcome: "BUSY" }>
  | Readonly<{ outcome: "ADMISSION_UNAVAILABLE" }>
  | Readonly<{ outcome: "ADMISSION_CLEANUP_FAILED"; result: Result }>;

export type RefundProviderContactAdmissionClient = Readonly<{
  connect(): Promise<unknown>;
  query(
    text: string,
    values: readonly [number, number],
  ): Promise<Readonly<{ rows: readonly unknown[] }>>;
  end(): Promise<void>;
}>;

export type RefundProviderContactAdmissionDependencies = Readonly<{
  createClient: (connectionString: string) => RefundProviderContactAdmissionClient;
}>;

export const defaultRefundProviderContactAdmissionDependencies:
RefundProviderContactAdmissionDependencies = Object.freeze({
  createClient: (connectionString) => new Client({
    connectionString,
    application_name: REFUND_PROVIDER_CONTACT_ADMISSION_APPLICATION_NAME,
    connectionTimeoutMillis: 5_000,
  }),
});

export async function runWithRefundProviderContactAdmission<Result>(
  env: AdmissionEnv,
  operation: () => Promise<Result>,
  dependencies: RefundProviderContactAdmissionDependencies =
    defaultRefundProviderContactAdmissionDependencies,
): Promise<RefundProviderContactAdmissionResult<Result>> {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) return Object.freeze({ outcome: "ADMISSION_UNAVAILABLE" });
  let client: RefundProviderContactAdmissionClient;
  try {
    client = dependencies.createClient(connectionString);
  } catch {
    return Object.freeze({ outcome: "ADMISSION_UNAVAILABLE" });
  }
  const acquired = await connectAndAcquire(client);
  if (acquired !== "ACQUIRED") {
    const closed = await closeClient(client);
    return acquired === "BUSY" && closed
      ? Object.freeze({ outcome: "BUSY" })
      : Object.freeze({ outcome: "ADMISSION_UNAVAILABLE" });
  }
  return runAcquiredOperation(client, operation);
}

async function connectAndAcquire(
  client: RefundProviderContactAdmissionClient,
): Promise<"ACQUIRED" | "BUSY" | "ADMISSION_UNAVAILABLE"> {
  try {
    await client.connect();
    const result = await client.query(ACQUIRE_SQL, REFUND_PROVIDER_CONTACT_ADMISSION_KEY);
    const acquired = exactBooleanResult(result, "acquired");
    if (acquired === null) return "ADMISSION_UNAVAILABLE";
    return acquired ? "ACQUIRED" : "BUSY";
  } catch {
    return "ADMISSION_UNAVAILABLE";
  }
}

async function runAcquiredOperation<Result>(
  client: RefundProviderContactAdmissionClient,
  operation: () => Promise<Result>,
): Promise<RefundProviderContactAdmissionResult<Result>> {
  const primary = await operation().then(
    (result) => Object.freeze({ ok: true as const, result }),
    (error: unknown) => Object.freeze({ ok: false as const, error }),
  );
  const released = await releaseLock(client);
  const closed = await closeClient(client);
  if (!primary.ok) throw primary.error;
  return released && closed
    ? Object.freeze({ outcome: "ACQUIRED", result: primary.result })
    : Object.freeze({ outcome: "ADMISSION_CLEANUP_FAILED", result: primary.result });
}

async function releaseLock(client: RefundProviderContactAdmissionClient): Promise<boolean> {
  try {
    const result = await client.query(RELEASE_SQL, REFUND_PROVIDER_CONTACT_ADMISSION_KEY);
    return exactBooleanResult(result, "released") === true;
  } catch {
    return false;
  }
}

async function closeClient(client: RefundProviderContactAdmissionClient): Promise<boolean> {
  try {
    await client.end();
    return true;
  } catch {
    return false;
  }
}

function exactBooleanResult(
  result: Readonly<{ rows: readonly unknown[] }>,
  key: "acquired" | "released",
): boolean | null {
  if (!Array.isArray(result.rows) || result.rows.length !== 1) return null;
  const rows: readonly unknown[] = result.rows;
  const row: unknown = rows[0];
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  if (!hasOnlyKey(row, key)) return null;
  return booleanDataProperty(row, key);
}

function hasOnlyKey(value: object, key: string): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === 1 && keys[0] === key;
}

function booleanDataProperty(value: object, key: string): boolean | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) return null;
  const propertyValue: unknown = descriptor.value;
  return typeof propertyValue === "boolean" ? propertyValue : null;
}
