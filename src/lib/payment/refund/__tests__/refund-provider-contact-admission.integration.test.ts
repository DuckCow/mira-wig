import { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  REFUND_PROVIDER_CONTACT_ADMISSION_APPLICATION_NAME,
  runWithRefundProviderContactAdmission,
  type RefundProviderContactAdmissionClient,
} from "../refund-provider-contact-admission";

const openedClients = new Set<Client>();
let databaseUrl: string;

beforeAll(() => {
  databaseUrl = requireDisposableDatabaseUrl(process.env.DATABASE_URL);
});

afterEach(async () => {
  await Promise.all([...openedClients].map(async (client) => {
    try { await client.end(); } catch { /* already closed */ }
  }));
  openedClients.clear();
  expect(await admissionSessionCount()).toBe(0);
});

describe("refund provider-contact admission with real PostgreSQL sessions", () => {
  it("admits exactly one winner and one zero-work loser while the winner is in flight", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const winnerWork = vi.fn(async () => {
      entered.resolve();
      await release.promise;
      return "WINNER" as const;
    });
    const loserWork = vi.fn(() => Promise.resolve("LOSER_MUST_NOT_RUN" as const));

    const first = runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl }, winnerWork,
    );
    await entered.promise;
    const second = await runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl }, loserWork,
    );
    expect(second).toEqual({ outcome: "BUSY" });
    expect(loserWork).not.toHaveBeenCalled();
    release.resolve();
    await expect(first).resolves.toEqual({ outcome: "ACQUIRED", result: "WINNER" });
    expect(winnerWork).toHaveBeenCalledTimes(1);

    await expect(runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl }, () => Promise.resolve("AFTER_CLEANUP"),
    )).resolves.toEqual({ outcome: "ACQUIRED", result: "AFTER_CLEANUP" });
  });

  it("holds the lock through a protected failure and releases before rethrowing", async () => {
    const entered = deferred<void>();
    const release = deferred<void>();
    const failure = new Error("PROTECTED_FAILURE");
    const first = runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl },
      async () => {
        entered.resolve();
        await release.promise;
        throw failure;
      },
    );
    await entered.promise;
    const competing = vi.fn(() => Promise.resolve("MUST_NOT_RUN"));
    await expect(runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl }, competing,
    )).resolves.toEqual({ outcome: "BUSY" });
    expect(competing).not.toHaveBeenCalled();
    release.resolve();
    await expect(first).rejects.toBe(failure);
    await expect(runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl }, () => Promise.resolve("RECOVERED"),
    )).resolves.toEqual({ outcome: "ACQUIRED", result: "RECOVERED" });
  });

  it("releases on abrupt dedicated-session loss without an explicit unlock", async () => {
    const owned: { client: Client | null } = { client: null };
    const entered = deferred<void>();
    const release = deferred<void>();
    const operation = runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl },
      async () => {
        entered.resolve();
        await release.promise;
        return "PRIMARY" as const;
      },
      Object.freeze({
        createClient: (connectionString): RefundProviderContactAdmissionClient => {
          owned.client = trackedClient(connectionString);
          return owned.client;
        },
      }),
    );
    await entered.promise;
    const ownedClient = owned.client;
    if (!ownedClient) throw new Error("EXPECTED_OWNED_ADMISSION_CLIENT");
    await ownedClient.end();
    openedClients.delete(ownedClient);

    await expect(runWithRefundProviderContactAdmission(
      { DATABASE_URL: databaseUrl }, () => Promise.resolve("AFTER_SESSION_LOSS"),
    )).resolves.toEqual({ outcome: "ACQUIRED", result: "AFTER_SESSION_LOSS" });
    release.resolve();
    await expect(operation).resolves.toEqual({
      outcome: "ADMISSION_CLEANUP_FAILED",
      result: "PRIMARY",
    });
  });
});

function trackedClient(connectionString: string): Client {
  const client = new Client({
    connectionString,
    application_name: REFUND_PROVIDER_CONTACT_ADMISSION_APPLICATION_NAME,
  });
  openedClients.add(client);
  return client;
}

async function admissionSessionCount(): Promise<number> {
  const audit = new Client({ connectionString: databaseUrl, application_name: "mira_p3e_b1_audit" });
  await audit.connect();
  try {
    const result = await audit.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count
      FROM pg_stat_activity
      WHERE application_name = $1
    `, [REFUND_PROVIDER_CONTACT_ADMISSION_APPLICATION_NAME]);
    return Number(result.rows[0]?.count ?? "-1");
  } finally {
    await audit.end();
  }
}

function requireDisposableDatabaseUrl(value: string | undefined): string {
  if (!value) throw new Error("DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (!(["localhost", "127.0.0.1", "::1", "[::1]"] as const).some(
    (host) => host === url.hostname,
  ) || decodeURIComponent(url.pathname) !== "/wig_platform_test") {
    throw new Error("DISPOSABLE_DATABASE_REQUIRED");
  }
  return value;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}
