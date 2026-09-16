import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSingleShotEximbayCanaryTransport } from "../run-eximbay-refund-canary-once";
import { EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS } from "../eximbay-refund-canary-producer-contract";

import { requireEximbayCanarySaleFreshness } from "../eximbay-refund-canary-target-producer";

const url = "https://synthetic.example.test";

describe("canary transport effect ceilings", () => {
  it("allows pre-refund retrieve then one refund, and rejects all subsequent contacts", async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response("{}")));
    const transport = createSingleShotEximbayCanaryTransport(fetch);
    await expect(transport.cancellation(url)).rejects.toThrow("EXIMBAY_CANARY_CANCEL_LIMIT");
    await transport.retrieve(url);
    await transport.cancellation(url);
    await expect(transport.retrieve(url)).rejects.toThrow("EXIMBAY_CANARY_RETRIEVE_LIMIT");
    await expect(transport.cancellation(url)).rejects.toThrow("EXIMBAY_CANARY_CANCEL_LIMIT");
    await expect(transport.lookup(url)).rejects.toThrow("EXIMBAY_CANARY_RECOVERY_FORBIDDEN");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(transport.counts).toEqual({
      preflightRetrieveCount: 1, cancellationCount: 1, reconciliationLookupCount: 0,
    });
  });

  it.each(["retrieve", "cancellation"] as const)("counts %s rejection before any retry can start", async (port) => {
    const fetch = vi.fn((): Promise<Response> => Promise.reject(new Error("SYNTHETIC_TRANSPORT_FAILURE")));
    const transport = createSingleShotEximbayCanaryTransport(fetch);
    if (port === "cancellation") {
      fetch.mockImplementationOnce(() => Promise.resolve(new Response("{}")));
      await transport.retrieve(url);
    }
    await expect(transport[port](url)).rejects.toThrow("SYNTHETIC_TRANSPORT_FAILURE");
    await expect(transport[port](url)).rejects.toThrow(/EXIMBAY_CANARY_.*_LIMIT/u);
    await expect(transport.lookup(url)).rejects.toThrow("EXIMBAY_CANARY_RECOVERY_FORBIDDEN");
    expect(fetch).toHaveBeenCalledTimes(port === "retrieve" ? 1 : 2);
  });

  it.each(["retrieve", "cancellation"] as const)("admits one of concurrent %s calls even while response is pending", async (port) => {
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetch = vi.fn(() => pending);
    const transport = createSingleShotEximbayCanaryTransport(fetch);
    if (port === "cancellation") {
      fetch.mockImplementationOnce(() => Promise.resolve(new Response("{}")));
      await transport.retrieve(url);
    }
    const first = transport[port](url);
    await expect(transport[port](url)).rejects.toThrow(/EXIMBAY_CANARY_.*_LIMIT/u);
    release(new Response("{}"));
    await first;
    expect(fetch).toHaveBeenCalledTimes(port === "retrieve" ? 1 : 2);
  });

  it("never gives recovery a provider transport", async () => {
    const fetch = vi.fn();
    const transport = createSingleShotEximbayCanaryTransport(fetch);
    await expect(transport.lookup(url)).rejects.toThrow("EXIMBAY_CANARY_RECOVERY_FORBIDDEN");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("single-shot authority wiring", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), "src/lib/payment/refund", path), "utf8");

  it("selects READY only and has no retry or recovery iteration", () => {
    const selector = read("eximbay-refund-canary-exact-selector.ts");
    const runner = read("run-eximbay-refund-canary-once.ts");
    expect(selector).toContain("readyRefundExecutionWorkerWhere(capturedAt, providers)");
    expect(selector).not.toMatch(/contactedRefundExecutionWorkerWhere|uncontactedRefundExecutionWorkerWhere/u);
    expect(runner).not.toMatch(/\bwhile\s*\(|dependencies\.sleep/u);
    expect(runner).toContain('candidate.candidateClass !== "READY"');
    expect(runner).toContain('return possible(contactCode(counts), counts);');
    expect(runner).toContain('SEPARATE_RECONCILIATION_AUTHORITY_REQUIRED');
  });

  it("preserves the installed 30-minute eligibility predicate at every producer phase", () => {
    const producer = read("eximbay-refund-canary-target-producer.ts");
    expect(EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS).toBe(30 * 60 * 1000);
    expect(producer).toContain("requireEximbayCanarySaleFreshness(aggregate, capturedAt)");
    expect(producer).toContain("age < 0 || age > EXIMBAY_CANARY_FRESH_SALE_MAX_AGE_MS");
    expect(producer).toContain('throw new EximbayCanaryProducerError("SALE_NOT_FRESH")');
    expect(producer).not.toContain("cmtk0whl1000201s6er9ulp83");
    expect(producer).not.toContain("cmtk159gq000401s67uo8rcda");
  });
});


describe("unchanged SALE freshness window", () => {
  const capturedAt = new Date("2026-09-02T12:30:00Z");
  it.each([0, 1, 29 * 60_000, 30 * 60_000])("admits age %i milliseconds subject to other target gates", (age) => {
    expect(() => requireEximbayCanarySaleFreshness({
      financialSucceededAt: new Date(capturedAt.getTime() - age),
      session: { completedAt: capturedAt }, order: { paidAt: capturedAt },
    }, capturedAt)).not.toThrow();
  });
  it.each([-1, 30 * 60_000 + 1, 41 * 60_000])("rejects age %i milliseconds", (age) => {
    expect(() => requireEximbayCanarySaleFreshness({
      financialSucceededAt: new Date(capturedAt.getTime() - age),
      session: { completedAt: capturedAt }, order: { paidAt: capturedAt },
    }, capturedAt)).toThrow("SALE_NOT_FRESH");
  });
});
