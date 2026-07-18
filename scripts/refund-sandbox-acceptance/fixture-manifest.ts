import { readFile, stat } from "node:fs/promises";
import { parseRunId, parseScenarioId, type H1Scenario } from "./contracts";

export const H1_FIXTURE_FORMAT_VERSION = "mira-toss-sbx-fixtures/v1";
const FIXTURE_KEYS = ["scenarioId", "paymentKey", "providerOrderId", "amount", "currency", "reference"] as const;
const ROOT_KEYS = [
  "formatVersion", "runId", "expectedMerchantAccountBinding",
  "expectedCredentialGenerationBinding", "providerTruthNote", "fixtures",
] as const;
const LABEL = /^[A-Za-z0-9._-]{1,64}$/;
const REFERENCE = /^[A-Za-z0-9._:-]{1,128}$/;

export type ProviderFixture = Readonly<{
  scenarioId: H1Scenario;
  paymentKey: string;
  providerOrderId: string;
  amount: number;
  currency: "KRW";
  reference: string;
}>;

export type FixtureManifest = Readonly<{
  formatVersion: typeof H1_FIXTURE_FORMAT_VERSION;
  runId: string;
  expectedMerchantAccountBinding: string;
  expectedCredentialGenerationBinding: string;
  providerTruthNote: typeof H1_PROVIDER_TRUTH_NOTE;
  fixtures: Readonly<Record<H1Scenario, ProviderFixture | null>>;
}>;

export const H1_PROVIDER_TRUTH_NOTE = "The acceptance bootstrap creates only synthetic local preconditions. Provider eligibility and cancellation truth remain owned by committed Toss ports; refund transitions remain owned by committed application operations.";

export function fixtureManifestTemplate(runId: string): FixtureManifest {
  const parsedRunId = parseRunId(runId);
  return Object.freeze({
    formatVersion: H1_FIXTURE_FORMAT_VERSION,
    runId: parsedRunId,
    expectedMerchantAccountBinding: "REPLACE_WITH_NON_SECRET_BINDING_LABEL",
    expectedCredentialGenerationBinding: "REPLACE_WITH_NON_SECRET_GENERATION_LABEL",
    providerTruthNote: H1_PROVIDER_TRUTH_NOTE,
    fixtures: Object.freeze({ S1: null, S2: null, S3: null, S4: null, S5: null, S6: null }),
  });
}

export async function readFixtureManifest(path: string, expectedRunId: string): Promise<FixtureManifest> {
  const metadata = await stat(path);
  if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
    throw new Error("FIXTURE_MANIFEST_MODE_INVALID");
  }
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  return parseFixtureManifest(raw, expectedRunId);
}

export function parseFixtureManifest(value: unknown, expectedRunId: string): FixtureManifest {
  if (!exactRecord(value, ROOT_KEYS)) throw new Error("FIXTURE_MANIFEST_INVALID");
  if (value.formatVersion !== H1_FIXTURE_FORMAT_VERSION) throw new Error("FIXTURE_MANIFEST_INVALID");
  const runId = parseRunId(value.runId);
  if (runId !== parseRunId(expectedRunId)) throw new Error("FIXTURE_RUN_MISMATCH");
  const merchant = binding(value.expectedMerchantAccountBinding);
  const generation = binding(value.expectedCredentialGenerationBinding);
  if (value.providerTruthNote !== H1_PROVIDER_TRUTH_NOTE) throw new Error("FIXTURE_MANIFEST_INVALID");
  if (!exactFixtureMap(value.fixtures)) throw new Error("FIXTURE_MANIFEST_INVALID");
  const parsed = Object.freeze({
    S1: nullableFixture(value.fixtures.S1, "S1"),
    S2: nullableFixture(value.fixtures.S2, "S2"),
    S3: nullableFixture(value.fixtures.S3, "S3"),
    S4: nullableFixture(value.fixtures.S4, "S4"),
    S5: nullableFixture(value.fixtures.S5, "S5"),
    S6: nullableFixture(value.fixtures.S6, "S6"),
  });
  for (const required of ["S1", "S2", "S3", "S4", "S5"] as const) {
    if (!parsed[required]) throw new Error("FIXTURE_REQUIRED");
  }
  assertUnique(Object.values(parsed).filter((item): item is ProviderFixture => item !== null));
  return Object.freeze({
    formatVersion: H1_FIXTURE_FORMAT_VERSION,
    runId,
    expectedMerchantAccountBinding: merchant,
    expectedCredentialGenerationBinding: generation,
    providerTruthNote: H1_PROVIDER_TRUTH_NOTE,
    fixtures: Object.freeze(parsed),
  });
}

function parseFixture(value: unknown, mapKey: string): ProviderFixture {
  if (!exactRecord(value, FIXTURE_KEYS)) throw new Error("FIXTURE_INVALID");
  const scenarioId = parseScenarioId(value.scenarioId);
  if (scenarioId !== mapKey) throw new Error("FIXTURE_SCENARIO_MISMATCH");
  const paymentKey = protectedIdentifier(value.paymentKey);
  const providerOrderId = protectedIdentifier(value.providerOrderId);
  const amount = positiveAmount(value.amount);
  if (value.currency !== "KRW") throw new Error("FIXTURE_CURRENCY_INVALID");
  if (typeof value.reference !== "string" || !REFERENCE.test(value.reference)) {
    throw new Error("FIXTURE_REFERENCE_INVALID");
  }
  return Object.freeze({
    scenarioId, paymentKey, providerOrderId, amount,
    currency: "KRW", reference: value.reference,
  });
}

function exactFixtureMap(value: unknown): value is Record<H1Scenario, unknown> {
  return exactRecord(value, ["S1", "S2", "S3", "S4", "S5", "S6"]);
}

function nullableFixture(value: unknown, scenarioId: H1Scenario): ProviderFixture | null {
  return value === null ? null : parseFixture(value, scenarioId);
}

function positiveAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1
    || value > 2_147_483_647) throw new Error("FIXTURE_AMOUNT_INVALID");
  return value;
}

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every((key) => typeof key === "string" && keys.includes(key));
}

function binding(value: unknown): string {
  if (typeof value !== "string" || !LABEL.test(value)) throw new Error("FIXTURE_BINDING_INVALID");
  return value;
}

function protectedIdentifier(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200 || /\p{Cc}/u.test(value)) {
    throw new Error("FIXTURE_IDENTIFIER_INVALID");
  }
  return value;
}

function assertUnique(fixtures: readonly ProviderFixture[]): void {
  if (new Set(fixtures.map((fixture) => fixture.paymentKey)).size !== fixtures.length) {
    throw new Error("FIXTURE_PAYMENT_DUPLICATE");
  }
  if (new Set(fixtures.map((fixture) => fixture.providerOrderId)).size !== fixtures.length) {
    throw new Error("FIXTURE_ORDER_DUPLICATE");
  }
}
