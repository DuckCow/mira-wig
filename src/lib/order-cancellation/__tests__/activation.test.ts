import { describe, expect, it } from "vitest";
import {
  CUSTOMER_MTO_ORDER_CANCELLATION_ENABLED,
  MTO_PRODUCTION_START_ENABLED,
  OrderCancellationActivationConfigError,
  isCustomerMtoOrderCancellationEnabled,
  isMtoProductionStartEnabled,
} from "../activation";

describe("order cancellation activation", () => {
  it("is fail-closed when missing or blank", () => {
    expect(isCustomerMtoOrderCancellationEnabled({})).toBe(false);
    expect(isMtoProductionStartEnabled({ [MTO_PRODUCTION_START_ENABLED]: "  " })).toBe(false);
  });

  it("accepts only the repository exact ENABLED sentinel", () => {
    expect(isCustomerMtoOrderCancellationEnabled({
      [CUSTOMER_MTO_ORDER_CANCELLATION_ENABLED]: " ENABLED ",
    })).toBe(true);
    expect(isMtoProductionStartEnabled({ [MTO_PRODUCTION_START_ENABLED]: "ENABLED" })).toBe(true);
  });

  it.each(["enabled", "true", "1", "DISABLED"])("rejects malformed value %s", (value) => {
    expect(() => isCustomerMtoOrderCancellationEnabled({
      [CUSTOMER_MTO_ORDER_CANCELLATION_ENABLED]: value,
    })).toThrow(OrderCancellationActivationConfigError);
  });
});
