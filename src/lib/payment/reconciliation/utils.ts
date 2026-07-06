import type { Prisma } from "@prisma/client";
import type {
  ReconciliationFinding,
  ReconcilePaymentCoreOptions,
} from "./types";

export const VOID_TOPIC = "pg.void";
export const RAW_MISMATCH_CODE = "VERIFY.RAW_MISMATCH";

// C2-v0 defaults are detector defaults, not final product or retention policy.
const DEFAULTS = {
  staleReceivedAfterMs: 10 * 60_000,
  staleRetryableFailedAfterMs: 10 * 60_000,
  staleSucceededPaymentAfterMs: 10 * 60_000,
  spikeWindowMs: 10 * 60_000,
  verifySpikeThreshold: 10,
  metadataSpikeThreshold: 10,
  rawMismatchSpikeThreshold: 3,
  parseFailureSpikeThreshold: 5,
  completeRetryableSpikeThreshold: 5,
};

export type NormalizedOptions = Required<ReconcilePaymentCoreOptions>;

export interface VoidPayload {
  paymentId: string;
  provider: string;
  providerPaymentKey: string;
}

export function normalizeOptions(options: ReconcilePaymentCoreOptions): NormalizedOptions {
  const now = options.now ?? new Date();
  return {
    ...DEFAULTS,
    ...options,
    now,
  };
}

export function finding(input: ReconciliationFinding): ReconciliationFinding {
  return input;
}

export function parseVoidPayload(payload: Prisma.JsonValue): VoidPayload | null {
  if (!isRecord(payload)) return null;
  const paymentId = stringField(payload, "paymentId");
  const provider = stringField(payload, "provider");
  const providerPaymentKey = stringField(payload, "providerPaymentKey");
  if (!paymentId || !provider || !providerPaymentKey) return null;
  return { paymentId, provider, providerPaymentKey };
}

export function isOlderThan(value: Date, now: Date, thresholdMs: number): boolean {
  return value.getTime() <= now.getTime() - thresholdMs;
}

export function ageMs(value: Date, now: Date): number {
  return Math.max(0, now.getTime() - value.getTime());
}

export function cutoff(now: Date, ms: number): Date {
  return new Date(now.getTime() - ms);
}

export function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Prisma.JsonObject, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
