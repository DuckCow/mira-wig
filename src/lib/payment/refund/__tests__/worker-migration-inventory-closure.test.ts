import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assembleRefundWorkerBuildContext,
} from "../../../../../scripts/build-refund-worker-bundles.mjs";
import {
  verifyRefundWorkerMigrationInventoryClosure,
} from "../../../../../scripts/verify-refund-worker-image.mjs";
import {
  loadRefundWorkerMigrationInventory,
  refundWorkerMigrationSelfCheckProof,
} from "../worker-migration-inventory";

describe("refund worker migration inventory closure", () => {
  it("uses one ordered path-and-hash authority for repository, builder, self-check, and verifier", async () => {
    const repository = await loadRefundWorkerMigrationInventory();
    const context = await assembleRefundWorkerBuildContext();
    try {
      const packaged = packagedMigrationEntries(context.manifestEntries);
      const authoritative = repository.entries.map(({ path, sha256 }) => ({ path, sha256 }));
      const selfCheck = refundWorkerMigrationSelfCheckProof(repository);

      expect(repository.migrationCount).toBe(42);
      expect(repository.entries.at(-1)?.name).toBe("20260909090000_refund_execution_authorization");
      const historical = createHash("sha256");
      for (const entry of repository.entries.slice(0, -1)) {
        historical.update(entry.name).update("\0").update(await readFile(entry.path)).update("\0");
      }
      expect(historical.digest("hex")).toBe(
        "4af152869389ea6ceab2108100b3b2effe772e64784f29e9d62ceb98e0be173c",
      );
      expect(context.migrationInventory.entries).toEqual(repository.entries);
      expect(packaged).toEqual(authoritative);
      expect(selfCheck).toEqual({
        migrationCount: repository.migrationCount,
        migrationDigest: repository.migrationDigest,
      });
      expect(() => verifyRefundWorkerMigrationInventoryClosure(
        context.manifestEntries,
        selfCheck,
        context.migrationInventory,
      )).not.toThrow();
    } finally {
      await context.cleanup();
    }
  });

  it("fails closed for missing, unexpected, reordered, or changed packaged migrations", async () => {
    const inventory = await loadRefundWorkerMigrationInventory();
    const packaged = inventory.entries.map(({ path, sha256 }) => ({ path, sha256 }));
    const selfCheck = refundWorkerMigrationSelfCheckProof(inventory);
    const first = packaged[0];
    const second = packaged[1];
    if (!first || !second) throw new Error("EXPECTED_MULTIPLE_MIGRATIONS");

    expectInventoryFailure(packaged.slice(1), selfCheck, inventory, "PACKAGED_MIGRATION_INVENTORY");
    expectInventoryFailure([
      ...packaged,
      { path: "prisma/migrations/99999999999999_unexpected/migration.sql", sha256: "f".repeat(64) },
    ], selfCheck, inventory, "PACKAGED_MIGRATION_INVENTORY");
    expectInventoryFailure(
      [second, first, ...packaged.slice(2)],
      selfCheck,
      inventory,
      "PACKAGED_MIGRATION_INVENTORY",
    );
    expectInventoryFailure(
      [{ ...first, sha256: "0".repeat(64) }, ...packaged.slice(1)],
      selfCheck,
      inventory,
      "PACKAGED_MIGRATION_INVENTORY",
    );
  });

  it("rejects stale count and digest self-reports, including the removed 29 expectation", async () => {
    const inventory = await loadRefundWorkerMigrationInventory();
    const packaged = inventory.entries.map(({ path, sha256 }) => ({ path, sha256 }));

    expectInventoryFailure(
      packaged,
      { migrationCount: 29, migrationDigest: inventory.migrationDigest },
      inventory,
      "SELF_CHECK_MIGRATION_COUNT",
    );
    expectInventoryFailure(
      packaged,
      { migrationCount: inventory.migrationCount, migrationDigest: "0".repeat(64) },
      inventory,
      "SELF_CHECK_MIGRATION_DIGEST",
    );
  });
});

function packagedMigrationEntries(
  entries: readonly Readonly<{ path: string; sha256: string }>[],
): readonly Readonly<{ path: string; sha256: string }>[] {
  return entries
    .filter((entry) => /^prisma\/migrations\/[^/]+\/migration\.sql$/u.test(entry.path))
    .map(({ path, sha256 }) => ({ path, sha256 }));
}

function expectInventoryFailure(
  packaged: readonly Readonly<{ path: string; sha256: string }>[],
  selfCheck: Readonly<{ migrationCount: number; migrationDigest: string }>,
  inventory: Awaited<ReturnType<typeof loadRefundWorkerMigrationInventory>>,
  code: string,
): void {
  expect(() => verifyRefundWorkerMigrationInventoryClosure(
    packaged,
    selfCheck,
    inventory,
  )).toThrow(`IMAGE_VERIFICATION_FAILED:${code}`);
}
