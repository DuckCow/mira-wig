import { PaymentProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  createTossPaymentCorrelationPort,
  type TossPaymentCorrelationClient,
} from "../correlation";

const PAYMENT_ID = "pay_123";
const CHECKOUT_SESSION_ID = "checkout_123";

describe("Toss payment correlation resolver", () => {
  it("returns checkoutSessionId for an existing Toss payment", async () => {
    const fake = fakeCorrelationClient(paymentRecord(PaymentProvider.TOSS));
    const correlation = createTossPaymentCorrelationPort(fake.client);

    await expect(correlation(PAYMENT_ID)).resolves.toEqual({ checkoutSessionId: CHECKOUT_SESSION_ID });
    expect(fake.findUnique).toHaveBeenCalledWith({
      where: { id: PAYMENT_ID },
      select: { provider: true, checkoutSessionId: true },
    });
  });

  it("returns null for a definitive miss", async () => {
    const fake = fakeCorrelationClient(null);
    const correlation = createTossPaymentCorrelationPort(fake.client);

    await expect(correlation(PAYMENT_ID)).resolves.toBeNull();
  });

  it("returns null for a non-Toss payment", async () => {
    const fake = fakeCorrelationClient(paymentRecord(PaymentProvider.PAYPAL));
    const correlation = createTossPaymentCorrelationPort(fake.client);

    await expect(correlation(PAYMENT_ID)).resolves.toBeNull();
  });

  it("returns null for empty local payment ids without querying", async () => {
    const fake = fakeCorrelationClient(paymentRecord(PaymentProvider.TOSS));
    const correlation = createTossPaymentCorrelationPort(fake.client);

    await expect(correlation("  ")).resolves.toBeNull();
    expect(fake.findUnique).not.toHaveBeenCalled();
  });

  it("throws database and infrastructure errors instead of converting them to null", async () => {
    const dbError = new Error("database unavailable");
    const fake = fakeCorrelationClient(dbError);
    const correlation = createTossPaymentCorrelationPort(fake.client);

    await expect(correlation(PAYMENT_ID)).rejects.toBe(dbError);
  });

  it("does not call write delegates", async () => {
    const fake = fakeCorrelationClient(paymentRecord(PaymentProvider.TOSS));
    const correlation = createTossPaymentCorrelationPort(fake.client);

    await correlation(PAYMENT_ID);

    expect(fake.writes.create).not.toHaveBeenCalled();
    expect(fake.writes.update).not.toHaveBeenCalled();
    expect(fake.writes.updateMany).not.toHaveBeenCalled();
    expect(fake.writes.delete).not.toHaveBeenCalled();
    expect(fake.writes.deleteMany).not.toHaveBeenCalled();
  });
});

type CorrelationFindUnique = TossPaymentCorrelationClient["payment"]["findUnique"];
type CorrelationPayment = Awaited<ReturnType<CorrelationFindUnique>>;

function fakeCorrelationClient(result: CorrelationPayment | Error): {
  client: TossPaymentCorrelationClient;
  findUnique: ReturnType<typeof vi.fn<CorrelationFindUnique>>;
  writes: Record<"create" | "update" | "updateMany" | "delete" | "deleteMany", ReturnType<typeof vi.fn>>;
} {
  const findUnique = vi.fn<CorrelationFindUnique>((_args) => {
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  });
  const writes = {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
  return {
    client: { payment: { findUnique } },
    findUnique,
    writes,
  };
}

function paymentRecord(provider: PaymentProvider): CorrelationPayment {
  return {
    provider,
    checkoutSessionId: CHECKOUT_SESSION_ID,
  };
}
