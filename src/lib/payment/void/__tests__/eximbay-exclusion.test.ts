import { PaymentProvider } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createVoidHandler, VOID_TOPIC } from "../handler";

const executorState = vi.hoisted(() => ({ resolutions: 0, contacts: 0 }));

vi.mock("../executor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../executor")>()),
  createMockVoidExecutor: () => {
    executorState.resolutions += 1;
    return {
      void: () => {
        executorState.contacts += 1;
        return Promise.resolve({ ok: true });
      },
    };
  },
}));

describe("EX1 void exclusion", () => {
  beforeEach(() => {
    executorState.resolutions = 0;
    executorState.contacts = 0;
  });

  it("rejects Eximbay before payment lookup or executor resolution/contact", () => {
    const paymentLookup = vi.spyOn(db.payment, "findUnique");
    try {
      const handler = createVoidHandler(db);

      expect(() => handler({
        paymentId: "payment_eximbay_disabled",
        provider: PaymentProvider.EXIMBAY,
        providerPaymentKey: "provider_payment_eximbay_disabled",
        reason: "EX1 disabled-provider proof",
      }, {
        id: "outbox_eximbay_disabled",
        topic: VOID_TOPIC,
        dedupKey: "void:EXIMBAY:provider_payment_eximbay_disabled",
        attempt: 0,
        now: new Date("2026-08-03T00:00:00.000Z"),
      })).toThrow("pg.void payload provider EXIMBAY is disabled");

      expect(paymentLookup).not.toHaveBeenCalled();
      expect(executorState).toEqual({ resolutions: 0, contacts: 0 });
    } finally {
      paymentLookup.mockRestore();
    }
  });
});
