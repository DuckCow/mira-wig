import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  APPLICATION_CREDENTIAL_MODE,
  APPLICATION_ROLES,
  APPLICATION_SECRETS,
  CANARY_CREDENTIAL_RECOVERY_MODE,
  applicationPasswordSql,
  canonicalApplicationDatabaseUrl,
  crc32c,
  generateApplicationCredential,
  materializeApplicationCredentials,
  postgresScramSha256Verifier,
  recoverCanaryApplicationCredential,
  RestSecretMetadataClient,
  setCanaryApplicationPassword,
  setApplicationPasswords,
  verifyCanaryApplicationPasswordLogin,
  verifyApplicationPasswordLogins,
  type ApplicationCredential,
  type ApplicationRole,
  type SecretMetadataClient,
} from "../../../../../containers/refund-db-bootstrap/application-credentials";

const FIXTURE_PASSWORD = "A".repeat(43);
const FIXTURE_VERIFIER =
  "SCRAM-SHA-256$4096:AAECAwQFBgcICQoLDA0ODw=="
  + "$T81N9dV7rXS4HC+VXZ/7NC3zwxcVC3MIDaxVCZ4TlLQ="
  + ":+gWtpaBBDpnkXPuECQg6JZt3pHyZXOoDFKwMBVR6DEg=";
const CREATE_TIME = "2026-08-31T12:00:00.000Z";

describe("P3E-B2 application credential materialization", () => {
  it("freezes the exact two roles and two existing secret containers", () => {
    expect(APPLICATION_ROLES).toEqual([
      "mira_refund_preflight",
      "mira_refund_canary",
    ]);
    expect(APPLICATION_SECRETS).toEqual({
      mira_refund_preflight:
        "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-preflight-database-url",
      mira_refund_canary:
        "projects/mira-refund-sandbox-0001/secrets/mira-p3e-sbx-canary-database-url",
    });
    expect(() => {
      Reflect.apply(
        generateApplicationCredential,
        undefined,
        ["not-an-application-role"],
      );
    }).toThrow("ROLE_INVALID");
  });

  it("generates 256-bit unpadded base64url passwords without exposing them", () => {
    for (const role of APPLICATION_ROLES) {
      const credential = generateApplicationCredential(role);
      expect(credential.password).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(credential.databaseUrl).not.toContain("undefined");
      expect(credential.verifier).toMatch(/^SCRAM-SHA-256\$4096:/u);
    }
  });

  it("matches the PostgreSQL SCRAM-SHA-256 stored-verifier algorithm", () => {
    expect(postgresScramSha256Verifier(
      "test-vector-only",
      Uint8Array.from({ length: 16 }, (_value, index) => index),
    )).toBe(FIXTURE_VERIFIER);
  });

  it("constructs only the exact canonical postgresql socket URL", () => {
    expect(canonicalApplicationDatabaseUrl(
      "mira_refund_preflight",
      FIXTURE_PASSWORD,
    )).toBe(
      `postgresql://mira_refund_preflight:${FIXTURE_PASSWORD}`
      + "@localhost:5432/refund_sandbox?host=/cloudsql/"
      + "mira-refund-sandbox-0001:asia-northeast3:mira-p3e-sbx-refund-pg18",
    );
  });

  it("builds allowlisted ALTER ROLE SQL containing a verifier but no password", () => {
    const credential = fixtureCredential("mira_refund_preflight");
    const sql = applicationPasswordSql(credential);
    expect(sql).toContain('ALTER ROLE "mira_refund_preflight" PASSWORD');
    expect(sql).toContain("SCRAM-SHA-256$4096:");
    expect(sql).not.toContain(FIXTURE_PASSWORD);
  });

  it("rolls back both password mutations when the transaction postcondition fails", async () => {
    const statements: string[] = [];
    const database = {
      query: vi.fn((sql: string) => {
        statements.push(sql);
        return Promise.resolve({ rows: [] });
      }),
    };
    let verification = 0;
    await expect(setApplicationPasswords(
      database,
      APPLICATION_ROLES.map(fixtureCredential),
      () => {
        verification += 1;
        return verification === 2
          ? Promise.reject(new Error("fixture privilege drift"))
          : Promise.resolve();
      },
    )).rejects.toMatchObject({ code: "APPLICATION_PASSWORD_TRANSACTION_FAILED" });
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(statements.join("\n")).not.toContain(FIXTURE_PASSWORD);
  });

  it("rotates only canary in one transaction and rechecks exact privileges", async () => {
    const statements: string[] = [];
    const verifyExactPrivileges = vi.fn(() => Promise.resolve());
    await setCanaryApplicationPassword(
      { query: (sql: string) => {
        statements.push(sql);
        return Promise.resolve({ rows: [] });
      } },
      fixtureCredential("mira_refund_canary"),
      verifyExactPrivileges,
    );
    expect(statements[0]).toBe("BEGIN");
    expect(statements.at(-1)).toBe("COMMIT");
    expect(statements.filter((sql) => sql.startsWith("ALTER ROLE"))).toHaveLength(1);
    expect(statements.join("\n")).toContain('ALTER ROLE "mira_refund_canary" PASSWORD');
    expect(statements.join("\n")).not.toContain("mira_refund_preflight");
    expect(statements.join("\n")).not.toContain(FIXTURE_PASSWORD);
    expect(verifyExactPrivileges).toHaveBeenCalledTimes(2);
  });

  it("verifies each password login exactly once and performs only identity SELECT", async () => {
    const connects: ApplicationRole[] = [];
    const queries: string[] = [];
    await verifyApplicationPasswordLogins(
      APPLICATION_ROLES.map(fixtureCredential),
      loginClientFactory(connects, queries),
    );
    expect(connects).toEqual(APPLICATION_ROLES);
    expect(queries).toHaveLength(2);
    expect(queries.every((query) => query.includes("current_user")
      && query.includes("current_database()") && query.includes("1::int"))).toBe(true);
  });

  it("verifies exactly one canary password login", async () => {
    const connects: ApplicationRole[] = [];
    const queries: string[] = [];
    await verifyCanaryApplicationPasswordLogin(
      fixtureCredential("mira_refund_canary"),
      loginClientFactory(connects, queries),
    );
    expect(connects).toEqual(["mira_refund_canary"]);
    expect(queries).toHaveLength(1);
  });

  it("fails the 0/0 gate before password generation or database work", async () => {
    const generateCredential = vi.fn(fixtureCredential);
    const generateAndSetPasswords = vi.fn(() => Promise.resolve(
      APPLICATION_ROLES.map(fixtureCredential),
    ));
    const secretManager = secretClient({
      [APPLICATION_SECRETS.mira_refund_preflight]: 1,
      [APPLICATION_SECRETS.mira_refund_canary]: 0,
    });
    await expect(materializeApplicationCredentials({
      secretManager,
      generateCredential,
      generateAndSetPasswords,
      verifyPasswordLogins: vi.fn(() => Promise.resolve()),
    })).rejects.toMatchObject({ code: "SECRET_VERSION_BASELINE_DRIFT" });
    expect(generateCredential).not.toHaveBeenCalled();
    expect(generateAndSetPasswords).not.toHaveBeenCalled();
  });

  it("also fails before password generation when only canary has a version", async () => {
    const generateCredential = vi.fn(fixtureCredential);
    const generateAndSetPasswords = vi.fn(() => Promise.resolve(
      APPLICATION_ROLES.map(fixtureCredential),
    ));
    await expect(materializeApplicationCredentials({
      secretManager: secretClient({
        [APPLICATION_SECRETS.mira_refund_preflight]: 0,
        [APPLICATION_SECRETS.mira_refund_canary]: 1,
      }),
      generateCredential,
      generateAndSetPasswords,
      verifyPasswordLogins: vi.fn(() => Promise.resolve()),
    })).rejects.toMatchObject({ code: "SECRET_VERSION_BASELINE_DRIFT" });
    expect(generateCredential).not.toHaveBeenCalled();
    expect(generateAndSetPasswords).not.toHaveBeenCalled();
  });

  it("publishes preflight then canary once after both password logins", async () => {
    const order: string[] = [];
    const counts = new Map<string, number>(
      Object.values(APPLICATION_SECRETS).map((secret) => [secret, 0]),
    );
    const addVersionOnce = vi.fn((secret: string, payload: Buffer) => {
      order.push(`add:${secret}`);
      expect(payload.toString("utf8")).toMatch(/^postgresql:\/\//u);
      counts.set(secret, 1);
      return Promise.resolve(version(secret));
    });
    const secretManager: SecretMetadataClient = {
      listVersions: (secret) => {
        const count = counts.get(secret) ?? 0;
        return Promise.resolve({
          count,
          versions: count === 0 ? [] : [version(secret)],
        });
      },
      addVersionOnce,
    };
    const result = await materializeApplicationCredentials({
      secretManager,
      generateCredential: fixtureCredential,
      generateAndSetPasswords: (generateCredential) => {
        order.push("db-password-transaction");
        return Promise.resolve(APPLICATION_ROLES.map(generateCredential));
      },
      verifyPasswordLogins: () => {
        order.push("password-logins");
        return Promise.resolve();
      },
    });
    expect(order).toEqual([
      "db-password-transaction",
      "password-logins",
      `add:${APPLICATION_SECRETS.mira_refund_preflight}`,
      `add:${APPLICATION_SECRETS.mira_refund_canary}`,
    ]);
    expect(addVersionOnce).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      code: "APP_CREDENTIAL_MATERIALIZATION_COMPLETE",
      mode: APPLICATION_CREDENTIAL_MODE,
      secretPayloadReads: 0,
      applicationRuntimeExecutions: 0,
      providerEffects: 0,
    });
    expect(JSON.stringify(result)).not.toContain(FIXTURE_PASSWORD);
    expect(JSON.stringify(result)).not.toContain(FIXTURE_VERIFIER);
  });

  it.each([
    "mira-refund-sandbox-0001",
    "925882331349",
  ])("accepts exact SecretVersion project representation %s", async (project) => {
    const secret = APPLICATION_SECRETS.mira_refund_preflight;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(metadataToken())
      .mockResolvedValueOnce(versionListWithName(
        `projects/${project}/secrets/mira-p3e-sbx-preflight-database-url/versions/1`,
      ));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(new RestSecretMetadataClient().listVersions(secret)).resolves.toMatchObject({
        count: 1,
        versions: [{ state: "ENABLED", checksumAcknowledged: true }],
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["other numeric project", "projects/925882331350/secrets/mira-p3e-sbx-preflight-database-url/versions/1"],
    ["other project ID", "projects/mira-refund-sandbox-0002/secrets/mira-p3e-sbx-preflight-database-url/versions/1"],
    ["wrong secret", "projects/925882331349/secrets/mira-p3e-sbx-canary-database-url/versions/1"],
    ["latest", "projects/925882331349/secrets/mira-p3e-sbx-preflight-database-url/versions/latest"],
    ["zero-padded version", "projects/925882331349/secrets/mira-p3e-sbx-preflight-database-url/versions/01"],
    ["location-qualified", "projects/925882331349/locations/asia-northeast3/secrets/mira-p3e-sbx-preflight-database-url/versions/1"],
    ["additional segment", "projects/925882331349/secrets/mira-p3e-sbx-preflight-database-url/versions/1/extra"],
    ["suffix-only", "mira-p3e-sbx-preflight-database-url/versions/1"],
  ])("rejects %s SecretVersion metadata", async (_name, resourceName) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(metadataToken())
      .mockResolvedValueOnce(versionListWithName(resourceName));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(new RestSecretMetadataClient().listVersions(
        APPLICATION_SECRETS.mira_refund_preflight,
      )).rejects.toMatchObject({ code: "SECRET_METADATA_UNAVAILABLE" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["0/0", 0, 0],
    ["0/1", 0, 1],
    ["1/1", 1, 1],
    ["2/0", 2, 0],
  ])("rejects canary recovery tuple %s before generation", async (
    _name,
    preflightCount,
    canaryCount,
  ) => {
    const generateCredential = vi.fn(fixtureCredential);
    const generateAndSetCanaryPassword = vi.fn(() => Promise.resolve(
      fixtureCredential("mira_refund_canary"),
    ));
    await expect(recoverCanaryApplicationCredential({
      secretManager: secretClient({
        [APPLICATION_SECRETS.mira_refund_preflight]: preflightCount,
        [APPLICATION_SECRETS.mira_refund_canary]: canaryCount,
      }),
      generateCredential,
      generateAndSetCanaryPassword,
      verifyCanaryPasswordLogin: vi.fn(() => Promise.resolve()),
    })).rejects.toMatchObject({ code: "SECRET_VERSION_BASELINE_DRIFT" });
    expect(generateCredential).not.toHaveBeenCalled();
    expect(generateAndSetCanaryPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong version", {
      ...version(APPLICATION_SECRETS.mira_refund_preflight, "925882331349"),
      name: "projects/925882331349/secrets/mira-p3e-sbx-preflight-database-url/versions/2",
    }],
    ["disabled version", {
      ...version(APPLICATION_SECRETS.mira_refund_preflight, "925882331349"),
      state: "DISABLED",
    }],
    ["missing checksum acknowledgment", {
      ...version(APPLICATION_SECRETS.mira_refund_preflight, "925882331349"),
      checksumAcknowledged: false,
    }],
  ])("rejects recovery preflight %s before canary mutation", async (_name, observed) => {
    const generateAndSetCanaryPassword = vi.fn(() => Promise.resolve(
      fixtureCredential("mira_refund_canary"),
    ));
    await expect(recoverCanaryApplicationCredential({
      secretManager: {
        listVersions: (secret) => Promise.resolve(secret
          === APPLICATION_SECRETS.mira_refund_preflight
          ? { count: 1, versions: [observed] }
          : { count: 0, versions: [] }),
        addVersionOnce: vi.fn((secret: string) => Promise.resolve(version(secret))),
      },
      generateCredential: fixtureCredential,
      generateAndSetCanaryPassword,
      verifyCanaryPasswordLogin: vi.fn(() => Promise.resolve()),
    })).rejects.toMatchObject({ code: "SECRET_VERSION_BASELINE_DRIFT" });
    expect(generateAndSetCanaryPassword).not.toHaveBeenCalled();
  });

  it("recovers only canary from exact 1/0 without reading or mutating preflight", async () => {
    const order: string[] = [];
    const counts = new Map<string, number>([
      [APPLICATION_SECRETS.mira_refund_preflight, 1],
      [APPLICATION_SECRETS.mira_refund_canary, 0],
    ]);
    const addVersionOnce = vi.fn((secret: string, payload: Buffer) => {
      order.push(`add:${secret}`);
      expect(secret).toBe(APPLICATION_SECRETS.mira_refund_canary);
      expect(payload.toString("utf8")).toContain("mira_refund_canary");
      counts.set(secret, 1);
      return Promise.resolve(version(secret, "925882331349"));
    });
    const secretManager: SecretMetadataClient = {
      listVersions: (secret) => {
        const count = counts.get(secret) ?? 0;
        return Promise.resolve({
          count,
          versions: count === 0 ? [] : [version(secret, "925882331349")],
        });
      },
      addVersionOnce,
    };
    const generateCredential = vi.fn(fixtureCredential);
    const result = await recoverCanaryApplicationCredential({
      secretManager,
      generateCredential,
      generateAndSetCanaryPassword: (generate) => {
        order.push("canary-password-transaction");
        return Promise.resolve(generate("mira_refund_canary"));
      },
      verifyCanaryPasswordLogin: () => {
        order.push("canary-password-login");
        return Promise.resolve();
      },
    });
    expect(order).toEqual([
      "canary-password-transaction",
      "canary-password-login",
      `add:${APPLICATION_SECRETS.mira_refund_canary}`,
    ]);
    expect(generateCredential).toHaveBeenCalledOnce();
    expect(generateCredential).toHaveBeenCalledWith("mira_refund_canary");
    expect(addVersionOnce).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      code: "APP_CREDENTIAL_CANARY_RECOVERY_COMPLETE",
      mode: CANARY_CREDENTIAL_RECOVERY_MODE,
      passwordLogin: { role: "mira_refund_canary", verified: true },
      secret: { version: "1", state: "ENABLED", checksumAcknowledged: true },
      secretPayloadReads: 0,
      applicationRuntimeExecutions: 0,
      providerEffects: 0,
    });
    expect(JSON.stringify(result)).not.toContain(FIXTURE_PASSWORD);
    expect(JSON.stringify(result)).not.toContain(FIXTURE_VERIFIER);
  });

  it("makes at most one canary AddVersion call after ambiguous recovery publication", async () => {
    const responses = [
      metadataToken(),
      versionList(1, APPLICATION_SECRETS.mira_refund_preflight, "925882331349"),
      versionList(0),
      versionList(0),
      new Error("ambiguous transport failure"),
      versionList(1, APPLICATION_SECRETS.mira_refund_canary, "925882331349"),
    ];
    const fetchMock = vi.fn((_input: string) => {
      const next = responses.shift();
      if (next instanceof Error) return Promise.reject(next);
      if (!next) return Promise.reject(new Error("unexpected fetch"));
      return Promise.resolve(next);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(recoverCanaryApplicationCredential({
        secretManager: new RestSecretMetadataClient(),
        generateCredential: fixtureCredential,
        generateAndSetCanaryPassword: (generate) => Promise.resolve(
          generate("mira_refund_canary"),
        ),
        verifyCanaryPasswordLogin: () => Promise.resolve(),
      })).rejects.toMatchObject({
        code: "SECRET_VERSION_ADD_AMBIGUOUS_ONE",
        versionCount: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const addCalls = fetchMock.mock.calls.filter(([input]) => input.endsWith(":addVersion"));
    expect(addCalls).toHaveLength(1);
  });

  it("makes one AddVersion call and fails closed after an ambiguous result", async () => {
    const responses = [
      metadataToken(),
      versionList(0),
      versionList(0),
      versionList(0),
      new Error("ambiguous transport failure"),
      versionList(1, APPLICATION_SECRETS.mira_refund_preflight),
    ];
    const fetchMock = vi.fn((_input: string) => {
      const next = responses.shift();
      if (next instanceof Error) return Promise.reject(next);
      if (!next) return Promise.reject(new Error("unexpected fetch"));
      return Promise.resolve(next);
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(materializeApplicationCredentials({
        secretManager: new RestSecretMetadataClient(),
        generateCredential: fixtureCredential,
        generateAndSetPasswords: (generateCredential) => Promise.resolve(
          APPLICATION_ROLES.map(generateCredential),
        ),
        verifyPasswordLogins: () => Promise.resolve(),
      })).rejects.toMatchObject({
        code: "SECRET_VERSION_ADD_AMBIGUOUS_ONE",
        versionCount: 1,
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const addCalls = fetchMock.mock.calls.filter(([input]) => input.endsWith(":addVersion"));
    expect(addCalls).toHaveLength(1);
  });

  it("uses standard CRC32C and keeps credential material out of runtime logging", () => {
    expect(crc32c(Buffer.from("123456789", "ascii"))).toBe(0xe306_9283);
    const source = readFileSync(join(
      process.cwd(),
      "containers/refund-db-bootstrap/application-credentials.ts",
    ), "utf8");
    expect(source).not.toMatch(/console\.|process\.(?:stdout|stderr)\.write/u);
    expect(source).not.toContain("secretmanager.versions.access");
    expect(source).not.toContain("accessSecretVersion");
    expect(source.match(/addVersionOnce\(/gu)).toHaveLength(2);
  });

  it("does not activate runtime or configure a provider boundary", () => {
    const runtimeLocals = readFileSync(join(
      process.cwd(),
      "infra/refund-sandbox/p3e-b2/runtime/locals.tf",
    ), "utf8");
    const credentialSource = readFileSync(join(
      process.cwd(),
      "containers/refund-db-bootstrap/application-credentials.ts",
    ), "utf8");
    expect(runtimeLocals).toContain("runtime_apply_authorized   = false");
    expect(runtimeLocals).toContain("^[1-9][0-9]{0,18}$");
    expect(credentialSource).not.toMatch(/EXIMBAY|provider[_-]credential/iu);
  });

  it("generates credentials only after the live DB authority precheck", () => {
    const entrypoint = readFileSync(join(
      process.cwd(),
      "containers/refund-db-bootstrap/entrypoint.ts",
    ), "utf8");
    const authorityCheck = entrypoint.indexOf(
      "await verifyExactEffectivePrivileges(database);",
    );
    const generation = entrypoint.indexOf(
      "APPLICATION_ROLES.map(generateCredentialValue)",
    );
    expect(authorityCheck).toBeGreaterThan(-1);
    expect(generation).toBeGreaterThan(authorityCheck);
  });
});

function fixtureCredential(role: ApplicationRole): ApplicationCredential {
  return Object.freeze({
    role,
    password: FIXTURE_PASSWORD,
    verifier: FIXTURE_VERIFIER,
    databaseUrl: canonicalApplicationDatabaseUrl(role, FIXTURE_PASSWORD),
  });
}

function version(
  secretResourceName: string,
  project = "mira-refund-sandbox-0001",
) {
  const secretId = secretResourceName.split("/").at(-1);
  return Object.freeze({
    name: `projects/${project}/secrets/${secretId}/versions/1`,
    state: "ENABLED",
    createTime: CREATE_TIME,
    checksumAcknowledged: true,
  });
}

function secretClient(counts: Readonly<Record<string, number>>): SecretMetadataClient {
  return {
    listVersions: (secret) => Promise.resolve({
      count: counts[secret] ?? 0,
      versions: (counts[secret] ?? 0) === 0 ? [] : [version(secret)],
    }),
    addVersionOnce: (secret) => Promise.resolve(version(secret)),
  };
}

function loginClientFactory(
  connects: ApplicationRole[],
  queries: string[],
) {
  return (databaseUrl: string) => {
    const role = APPLICATION_ROLES.find((candidate) => databaseUrl.includes(candidate));
    if (!role) throw new Error("fixture role absent");
    return {
      connect: () => {
        connects.push(role);
        return Promise.resolve();
      },
      query: (sql: string) => {
        queries.push(sql);
        return Promise.resolve({
          rows: [{ currentUser: role, currentDatabase: "refund_sandbox", one: 1 }],
        });
      },
      end: () => Promise.resolve(),
    };
  };
}

function metadataToken(): Response {
  return new Response(JSON.stringify({
    access_token: "fixture-access-token-that-is-long-enough",
    token_type: "Bearer",
    expires_in: 3_599,
  }), { status: 200, headers: { "metadata-flavor": "Google" } });
}

function versionList(count: number, secret?: string, project?: string): Response {
  return new Response(JSON.stringify({
    versions: count === 0 || !secret ? [] : [{
      ...version(secret, project),
      clientSpecifiedPayloadChecksum: true,
    }],
    totalSize: String(count),
  }), { status: 200 });
}

function versionListWithName(name: string): Response {
  return new Response(JSON.stringify({
    versions: [{
      name,
      state: "ENABLED",
      createTime: CREATE_TIME,
      clientSpecifiedPayloadChecksum: true,
    }],
    totalSize: "1",
  }), { status: 200 });
}
