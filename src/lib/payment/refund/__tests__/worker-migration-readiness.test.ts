import { describe, expect, it } from "vitest";
import {
  compareRefundWorkerMigrations,
  type RefundWorkerDatabaseMigration,
  type RefundWorkerMigrationLedger,
  type RefundWorkerRepositoryMigration,
} from "../worker-migration-readiness";

const REPOSITORY = Object.freeze([
  migration("001_first", "a"),
  migration("002_second", "b"),
]);

describe("refund worker migration readiness comparison", () => {
  it("accepts one exact completed database row for every committed migration", () => {
    expect(compareRefundWorkerMigrations(REPOSITORY, ledger(REPOSITORY.map(applied))))
      .toEqual({ ok: true, status: "READY" });
  });

  it.each([
    ["missing ledger", missingLedger(), "MISSING_LEDGER"],
    ["pending migration", ledger([applied(REPOSITORY[0])]), "PENDING_MIGRATION"],
    ["unknown database migration", ledger([
      ...REPOSITORY.map(applied),
      applied(migration("003_unknown", "c")),
    ]), "UNKNOWN_DATABASE_MIGRATION"],
    ["checksum mismatch", ledger([
      { ...applied(REPOSITORY[0]), checksum: "f".repeat(64) },
      applied(REPOSITORY[1]),
    ]), "CHECKSUM_MISMATCH"],
    ["unfinished migration", ledger([
      { ...applied(REPOSITORY[0]), finished_at: null },
      applied(REPOSITORY[1]),
    ]), "UNFINISHED_MIGRATION"],
    ["rolled-back migration", ledger([
      { ...applied(REPOSITORY[0]), rolled_back_at: new Date("2026-07-20T00:01:00.000Z") },
      applied(REPOSITORY[1]),
    ]), "ROLLED_BACK_MIGRATION"],
    ["zero applied steps", ledger([
      { ...applied(REPOSITORY[0]), applied_steps_count: 0 },
      applied(REPOSITORY[1]),
    ]), "INCOMPLETE_APPLIED_STEPS"],
    ["duplicate database name", ledger([
      applied(REPOSITORY[0]),
      applied(REPOSITORY[0]),
      applied(REPOSITORY[1]),
    ]), "DUPLICATE_DATABASE_MIGRATION"],
  ] as const)("rejects %s", (_name, database, reason) => {
    expect(compareRefundWorkerMigrations(REPOSITORY, database))
      .toEqual({ ok: false, reason });
  });

  it("rejects duplicate repository names independently of filesystem ordering", () => {
    const duplicate = Object.freeze([REPOSITORY[0], REPOSITORY[0], REPOSITORY[1]]);
    expect(compareRefundWorkerMigrations(duplicate, ledger(REPOSITORY.map(applied))))
      .toEqual({ ok: false, reason: "DUPLICATE_REPOSITORY_MIGRATION" });
  });
});

function migration(name: string, character: string): RefundWorkerRepositoryMigration {
  return Object.freeze({ name, checksum: character.repeat(64) });
}

function applied(value: RefundWorkerRepositoryMigration): RefundWorkerDatabaseMigration {
  return Object.freeze({
    migration_name: value.name,
    checksum: value.checksum,
    finished_at: new Date("2026-07-20T00:00:00.000Z"),
    rolled_back_at: null,
    applied_steps_count: 1,
  });
}

function ledger(records: readonly RefundWorkerDatabaseMigration[]): RefundWorkerMigrationLedger {
  return Object.freeze({ exists: true, records: Object.freeze(records) });
}

function missingLedger(): RefundWorkerMigrationLedger {
  return Object.freeze({ exists: false, records: Object.freeze([] as const) });
}
