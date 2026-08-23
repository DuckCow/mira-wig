import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PaymentProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { PROVIDER_REGISTRY, ROUTING_RULES } from "../providers/routing";

const ROOT = process.cwd();
const PRODUCTION_FILES = [
  "src/lib/payment/return-status-contract.ts",
  "src/lib/payment/return-status.ts",
  "src/app/api/payments/status/[checkoutSessionId]/route.ts",
  "src/app/(shop)/checkout/return/[checkoutSessionId]/payment-return-polling.ts",
  "src/app/(shop)/checkout/return/[checkoutSessionId]/PaymentReturnStatus.tsx",
  "src/app/(shop)/checkout/return/[checkoutSessionId]/page.tsx",
];

describe("provider-neutral return flow isolation", () => {
  it("keeps bounded Eximbay routing outside the provider-neutral return flow", () => {
    expect(PROVIDER_REGISTRY.EXIMBAY).toMatchObject({
      enabled: true,
      allowedModes: ["SANDBOX"],
      supportedMethods: ["CARD"],
      supportedCurrencies: ["USD"],
      liveEnabled: [],
    });
    expect(ROUTING_RULES.filter((rule) => rule.candidates.includes(PaymentProvider.EXIMBAY)))
      .toEqual([expect.objectContaining({ market: "US", method: "CARD", currency: "USD" })]);
  });

  it("adds no provider SDK, factory, callback, credential, or provider-contact surface", () => {
    const source = PRODUCTION_FILES.map((path) => readFileSync(join(ROOT, path), "utf8")).join("\n");

    expect(source).not.toMatch(/(?:eximbay|request_pay|fgkey|script src|callback payload)/iu);
    expect(source).not.toMatch(/(?:providers\/factory|providers\/resolve|providers\/credentials|process\.env)/u);
    expect(source).not.toMatch(/https?:\/\//u);
  });
});
