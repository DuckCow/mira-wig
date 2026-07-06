import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { ReconciliationFinding } from "@/lib/payment/reconciliation";
import {
  buildReconciliationReport,
  formatReconciliationReport,
  parseArgs,
} from "../../../../../scripts/payment-reconcile";

interface ParsedReport {
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

describe("payment reconciliation manual report wrapper", () => {
  it("formats JSON with summary counts and structured findings", () => {
    const findings: ReconciliationFinding[] = [
      {
        kind: "SUCCEEDED_PAYMENT_WITHOUT_ORDER",
        severity: "warning",
        recommendedAction: "AUTO_REENTRY_CANDIDATE",
        source: ["payment"],
        sourceIds: { payment: ["pay_1"] },
        details: { paymentId: "pay_1" },
        confidence: "high",
      },
      {
        kind: "WEBHOOK_VERIFY_REJECTION",
        severity: "warning",
        recommendedAction: "SECURITY_SIGNAL",
        source: ["webhookIngressRejection"],
        sourceIds: { webhookIngressRejection: ["reject_1"] },
        details: { code: "VERIFY.FAILED" },
      },
    ];
    const report = buildReconciliationReport(findings, {
      generatedAt: new Date("2026-08-03T10:00:00.000Z"),
      now: new Date("2026-08-03T09:55:00.000Z"),
    });

    const output = formatReconciliationReport(report, true);
    const parsed = parseReport(output);

    expect(output).toContain("\n  \"generatedAt\"");
    expect(parsed).toMatchObject({
      generatedAt: "2026-08-03T10:00:00.000Z",
      now: "2026-08-03T09:55:00.000Z",
      totalFindings: 2,
      counts: {
        byKind: {
          SUCCEEDED_PAYMENT_WITHOUT_ORDER: 1,
          WEBHOOK_VERIFY_REJECTION: 1,
        },
        bySeverity: { warning: 2 },
        byRecommendedAction: {
          AUTO_REENTRY_CANDIDATE: 1,
          SECURITY_SIGNAL: 1,
        },
      },
    });
    expect(parsed.findings).toEqual(findings);
  });

  it("parses detector options and excludes known repair hooks", () => {
    const parsed = parseArgs([
      "--json",
      "--pretty",
      "--now",
      "2026-08-03T09:55:00.000Z",
      "--stale-received-ms",
      "1000",
      "--verify-spike-threshold",
      "4",
    ]);
    expect(parsed.pretty).toBe(true);
    expect(parsed.options.now?.toISOString()).toBe("2026-08-03T09:55:00.000Z");
    expect(parsed.options.staleReceivedAfterMs).toBe(1000);
    expect(parsed.options.verifySpikeThreshold).toBe(4);

    const source = readFileSync(join(process.cwd(), "scripts/payment-reconcile.ts"), "utf8");
    expect(source).toContain("reconcilePaymentCore");
    for (const forbidden of [
      "completeFromCapture",
      "dispatchPending",
      "createVoidHandler",
      "transitionCheckoutSession",
      "transitionPayment",
      "--fix",
      "--repair",
      "--execute",
      "--reentry",
      "--void",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});

function parseReport(output: string): ParsedReport {
  const value: unknown = JSON.parse(output);
  if (!isParsedReport(value)) throw new Error("Invalid reconciliation report JSON");
  return value;
}

function isParsedReport(value: unknown): value is ParsedReport {
  if (!isRecord(value)) return false;
  return typeof value.generatedAt === "string"
    && typeof value.now === "string"
    && typeof value.totalFindings === "number"
    && isRecord(value.counts)
    && Array.isArray(value.findings);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
