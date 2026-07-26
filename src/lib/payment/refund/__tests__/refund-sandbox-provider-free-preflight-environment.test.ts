import { parse as parsePgConnectionString } from "pg-connection-string";
import { describe, expect, it } from "vitest";
import { REFUND_EXECUTION_ACTIVATION_KEYS } from "../execution-activation";
import {
  REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
  REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY,
  parseCanonicalRefundCloudSqlDatabaseUrl,
  safeRefundSandboxProviderFreePreflightEnvironment,
} from "../refund-sandbox-provider-free-preflight-environment";

const SOCKET = "/cloudsql/mira-refund-sbx:asia-northeast3:refund-db";
const CLOUD_DATABASE_PREFIX =
  "postgresql://preflight_role:fixture_password@localhost:5432/refund_sandbox";
const DATABASE_URL = `${CLOUD_DATABASE_PREFIX}?host=${SOCKET}`;

function inspectDatabaseUrl(databaseUrl: string) {
  return safeRefundSandboxProviderFreePreflightEnvironment({
    [REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]:
      REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
    DATABASE_URL: databaseUrl,
  });
}

describe("provider-free cloud preflight environment guard", () => {
  it("exposes the exact canonical socket and instance binding to the container adapter", () => {
    expect(parseCanonicalRefundCloudSqlDatabaseUrl(DATABASE_URL)).toEqual({
      socketHost: SOCKET,
      instanceConnectionName: "mira-refund-sbx:asia-northeast3:refund-db",
    });
    expect(parseCanonicalRefundCloudSqlDatabaseUrl(null)).toBeNull();
  });

  it("accepts only the explicit provider-free mode and Cloud SQL socket shape", () => {
    const env = Object.freeze({
      [REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]:
        REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
      DATABASE_URL,
    });

    expect(safeRefundSandboxProviderFreePreflightEnvironment(env)).toEqual({
      DATABASE_URL,
      activationEnvironment: env,
    });
    const parsed = parsePgConnectionString(DATABASE_URL);
    expect(Object.keys(parsed).sort()).toEqual([
      "database", "host", "password", "port", "user",
    ]);
    expect(parsed).toMatchObject({
      host: SOCKET,
      database: "refund_sandbox",
      user: "preflight_role",
      password: "fixture_password",
      port: "5432",
    });
  });

  it.each([
    ["safe first and unsafe last", `host=${SOCKET}&host=203.0.113.10`],
    ["unsafe first and safe last", `host=203.0.113.10&host=${SOCKET}`],
    ["two identical socket values", `host=${SOCKET}&host=${SOCKET}`],
    ["percent-decoded duplicate key", `host=${SOCKET}&h%6fst=${SOCKET}`],
    ["empty first and socket last", `host=&host=${SOCKET}`],
    ["socket first and empty last", `host=${SOCKET}&host=`],
  ])("rejects duplicate host parameters: %s", (_name, query) => {
    expect(inspectDatabaseUrl(
      `postgresql://preflight_role:fixture_password@localhost:5432/refund_sandbox?${query}`,
    )).toBeNull();
  });

  it.each([
    ["fully encoded separators", "host=%2Fcloudsql%2Fmira-refund-sbx%3Aasia-northeast3%3Arefund-db"],
    ["lowercase encoded separators", "host=%2fcloudsql%2fmira-refund-sbx%3aasia-northeast3%3arefund-db"],
    ["partially encoded project slash", "host=/cloudsql%2Fmira-refund-sbx:asia-northeast3:refund-db"],
    ["encoded first binding colon", "host=/cloudsql/mira-refund-sbx%3Aasia-northeast3:refund-db"],
    ["encoded second binding colon", "host=/cloudsql/mira-refund-sbx:asia-northeast3%3Arefund-db"],
    ["double-encoded separators", "host=%252Fcloudsql%252Fmira-refund-sbx%253Aasia-northeast3%253Arefund-db"],
    ["sole encoded key", `h%6fst=${SOCKET}`],
    ["encoded equals", `host%3D${SOCKET}`],
    ["encoded ampersand delimiter", `host=${SOCKET}%26host=203.0.113.10`],
    ["encoded question delimiter", `host=${SOCKET}%3Fhost=203.0.113.10`],
    ["literal plus", `host=${SOCKET}+`],
    ["literal semicolon", `host=${SOCKET};`],
    ["second question delimiter", `host=${SOCKET}?host=203.0.113.10`],
  ])("rejects noncanonical raw query spelling: %s", (_name, query) => {
    expect(inspectDatabaseUrl(`${CLOUD_DATABASE_PREFIX}?${query}`)).toBeNull();
  });

  it("distinguishes pg semantic decoding from mandatory raw canonical spelling", () => {
    const encoded = `${CLOUD_DATABASE_PREFIX}?host=%2Fcloudsql%2Fmira-refund-sbx%3Aasia-northeast3%3Arefund-db`;
    expect(parsePgConnectionString(encoded).host).toBe(SOCKET);
    expect(inspectDatabaseUrl(encoded)).toBeNull();
  });

  it.each([
    ["hostaddr", `host=${SOCKET}&hostaddr=203.0.113.10`],
    ["remote authority", `host=${SOCKET}`, "db.example:5432"],
    ["IP authority", `host=${SOCKET}`, "203.0.113.10:5432"],
    ["missing explicit port", `host=${SOCKET}`, "localhost"],
    ["comma-separated fallback host", "host=203.0.113.10,203.0.113.11"],
    ["multiple socket paths", `host=${SOCKET},${SOCKET}`],
    ["query database override", `host=${SOCKET}&database=other_database`],
    ["query port override", `host=${SOCKET}&port=6432`],
    ["query user override", `host=${SOCKET}&user=other_role`],
    ["query password override", `host=${SOCKET}&password=other_password`],
    ["service indirection", `host=${SOCKET}&service=remote`],
    ["passfile indirection", `host=${SOCKET}&passfile=/tmp/pass`],
    ["unsupported SSL option", `host=${SOCKET}&sslmode=require`],
    ["whitespace around socket", `host=%20${SOCKET}%20`],
    ["socket control character", `host=${SOCKET}%00`],
    ["alternate socket root", "host=/tmp/mira-refund-sbx:asia-northeast3:refund-db"],
    ["socket traversal", `host=/cloudsql/../${SOCKET.slice("/cloudsql/".length)}`],
    ["alternate region", `host=${SOCKET.replace("asia-northeast3", "us-central1")}`],
  ])("rejects alternate connection authority: %s", (
    _name, query, authority = "localhost:5432",
  ) => {
    expect(inspectDatabaseUrl(
      `postgresql://preflight_role:fixture_password@${authority}/refund_sandbox?${query}`,
    )).toBeNull();
  });

  it.each([
    ...REFUND_EXECUTION_ACTIVATION_KEYS,
    "TOSS_SANDBOX_SECRET_KEY",
    "PAYPAL_SECRET_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "GOOGLE_CREDENTIALS",
    "GOOGLE_OAUTH_ACCESS_TOKEN",
    "CLOUDSDK_AUTH_ACCESS_TOKEN",
    "CLOUDSDK_CORE_PROJECT",
    "MIRA_TOSS_SANDBOX_ACCEPTANCE_RUN_ID",
    "TOSS_BASE_URL",
    "PAYPAL_BASE_URL",
    "REFUND_CANARY_TARGET",
    "REFUND_CANARY_APPROVAL",
    "REFUND_CANARY_SECRET_GENERATION",
    "PGHOST",
    "PGHOSTADDR",
    "PGPORT",
    "PGDATABASE",
    "PGUSER",
    "PGPASSWORD",
    "PGSERVICE",
    "PGPASSFILE",
    "PGSSLMODE",
  ])("rejects nonblank sensitive input %s", (key) => {
    expect(safeRefundSandboxProviderFreePreflightEnvironment({
      [REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]:
        REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
      DATABASE_URL,
      [key]: "FORBIDDEN",
    })).toBeNull();
  });

  it("allows blank sensitive variables without enabling a capability", () => {
    expect(safeRefundSandboxProviderFreePreflightEnvironment({
      [REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]:
        REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
      DATABASE_URL,
      REFUND_EXECUTION_WORKER_ENABLED: " \t",
      TOSS_SANDBOX_SECRET_KEY: "",
    })).not.toBeNull();
  });

  it.each([
    ["missing mode", { DATABASE_URL }],
    ["wrong mode", { MIRA_REFUND_P3E_PREFLIGHT_MODE: "OTHER", DATABASE_URL }],
    ["local test", { MIRA_REFUND_P3E_PREFLIGHT_MODE: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE, DATABASE_URL: "postgresql://localhost/wig_platform_test" }],
    ["development", { MIRA_REFUND_P3E_PREFLIGHT_MODE: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE, DATABASE_URL: DATABASE_URL.replace("refund_sandbox", "refund_development") }],
    ["production", { MIRA_REFUND_P3E_PREFLIGHT_MODE: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE, DATABASE_URL: DATABASE_URL.replace("refund_sandbox", "refund_production") }],
    ["acceptance", { MIRA_REFUND_P3E_PREFLIGHT_MODE: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE, DATABASE_URL: DATABASE_URL.replace("refund_sandbox", "refund_acceptance") }],
    ["alternate region", { MIRA_REFUND_P3E_PREFLIGHT_MODE: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE, DATABASE_URL: DATABASE_URL.replace("asia-northeast3", "us-central1") }],
    ["no socket", { MIRA_REFUND_P3E_PREFLIGHT_MODE: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE, DATABASE_URL: "postgresql://db.example/refund_sandbox" }],
  ])("rejects %s database identity", (_name, env) => {
    expect(safeRefundSandboxProviderFreePreflightEnvironment(env)).toBeNull();
  });

  it("rejects proxies, accessors, symbols, and inherited input without invoking getters", () => {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "DATABASE_URL", {
      enumerable: true,
      get() { getterCalls += 1; return DATABASE_URL; },
    });
    Object.defineProperty(accessor, REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY, {
      enumerable: true,
      value: REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
    });
    const inherited: object = {};
    Reflect.setPrototypeOf(inherited, {
      [REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE_KEY]:
        REFUND_SANDBOX_PROVIDER_FREE_PREFLIGHT_MODE,
      DATABASE_URL,
    });
    const malformed: unknown[] = [
      new Proxy({}, {}), accessor, inherited, { [Symbol("env")]: DATABASE_URL },
    ];
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    malformed.push(revoked.proxy);
    for (const value of malformed) {
      expect(safeRefundSandboxProviderFreePreflightEnvironment(value)).toBeNull();
    }
    expect(getterCalls).toBe(0);
  });
});
