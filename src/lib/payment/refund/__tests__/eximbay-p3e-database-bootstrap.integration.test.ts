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

const HISTORICAL_AUTHORITY_PATH =
  "infra/refund-sandbox/p3e-b2/runtime-deferred/database_roles.sql";
const ROLE_PASSWORD = "eximbay_role_convergence_fixture_only";
const RUNTIME_ROLES = Object.freeze([
  "mira_refund_preflight", "mira_refund_canary",
] as const);
const LOCK_ROUTINES = Object.freeze([
  "mira_refund_canary_lock_payment(text)",
  "mira_refund_canary_lock_provider_operation_binding(text)",
  "mira_refund_canary_lock_command_events(text)",
  "mira_refund_canary_lock_evidence(text)",
]);

let databaseUrl: string;

const input = Object.freeze({
  admission: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ADMISSION,
  environment: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ENVIRONMENT,
  targetDatabaseName: "wig_platform_test" as const,
});

beforeAll(() => {
  databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

describe("convergent exact Eximbay P3E database-role authority", () => {
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
    await expect(main([], {}, output)).resolves.toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      '{"ok":false,"code":"BOOTSTRAP_NOT_EXPLICITLY_ADMITTED"}\n',
    ]);
  });

  it("fails before role SQL when the exact approval migration is absent", async () => {
    await withAdmin(async (admin) => {
      await admin.query("BEGIN");
      await admin.query(`
        UPDATE "_prisma_migrations" SET rolled_back_at = clock_timestamp()
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

  it("rejects current authority byte drift before executing SQL", async () => {
    await withAdmin(async (admin) => {
      const executeArtifact = vi.fn(() => Promise.resolve());
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        readArtifact: (artifact) => readArtifactWithMutation(artifact),
        executeArtifact,
      })).rejects.toMatchObject({ code: "EXIMBAY_AUTHORITY_INTEGRITY_FAILURE" });
      expect(executeArtifact).not.toHaveBeenCalled();
    });
  });

  it("role absent converges without executing the historical broad manifest", async () => {
    await withAdmin(async (admin) => {
      await dropRuntimeRoles(admin);
      const executed: string[] = [];
      const result = await bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        executeArtifact: async (database, artifact, sql) => {
          executed.push(artifact.id);
          await database.query(sql);
        },
      });
      expect(executed).toEqual(["EXIMBAY_CANARY_ROLE_AUTHORITY"]);
      expect(result).toEqual({
        ok: true,
        code: "EXIMBAY_P3E_DATABASE_BOOTSTRAP_COMPLETE",
        migration: "20260825130000_eximbay_refund_sandbox_canary_approval",
        artifacts: EXIMBAY_P3E_DATABASE_BOOTSTRAP_ARTIFACTS.map(
          ({ id, repositoryPath, sha256 }) => ({ id, repositoryPath, sha256 }),
        ),
        historicalAuthorityExecuted: false,
        postcondition: "EXACT_EFFECTIVE_PRIVILEGES_VERIFIED",
      });
    });
  });

  it("empty existing roles converge to the same exact authority", async () => {
    await withAdmin(async (admin) => {
      await dropRuntimeRoles(admin);
      await bootstrapEximbayP3eDatabaseRoles(admin, input);
      const absentRoleAuthority = await privilegeSnapshot(admin);
      await dropRuntimeRoles(admin);
      await admin.query(`
        CREATE ROLE mira_refund_preflight NOLOGIN;
        CREATE ROLE mira_refund_canary NOLOGIN;
      `);
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input)).resolves
        .toMatchObject({ ok: true, historicalAuthorityExecuted: false });
      expect(await privilegeSnapshot(admin)).toEqual(absentRoleAuthority);
      await expectRoleSafety(admin);
    });
  });

  it("historical, PUBLIC, inherited, and default grants converge to the clean snapshot", async () => {
    await withAdmin(async (admin) => {
      await bootstrapEximbayP3eDatabaseRoles(admin, input);
      const expected = await privilegeSnapshot(admin);
      const historical = await readFile(HISTORICAL_AUTHORITY_PATH, "utf8");
      const rendered = historical.replaceAll(
        "DATABASE refund_sandbox", 'DATABASE "wig_platform_test"',
      );
      await admin.query(rendered);
      await admin.query("DROP ROLE IF EXISTS eximbay_effective_authority_probe");
      await admin.query("CREATE ROLE eximbay_effective_authority_probe NOLOGIN");
      try {
        await admin.query(`
          CREATE SEQUENCE public.eximbay_effective_authority_sequence_probe;
          GRANT eximbay_effective_authority_probe TO mira_refund_canary;
          GRANT SELECT ON TABLE "User" TO PUBLIC;
          GRANT USAGE ON SEQUENCE eximbay_effective_authority_sequence_probe TO PUBLIC;
          GRANT EXECUTE ON FUNCTION public.mira_refund_canary_lock_payment(text)
            TO PUBLIC, mira_refund_preflight;
          GRANT CREATE ON SCHEMA public TO PUBLIC;
          ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES
            TO PUBLIC, mira_refund_canary;
          ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES
            TO PUBLIC, mira_refund_canary;
          ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS
            TO PUBLIC, mira_refund_preflight;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES
            TO PUBLIC, mira_refund_canary;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES
            TO PUBLIC, mira_refund_canary;
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
            TO PUBLIC, mira_refund_preflight;
        `);
        await admin.query(`GRANT TEMPORARY ON DATABASE "wig_platform_test" TO PUBLIC`);
        await expect(hasTablePrivilege(admin, "mira_refund_canary", "Order", "UPDATE"))
          .resolves.toBe(true);
        await expect(hasTablePrivilege(admin, "mira_refund_preflight", "User", "SELECT"))
          .resolves.toBe(true);
        await bootstrapEximbayP3eDatabaseRoles(admin, input);
        await expect(hasSequencePrivilege(
          admin, "mira_refund_canary", "eximbay_effective_authority_sequence_probe", "USAGE",
        )).resolves.toBe(false);
        await admin.query("DROP SEQUENCE eximbay_effective_authority_sequence_probe");
        await admin.query(`
          CREATE TABLE public.eximbay_default_table_probe (id integer);
          CREATE SEQUENCE public.eximbay_default_sequence_probe;
          CREATE FUNCTION public.eximbay_default_function_probe() RETURNS integer
            LANGUAGE sql AS 'SELECT 1';
        `);
        await expect(hasTablePrivilege(
          admin, "mira_refund_canary", "eximbay_default_table_probe", "SELECT",
        )).resolves.toBe(false);
        await expect(hasSequencePrivilege(
          admin, "mira_refund_canary", "eximbay_default_sequence_probe", "USAGE",
        )).resolves.toBe(false);
        await expect(hasRoutinePrivilege(
          admin, "mira_refund_canary", "eximbay_default_function_probe()",
        )).resolves.toBe(false);
        await admin.query(`
          DROP TABLE public.eximbay_default_table_probe;
          DROP SEQUENCE public.eximbay_default_sequence_probe;
          DROP FUNCTION public.eximbay_default_function_probe();
        `);
        await expect(effectivePublicAuthorityCount(admin)).resolves.toBe(0);
        await expect(defaultRuntimeAuthorityCount(admin)).resolves.toBe(0);
        expect(await privilegeSnapshot(admin)).toEqual(expected);
      } finally {
        await admin.query("DROP TABLE IF EXISTS public.eximbay_default_table_probe");
        await admin.query("DROP SEQUENCE IF EXISTS public.eximbay_default_sequence_probe");
        await admin.query("DROP FUNCTION IF EXISTS public.eximbay_default_function_probe()");
        await admin.query(
          "DROP SEQUENCE IF EXISTS public.eximbay_effective_authority_sequence_probe",
        );
        await admin.query("DROP ROLE IF EXISTS eximbay_effective_authority_probe");
      }
    });
  });

  it("convergence is idempotent", async () => {
    await withAdmin(async (admin) => {
      await bootstrapEximbayP3eDatabaseRoles(admin, input);
      const first = await privilegeSnapshot(admin);
      await bootstrapEximbayP3eDatabaseRoles(admin, input);
      expect(await privilegeSnapshot(admin)).toEqual(first);
    });
  });

  it("removes unexpected membership edges in both directions", async () => {
    await withAdmin(async (admin) => {
      await bootstrapEximbayP3eDatabaseRoles(admin, input);
      await admin.query("DROP ROLE IF EXISTS eximbay_membership_probe");
      await admin.query("CREATE ROLE eximbay_membership_probe NOLOGIN");
      try {
        await admin.query("GRANT eximbay_membership_probe TO mira_refund_canary");
        await bootstrapEximbayP3eDatabaseRoles(admin, input);
        await admin.query("GRANT mira_refund_canary TO eximbay_membership_probe");
        await bootstrapEximbayP3eDatabaseRoles(admin, input);
        const result = await admin.query<{ count: number }>(`
          SELECT count(*)::int AS count FROM pg_auth_members membership
          JOIN pg_roles parent ON parent.oid = membership.roleid
          JOIN pg_roles member ON member.oid = membership.member
          WHERE parent.rolname IN ('mira_refund_preflight', 'mira_refund_canary')
             OR member.rolname IN ('mira_refund_preflight', 'mira_refund_canary')
        `);
        expect(result.rows).toEqual([{ count: 0 }]);
      } finally {
        await admin.query("DROP ROLE IF EXISTS eximbay_membership_probe");
      }
    });
  });

  it("proves the exact positive and negative effective matrix", async () => {
    await withAdmin(async (admin) => {
      await bootstrapEximbayP3eDatabaseRoles(admin, input);
      await expect(hasTablePrivilege(admin, "mira_refund_canary", "Payment", "SELECT"))
        .resolves.toBe(true);
      await expect(hasTablePrivilege(
        admin, "mira_refund_canary", "RefundExecutionEximbayPreflightObservation", "INSERT",
      )).resolves.toBe(true);
      await expect(hasTablePrivilege(admin, "mira_refund_canary", "PaymentOutbox", "INSERT"))
        .resolves.toBe(true);
      await expect(hasTablePrivilege(admin, "mira_refund_canary", "PaymentOutbox", "SELECT"))
        .resolves.toBe(false);
      await expect(hasTablePrivilege(
        admin, "mira_refund_canary", "RefundExecutionProviderEligibilityProof", "INSERT",
      )).resolves.toBe(false);
      await expect(hasColumnPrivilege(
        admin, "mira_refund_canary", "CheckoutSession", "communicationLocale", "SELECT",
      )).resolves.toBe(true);
      await expect(hasColumnPrivilege(
        admin, "mira_refund_canary", "CheckoutSession", "totalAmount", "SELECT",
      )).resolves.toBe(false);
      for (const [table, column] of [
        ["Payment", "updatedAt"],
        ["RefundExecutionProviderOperationBinding", "createdAt"],
        ["RefundExecutionCommandEvent", "createdAt"],
        ["RefundExecutionEvidence", "createdAt"],
      ] as const) {
        await expect(hasColumnPrivilege(
          admin, "mira_refund_canary", table, column, "UPDATE",
        )).resolves.toBe(false);
      }
      for (const routine of LOCK_ROUTINES) {
        await expect(hasRoutinePrivilege(
          admin, "mira_refund_canary", routine,
        )).resolves.toBe(true);
        await expect(hasRoutinePrivilege(
          admin, "mira_refund_preflight", routine,
        )).resolves.toBe(false);
      }
      await expect(hasDatabasePrivilege(
        admin, "mira_refund_canary", "TEMPORARY",
      )).resolves.toBe(false);
      await expect(effectivePublicAuthorityCount(admin)).resolves.toBe(0);
      await expect(defaultRuntimeAuthorityCount(admin)).resolves.toBe(0);
      await expectRoleSafety(admin);
    });
  });

  it("restricted SQL permits execution facts but rejects broad financial writes", async () => {
    await installPasswords();
    const canary = await restrictedClient("mira_refund_canary");
    try {
      await expect(canary.query(`
        UPDATE "RefundExecutionCommand" SET "status" = "status" WHERE false
      `)).resolves.toMatchObject({ rowCount: 0 });
      await expect(canary.query(`
        INSERT INTO "PaymentOutbox" (
          "id", "topic", "payload", "status", "attempts", "createdAt", "updatedAt"
        ) VALUES ('role-proof-outbox', 'role-proof', '{}'::jsonb, 'PENDING', 0, now(), now())
      `)).resolves.toMatchObject({ rowCount: 1 });
      await withAdmin((admin) => admin.query(
        `DELETE FROM "PaymentOutbox" WHERE "id" = 'role-proof-outbox'`,
      ).then(() => undefined));
      await expectPermissionDenied(canary, `
        UPDATE "Order" SET "totalAmount" = "totalAmount" WHERE false
      `);
      await expectPermissionDenied(canary, `
        INSERT INTO "RefundExecutionProviderOperationBinding" DEFAULT VALUES
      `);
      await expectPermissionDenied(canary, `
        INSERT INTO "RefundExecutionProviderContactEligibilityProof" DEFAULT VALUES
      `);
      await expectPermissionDenied(canary, `SELECT * FROM "PaymentOutbox"`);
      await expectPermissionDenied(canary, `DELETE FROM "RefundAttempt" WHERE false`);
    } finally {
      await canary.end();
    }
  });

  it("uses only fixed lock routines and denies every former lock-column update", async () => {
    await installPasswords();
    const canary = await restrictedClient("mira_refund_canary");
    try {
      await expect(canary.query(`
        SELECT public.mira_refund_canary_lock_payment('absent') AS "payment",
          public.mira_refund_canary_lock_provider_operation_binding('absent') AS "binding",
          public.mira_refund_canary_lock_command_events('absent'),
          public.mira_refund_canary_lock_evidence('absent')
      `)).resolves.toMatchObject({ rows: [{ payment: false, binding: false }] });
      for (const statement of [
        `UPDATE "Payment" SET "updatedAt" = "updatedAt" WHERE false`,
        `UPDATE "RefundExecutionProviderOperationBinding"
          SET "createdAt" = "createdAt" WHERE false`,
        `UPDATE "RefundExecutionCommandEvent" SET "createdAt" = "createdAt" WHERE false`,
        `UPDATE "RefundExecutionEvidence" SET "createdAt" = "createdAt" WHERE false`,
      ]) {
        await expectPermissionDenied(canary, statement);
      }
    } finally {
      await canary.end();
    }
    const preflight = await restrictedClient("mira_refund_preflight");
    try {
      await expectPermissionDenied(preflight, `
        SELECT public.mira_refund_canary_lock_payment('absent')
      `);
    } finally {
      await preflight.end();
    }
  });

  it("revokes effective routine/sequence authority and rejects schema/database TEMP create", async () => {
    await withAdmin(async (admin) => {
      await bootstrapEximbayP3eDatabaseRoles(admin, input);
      await admin.query(`
        CREATE OR REPLACE FUNCTION public.eximbay_role_probe() RETURNS integer
        LANGUAGE sql AS 'SELECT 1';
        CREATE SEQUENCE public.eximbay_role_sequence_probe;
        GRANT EXECUTE ON FUNCTION public.eximbay_role_probe()
          TO PUBLIC, mira_refund_canary;
        GRANT USAGE ON SEQUENCE public.eximbay_role_sequence_probe
          TO PUBLIC, mira_refund_canary;
      `);
      try {
        await bootstrapEximbayP3eDatabaseRoles(admin, input);
        await expect(hasRoutinePrivilege(
          admin, "mira_refund_canary", "eximbay_role_probe()",
        )).resolves.toBe(false);
        await expect(hasSequencePrivilege(
          admin, "mira_refund_canary", "eximbay_role_sequence_probe", "USAGE",
        )).resolves.toBe(false);
      } finally {
        await admin.query("DROP FUNCTION IF EXISTS public.eximbay_role_probe()");
        await admin.query("DROP SEQUENCE IF EXISTS public.eximbay_role_sequence_probe");
      }
    });
    await installPasswords();
    const canary = await restrictedClient("mira_refund_canary");
    try {
      await expectPermissionDenied(canary, "CREATE TABLE forbidden_canary_table (id integer)");
      await expectPermissionDenied(canary, "CREATE TEMP TABLE forbidden_canary_temp (id integer)");
      await expectPermissionDenied(canary, "CREATE SCHEMA forbidden_canary_schema");
      await expectPermissionDenied(canary, `UPDATE "_prisma_migrations" SET logs = logs`);
    } finally {
      await canary.end();
    }
  });

  it("postcondition rejects any injected broader privilege", async () => {
    await withAdmin(async (admin) => {
      await expect(bootstrapEximbayP3eDatabaseRoles(admin, input, {
        ...defaultEximbayP3eDatabaseBootstrapDependencies,
        beforePostcondition: (database) => database.query(`
          GRANT DELETE ON TABLE "EximbayRefundSandboxCanaryApproval"
          TO mira_refund_preflight
        `).then(() => undefined),
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

async function dropRuntimeRoles(admin: Client): Promise<void> {
  for (const role of RUNTIME_ROLES) {
    const exists = await admin.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists", [role],
    );
    if (exists.rows[0]?.exists) {
      await admin.query(`DROP OWNED BY ${role}`);
      await admin.query(`DROP ROLE ${role}`);
    }
  }
}

async function installPasswords(): Promise<void> {
  await withAdmin(async (admin) => {
    await bootstrapEximbayP3eDatabaseRoles(admin, input);
    await admin.query(`
      ALTER ROLE mira_refund_preflight PASSWORD '${ROLE_PASSWORD}';
      ALTER ROLE mira_refund_canary PASSWORD '${ROLE_PASSWORD}';
    `);
  });
}

async function restrictedClient(role: typeof RUNTIME_ROLES[number]): Promise<Client> {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = ROLE_PASSWORD;
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  return client;
}

async function readArtifactWithMutation(
  artifact: EximbayP3eBootstrapArtifact,
): Promise<string> {
  return `${await readFile(artifact.absolutePath, "utf8")}\n-- integrity mutation\n`;
}

async function expectRoleSafety(admin: Client): Promise<void> {
  const result = await admin.query<{
    roleName: string;
    canLogin: boolean;
    superuser: boolean;
    createDatabase: boolean;
    createRole: boolean;
    inherit: boolean;
    replication: boolean;
    bypassRls: boolean;
  }>(`
    SELECT rolname AS "roleName", rolcanlogin AS "canLogin", rolsuper AS superuser,
      rolcreatedb AS "createDatabase", rolcreaterole AS "createRole",
      rolinherit AS inherit, rolreplication AS replication, rolbypassrls AS "bypassRls"
    FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname
  `, [[...RUNTIME_ROLES]]);
  expect(result.rows).toEqual(RUNTIME_ROLES.map((roleName) => ({
    roleName,
    canLogin: true,
    superuser: false,
    createDatabase: false,
    createRole: false,
    inherit: false,
    replication: false,
    bypassRls: false,
  })).sort((left, right) => left.roleName.localeCompare(right.roleName)));
}

async function hasTablePrivilege(
  admin: Client,
  role: string,
  table: string,
  privilege: string,
): Promise<boolean> {
  const result = await admin.query<{ admitted: boolean }>(
    "SELECT has_table_privilege($1, format('%I.%I', 'public', $2::text), $3) AS admitted",
    [role, table, privilege],
  );
  return result.rows[0]?.admitted === true;
}

async function hasColumnPrivilege(
  admin: Client,
  role: string,
  table: string,
  column: string,
  privilege: string,
): Promise<boolean> {
  const result = await admin.query<{ admitted: boolean }>(
    "SELECT has_column_privilege($1, format('%I.%I', 'public', $2::text), $3, $4) AS admitted",
    [role, table, column, privilege],
  );
  return result.rows[0]?.admitted === true;
}

async function hasSequencePrivilege(
  admin: Client,
  role: string,
  sequence: string,
  privilege: string,
): Promise<boolean> {
  const result = await admin.query<{ admitted: boolean }>(
    "SELECT has_sequence_privilege($1, format('%I.%I', 'public', $2::text), $3) AS admitted",
    [role, sequence, privilege],
  );
  return result.rows[0]?.admitted === true;
}

async function hasRoutinePrivilege(
  admin: Client,
  role: string,
  routine: string,
): Promise<boolean> {
  const result = await admin.query<{ admitted: boolean }>(
    "SELECT has_function_privilege($1, format('%I.%s', 'public', $2::text)::regprocedure, 'EXECUTE') AS admitted",
    [role, routine],
  );
  return result.rows[0]?.admitted === true;
}

async function hasDatabasePrivilege(
  admin: Client,
  role: string,
  privilege: string,
): Promise<boolean> {
  const result = await admin.query<{ admitted: boolean }>(
    "SELECT has_database_privilege($1, current_database(), $2) AS admitted",
    [role, privilege],
  );
  return result.rows[0]?.admitted === true;
}

async function effectivePublicAuthorityCount(admin: Client): Promise<number> {
  const result = await admin.query<{ count: number }>(`
    WITH violations AS (
      SELECT 1 FROM pg_database target,
        aclexplode(COALESCE(target.datacl, acldefault('d', target.datdba))) acl
      WHERE target.datname = current_database() AND acl.grantee = 0
        AND acl.privilege_type <> 'CONNECT'
      UNION ALL
      SELECT 1 FROM pg_namespace target,
        aclexplode(COALESCE(target.nspacl, acldefault('n', target.nspowner))) acl
      WHERE target.nspname = 'public' AND acl.grantee = 0
        AND acl.privilege_type <> 'USAGE'
      UNION ALL
      SELECT 1 FROM pg_class target
      JOIN pg_namespace namespace ON namespace.oid = target.relnamespace,
        aclexplode(COALESCE(target.relacl, acldefault(
          CASE WHEN target.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
          target.relowner
        ))) acl
      WHERE namespace.nspname = 'public' AND acl.grantee = 0
      UNION ALL
      SELECT 1 FROM pg_proc target
      JOIN pg_namespace namespace ON namespace.oid = target.pronamespace,
        aclexplode(COALESCE(target.proacl, acldefault('f', target.proowner))) acl
      WHERE namespace.nspname = 'public' AND acl.grantee = 0
    )
    SELECT count(*)::int AS count FROM violations
  `);
  return result.rows[0]?.count ?? -1;
}

async function defaultRuntimeAuthorityCount(admin: Client): Promise<number> {
  const result = await admin.query<{ count: number }>(`
    SELECT count(*)::int AS count
    FROM pg_default_acl defaults,
      aclexplode(defaults.defaclacl) acl
    WHERE defaults.defaclobjtype IN ('r', 'S', 'f')
      AND (acl.grantee = 0 OR acl.grantee IN (
        SELECT oid FROM pg_roles
        WHERE rolname IN ('mira_refund_preflight', 'mira_refund_canary')
      ))
  `);
  return result.rows[0]?.count ?? -1;
}

async function privilegeSnapshot(admin: Client): Promise<unknown> {
  const result = await admin.query<{ snapshot: unknown }>(`
    SELECT jsonb_build_object(
      'roles', (SELECT jsonb_agg(to_jsonb(role) - 'rolpassword' - 'oid' ORDER BY rolname)
        FROM pg_roles role WHERE rolname = ANY($1::text[])),
      'tables', (SELECT jsonb_agg(to_jsonb(grant_row) ORDER BY grantee, table_name, privilege_type)
        FROM information_schema.role_table_grants grant_row
        WHERE grantee = ANY($1::text[])),
      'columns', (SELECT jsonb_agg(to_jsonb(grant_row)
        ORDER BY grantee, table_name, column_name, privilege_type)
        FROM information_schema.role_column_grants grant_row
        WHERE grantee = ANY($1::text[])),
      'database', (SELECT jsonb_agg(jsonb_build_object(
          'role', role_name,
          'connect', has_database_privilege(role_name, current_database(), 'CONNECT'),
          'create', has_database_privilege(role_name, current_database(), 'CREATE'),
          'temporary', has_database_privilege(role_name, current_database(), 'TEMPORARY')
        ) ORDER BY role_name) FROM unnest($1::text[]) role_name),
      'schema', (SELECT jsonb_agg(jsonb_build_object(
          'role', role_name,
          'usage', has_schema_privilege(role_name, 'public', 'USAGE'),
          'create', has_schema_privilege(role_name, 'public', 'CREATE')
        ) ORDER BY role_name) FROM unnest($1::text[]) role_name),
      'routines', (SELECT jsonb_agg(jsonb_build_object(
          'role', role_name, 'routine', routine.proname,
          'execute', has_function_privilege(role_name, routine.oid, 'EXECUTE')
        ) ORDER BY role_name, routine.proname)
        FROM unnest($1::text[]) role_name
        CROSS JOIN pg_proc routine
        JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
        WHERE namespace.nspname = 'public'),
      'memberships', (SELECT count(*) FROM pg_auth_members membership
        JOIN pg_roles parent ON parent.oid = membership.roleid
        JOIN pg_roles member ON member.oid = membership.member
        WHERE parent.rolname = ANY($1::text[]) OR member.rolname = ANY($1::text[])),
      'publicDatabaseAcl', (SELECT jsonb_agg(privilege_type ORDER BY privilege_type)
        FROM pg_database target,
          aclexplode(COALESCE(target.datacl, acldefault('d', target.datdba))) acl
        WHERE target.datname = current_database() AND acl.grantee = 0),
      'publicSchemaAcl', (SELECT jsonb_agg(privilege_type ORDER BY privilege_type)
        FROM pg_namespace target,
          aclexplode(COALESCE(target.nspacl, acldefault('n', target.nspowner))) acl
        WHERE target.nspname = 'public' AND acl.grantee = 0),
      'defaults', (SELECT jsonb_agg(jsonb_build_object(
          'owner', owner.rolname, 'schema', namespace.nspname,
          'type', defaults.defaclobjtype, 'acl', defaults.defaclacl::text
        ) ORDER BY owner.rolname, namespace.nspname NULLS FIRST, defaults.defaclobjtype)
        FROM pg_default_acl defaults
        JOIN pg_roles owner ON owner.oid = defaults.defaclrole
        LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace)
    ) AS snapshot
  `, [[...RUNTIME_ROLES]]);
  return result.rows[0]?.snapshot;
}

async function expectPermissionDenied(client: Client, sql: string): Promise<void> {
  await expect(client.query(sql)).rejects.toThrow(/permission denied/iu);
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
