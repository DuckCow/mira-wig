import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "prisma/migrations/20260828190000_order_cancel_c0/migration.sql",
);

describe("order cancellation migration 45", () => {
  it("has the reviewed exact identity and contains no backfill or promotion/status rewrite", () => {
    const bytes = readFileSync(MIGRATION);
    const sql = bytes.toString("utf8");
    expect(createHash("sha256").update(bytes).digest("hex"))
      .toBe("86ae323f41cac3d192290e1892e6079cb785be732a6cf3c69368a9c13e82a2e9");
    expect(sql).not.toMatch(/^\s*(?:UPDATE|INSERT)\b/gmu);
    expect(sql).not.toMatch(/PromotionGrant|OrderStatus/u);
    expect(sql).toContain('CREATE TABLE "OrderCancellation"');
    expect(sql).toContain('"OrderCancellation_initialRefundAttemptId_orderId_fkey"');
    expect(sql).toContain('"ManufacturingRequest_productionStartAudit_coherent"');
    expect(sql).toContain("NOT VALID");
  });
});
