import type { SiteVariant } from "@/lib/market/site-variant";
import { withStorefrontHandoff } from "@/lib/market/request-context";

export const CHECKOUT_SESSION_QUERY_PARAM = "checkoutSessionId";

export type CheckoutPageMode =
  | { kind: "CREATION" }
  | { kind: "RESUME"; checkoutSessionId: string }
  | { kind: "INVALID_RESUME" };

export function checkoutPageMode(value: string | string[] | undefined): CheckoutPageMode {
  if (value === undefined) return { kind: "CREATION" };
  if (typeof value !== "string" || value.length < 1 || value.length > 128 || value.trim() !== value) {
    return { kind: "INVALID_RESUME" };
  }
  return { kind: "RESUME", checkoutSessionId: value };
}

export function checkoutSessionResumeHref(checkoutSessionId: string, variant: SiteVariant): string {
  const query = new URLSearchParams({ [CHECKOUT_SESSION_QUERY_PARAM]: checkoutSessionId });
  return withStorefrontHandoff(`/checkout?${query.toString()}`, variant);
}
