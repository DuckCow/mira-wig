import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { createPrismaPg } from "../src/lib/database/prisma-pg";
import { pathToFileURL } from "url";
import {
  reconcilePaymentCore,
  type ReconciliationFinding,
  type ReconcilePaymentCoreOptions,
} from "../src/lib/payment/reconciliation";

type NumericOptionKey = Exclude<keyof ReconcilePaymentCoreOptions, "now">;

interface ParsedArgs {
  options: ReconcilePaymentCoreOptions;
  pretty: boolean;
}

interface ReportClock {
  generatedAt: Date;
  now: Date;
}

interface ReconciliationReport {
  generatedAt: string;
  now: string;
  totalFindings: number;
  counts: {
    byKind: Record<string, number>;
    bySeverity: Record<string, number>;
    byRecommendedAction: Record<string, number>;
  };
  findings: ReconciliationFinding[];
}

const NUMBER_FLAGS = [
  { flag: "--stale-received-ms", key: "staleReceivedAfterMs" },
  { flag: "--stale-retryable-failed-ms", key: "staleRetryableFailedAfterMs" },
  { flag: "--stale-succeeded-payment-ms", key: "staleSucceededPaymentAfterMs" },
  { flag: "--stale-provider-confirm-ms", key: "staleProviderConfirmAfterMs" },
  { flag: "--spike-window-ms", key: "spikeWindowMs" },
  { flag: "--verify-spike-threshold", key: "verifySpikeThreshold" },
  { flag: "--metadata-spike-threshold", key: "metadataSpikeThreshold" },
  { flag: "--raw-mismatch-spike-threshold", key: "rawMismatchSpikeThreshold" },
  { flag: "--parse-failure-spike-threshold", key: "parseFailureSpikeThreshold" },
  { flag: "--complete-retryable-spike-threshold", key: "completeRetryableSpikeThreshold" },
] as const satisfies ReadonlyArray<{ flag: string; key: NumericOptionKey }>;

export function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = { options: {}, pretty: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (arg === "--pretty") {
      parsed.pretty = true;
      continue;
    }
    if (arg === "--now") {
      parsed.options.now = parseDateValue(arg, args[index + 1]);
      index += 1;
      continue;
    }
    const numberFlag = NUMBER_FLAGS.find((item) => item.flag === arg);
    if (!numberFlag) throw new Error(`Unknown option: ${arg}`);
    parsed.options[numberFlag.key] = parseIntegerValue(arg, args[index + 1]);
    index += 1;
  }
  return parsed;
}

export function buildReconciliationReport(
  findings: ReconciliationFinding[],
  clock: ReportClock,
): ReconciliationReport {
  return {
    generatedAt: clock.generatedAt.toISOString(),
    now: clock.now.toISOString(),
    totalFindings: findings.length,
    counts: {
      byKind: countBy(findings, (finding) => finding.kind),
      bySeverity: countBy(findings, (finding) => finding.severity),
      byRecommendedAction: countBy(findings, (finding) => finding.recommendedAction),
    },
    findings,
  };
}

export function formatReconciliationReport(report: ReconciliationReport, pretty: boolean): string {
  return JSON.stringify(report, null, pretty ? 2 : undefined);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const generatedAt = new Date();
  const now = parsed.options.now ?? generatedAt;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required.");

  const adapter = createPrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });
  try {
    const findings = await reconcilePaymentCore(db, { ...parsed.options, now });
    const report = buildReconciliationReport(findings, { generatedAt, now });
    process.stdout.write(`${formatReconciliationReport(report, parsed.pretty)}\n`);
  } finally {
    await db.$disconnect();
  }
}

function countBy(
  findings: ReconciliationFinding[],
  pick: (finding: ReconciliationFinding) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const finding of findings) {
    const key = pick(finding);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function parseDateValue(flag: string, value: string | undefined): Date {
  if (!value) throw new Error(`${flag} requires an ISO datetime value.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${flag} must be a valid ISO datetime.`);
  return date;
}

function parseIntegerValue(flag: string, value: string | undefined): number {
  if (!value) throw new Error(`${flag} requires a numeric value.`);
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${flag} must be a non-negative integer.`);
  return parsed;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return Boolean(entry && pathToFileURL(entry).href === import.meta.url);
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
