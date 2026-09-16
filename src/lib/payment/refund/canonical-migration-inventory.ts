import expected from "../../../../infra/refund-sandbox/p3e-b2/contracts/canonical-migration-inventory-v1.json";
import type { RefundWorkerMigrationInventory } from "./worker-migration-inventory";
export function requireCanonicalMigrationInventory(actual: RefundWorkerMigrationInventory): void {
  if (actual.migrationCount !== expected.entries.length
    || actual.migrationDigest !== expected.migrationDigest
    || JSON.stringify(actual.entries) !== JSON.stringify(expected.entries)) {
    throw new Error("CANONICAL_MIGRATION_INVENTORY_MISMATCH");
  }
}
