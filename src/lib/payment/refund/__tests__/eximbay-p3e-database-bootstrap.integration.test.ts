import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  bootstrapEximbayP3eDatabaseRoles,
  defaultEximbayP3eDatabaseBootstrapDependencies,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS,
  EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  main,
  type EximbayP3eBootstrapArtifact,
} from "../../../../../scripts/eximbay-p3e-database-bootstrap";

let databaseUrl: string;

const input = Object.freeze({
  admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  targetDatabaseName: "wig_platform_test" as const,
});

beforeAll(() => {
  databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

describe("one exact Eximbay P3E database-role bootstrap owner", () => {
  it("keeps the operator surface argument-free and explicitly admitted", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const output = Object.freeze({
      stdout: Object.freeze({ write: (value: string | Uint8Array) => {
        stdout.push(String(value));
        return true;
      } }),
      stderr: Object.freeze({ write: (value: string | Uint8Array) => {
        stderr.push(String(value));
        return true;
      } }),
    });
    await expect(main(["--sql", "alternate.sql"], {}, output)).resolves.toBe(64);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([]);
    await expect(main([], {}, output)).resolves.toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      '{"ok":false,"code":"BOOTSTRAP_NOT_EXPLICITLY_ADMITTED"}\n',
    ]);
  });

  it("applies the exact historical and delta artifacts in order and verifies privileges", async () => {
    await withAdmin(async (admin) => {
      const applied: string[] = [];
      const result = await bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        executeArtifact: async (database, artifact, sql) => {
          applied.push(artifact.id);
          await database.query(sql);
        },
      });
      expect(applied).toEqual([
        "FROZEN_HISTORICAL_ROLE_AUTHORITY",
        "EXIMBAY_CANARY_ROLE_GRANT_DELTA",
      ]);
      expect(result).toEqual({
        ok: true,
        code: "EXIMBAY_P3E_DATABASE_BOOTSTRAP_COMPLETE",
        migration: "20260825130000_eximbay_refund_sandbox_canary_approval",
        artifacts: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS.map(
          ({ id, repositoryPath, sha256 }) => ({ id, repositoryPath, sha256 }),
        ),
        postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
      });
    });
  });

  it("fails before role SQL when the exact approval migration is not applied", async () => {
    await withAdmin(async (admin) => {
      await admin.query("BEGIN");
      await admin.query(`
        UPDATE "_prisma_migrations"
        SET rolled_back_at = clock_timestamp()
        WHERE migration_name = '20260825130000_eximbay_refund_sandbox_canary_approval'
      `);
      const executeArtifact = vi.fn(() => Promise.resolve());
      try {
        await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
          ...defaultEximbayP3eDatabaseBootstrapDependencies,
          executeArtifact,
        })).rejects.toMatchObject({ code: "REQUIRED_MIGRATION_ABSENT" });
        expect(executeArtifact).not.toHaveBeenCalled();
      } finally {
        await admin.query("ROLLBACK");
      }
    });
  });

  it("rejects a historical artifact hash mismatch before executing role SQL", async () => {
    await withAdmin(async (admin) => {
      const executeArtifact = vi.fn(() => Promise.resolve());
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        readArtifact: (artifact) => readArtifactWithMutation(
          artifact,
          "FROZEN_HISTORICAL_ROLE_AUTHORITY",
        ),
        executeArtifact,
      })).rejects.toMatchObject({ code: "HISTORICAL_AUTHORITY_INTEGRITY_FAILURE" });
      expect(executeArtifact).not.toHaveBeenCalled();
    });
  });

  it("rejects an Eximbay delta hash mismatch before executing role SQL", async () => {
    await withAdmin(async (admin) => {
      const executeArtifact = vi.fn(() => Promise.resolve());
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        readArtifact: (artifact) => readArtifactWithMutation(
          artifact,
          "EXIMBAY_CANARY_ROLE_GRANT_DELTA",
        ),
        executeArtifact,
      })).rejects.toMatchObject({ code: "EXIMBAY_DELTA_INTEGRITY_FAILURE" });
      expect(executeArtifact).not.toHaveBeenCalled();
    });
  });

  it("fails closed when historical authority runs but delta application is omitted", async () => {
    await withAdmin(async (admin) => {
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        executeArtifact: async (database, artifact, sql) => {
          if (artifact.id === "FROZEN_HISTORICAL_ROLE_AUTHORITY") {
            await database.query(sql);
          }
        },
        beforePostcondition: revokeApprovalAuthority,
      })).rejects.toMatchObject({ code: "ROLE_AUTHORITY_POSTCONDITION_FAILED" });
    });
  });

  it("rejects a broader unexpected approval-table privilege", async () => {
    await withAdmin(async (admin) => {
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        beforePostcondition: async (database) => {
          await database.query(`
            GRANT DELETE ON TABLE "EximbayRefundSandboxCanaryApproval"
            TO mira_refund_preflight
          `);
        },
      })).rejects.toMatchObject({ code: "ROLE_AUTHORITY_POSTCONDITION_FAILED" });
    });
  });

  it("rejects a narrower missing approval-table privilege", async () => {
    await withAdmin(async (admin) => {
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        beforePostcondition: async (database) => {
          await database.query(`
            REVOKE SELECT ON TABLE "EximbayRefundSandboxCanaryApproval"
            FROM mira_refund_preflight
          `);
        },
      })).rejects.toMatchObject({ code: "ROLE_AUTHORITY_POSTCONDITION_FAILED" });
    });
  });
});

async function withAdmin<T>(operation: (admin: Client) => Promise<T>): Promise<T> {
  const admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  try {
    return await operation(admin);
  } finally {
    await admin.end();
  }
}

async function readArtifactWithMutation(
  artifact: EximbayP3eBootstrapArtifact,
  mutatedId: EximbayP3eBootstrapArtifact["id"],
): Promise<string> {
  const source = await readFile(artifact.absolutePath, "utf8");
  return artifact.id === mutatedId ? `${source}\n-- integrity mutation\n` : source;
}

async function revokeApprovalAuthority(admin: Client): Promise<void> {
  await admin.query(`
    REVOKE ALL PRIVILEGES ON TABLE "EximbayRefundSandboxCanaryApproval"
    FROM mira_refund_preflight, mira_refund_canary
  `);
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
    || decodeURIComponent(url.pathname) !== "/wig_platform_test") {
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  }
  return value;
}
