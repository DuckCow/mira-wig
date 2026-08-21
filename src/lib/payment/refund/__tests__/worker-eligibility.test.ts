import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  contactedRefundExecutionWorkerWhere,
  readyRefundExecutionWorkerWhere,
  uncontactedRefundExecutionWorkerWhere,
} from "../worker-eligibility";

const CAPTURED_AT = new Date("2026-08-21T00:00:00.000Z");

describe("refund execution worker provider eligibility", () => {
  it.each([
    readyRefundExecutionWorkerWhere,
    uncontactedRefundExecutionWorkerWhere,
    contactedRefundExecutionWorkerWhere,
  ])("keeps the default selector exactly Toss-only", (where) => {
    expect(where(CAPTURED_AT)).toMatchObject({
      refundAttempt: { provider: PaymentProvider.TOSS, mode: "SANDBOX" },
    });
  });

  it("admits only Toss and Eximbay READY work when the dormant provider is explicitly selected", () => {
    expect(readyRefundExecutionWorkerWhere(
      CAPTURED_AT,
      [PaymentProvider.TOSS, PaymentProvider.EXIMBAY],
    )).toMatchObject({
      refundAttempt: {
        provider: { in: [PaymentProvider.TOSS, PaymentProvider.EXIMBAY] },
        mode: "SANDBOX",
      },
    });
  });

  it("admits only an expired exact Eximbay authorized R1 as the extra UNCONTACTED branch", () => {
    expect(uncontactedRefundExecutionWorkerWhere(
      CAPTURED_AT,
      [PaymentProvider.TOSS, PaymentProvider.EXIMBAY],
    )).toMatchObject({
      OR: [
        {
          status: "LEASED",
          dispatchAttempt: 0,
          leaseUntil: { lte: CAPTURED_AT },
          refundAttempt: {
            provider: { in: [PaymentProvider.TOSS, PaymentProvider.EXIMBAY] },
          },
        },
        {
          status: "LEASED",
          dispatchAttempt: 1,
          leaseUntil: { lte: CAPTURED_AT },
          refundAttempt: {
            status: "PROCESSING",
            provider: "EXIMBAY",
            mode: "SANDBOX",
            providerRefundId: null,
            order: { status: "REFUND_PENDING" },
          },
          dispatchAttempts: {
            some: {
              ordinal: 1,
              provider: "EXIMBAY",
              mode: "SANDBOX",
              state: "AUTHORIZED",
              contactMarkedAt: null,
            },
            every: {
              ordinal: 1,
              provider: "EXIMBAY",
              mode: "SANDBOX",
              state: "AUTHORIZED",
              contactMarkedAt: null,
            },
          },
          evidence: { none: {} },
        },
      ],
    });
  });

  it("adds Eximbay WAITING_EVIDENCE recovery without changing the Toss contacted branch", () => {
    const where = contactedRefundExecutionWorkerWhere(
      CAPTURED_AT,
      [PaymentProvider.TOSS, PaymentProvider.EXIMBAY],
    );
    expect(where).toMatchObject({
      OR: [
        {
          status: "LEASED",
          refundAttempt: { provider: "TOSS" },
        },
        {
          refundAttempt: { provider: "EXIMBAY" },
          OR: [
            { status: "LEASED" },
            {
              status: "WAITING_EVIDENCE",
              availableAt: { lte: CAPTURED_AT },
              leaseOwner: null,
              leaseUntil: null,
              leaseTokenHash: null,
            },
          ],
        },
      ],
    });
  });

  it("keeps manual review Toss-only", async () => {
    const { manualReviewRefundExecutionWorkerWhere } = await import("../worker-eligibility");
    expect(manualReviewRefundExecutionWorkerWhere()).toMatchObject({
      refundAttempt: { provider: PaymentProvider.TOSS },
    });
  });
});
