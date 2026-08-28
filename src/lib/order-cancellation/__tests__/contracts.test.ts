import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  normalizeCustomerCancellationInput,
  normalizeProductionStartInput,
  normalizeReplacementInput,
} from "../contracts";

describe("order cancellation command contracts", () => {
  it("accepts exact canonical UUID-keyed shapes", () => {
    expect(normalizeCustomerCancellationInput({
      orderId: "order_1",
      requestKey: randomUUID(),
      requestedByUserId: "user_1",
    })).not.toBeNull();
    expect(normalizeProductionStartInput({
      orderId: "order_1",
      orderItemId: "item_1",
      requestKey: randomUUID(),
      startedByUserId: "admin_1",
    })).not.toBeNull();
  });

  it.each([
    { orderId: " order_1", requestKey: randomUUID(), requestedByUserId: "user_1" },
    { orderId: "order_1", requestKey: "not-a-uuid", requestedByUserId: "user_1" },
    { orderId: "order_1", requestKey: randomUUID(), requestedByUserId: "user_1", extra: true },
  ])("rejects noncanonical or non-exact cancellation input", (input) => {
    expect(normalizeCustomerCancellationInput(input)).toBeNull();
  });

  it("does not admit an arbitrary replacement amount", () => {
    expect(normalizeReplacementInput({
      orderId: "order_1",
      requestKey: randomUUID(),
      requestedByAdminUserId: "admin_1",
      amount: 1,
    })).toBeNull();
  });
});
