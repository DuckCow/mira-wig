import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ProviderCallBudget,
  type BudgetRecord,
} from "../../../scripts/refund-sandbox-acceptance/call-budget";
import { runCliProcess } from "../../../scripts/refund-sandbox-acceptance/cli";
import {
  ADVISORY_LOCK_RELEASE_FAILED,
  acquireExclusiveRunLock,
  type AdvisoryLockClient,
  type ExclusiveRunLock,
} from "../../../scripts/refund-sandbox-acceptance/exclusive-run-lock";

const RUN_ID = "sbx-20260720T010203Z-1111111111111111";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PostgreSQL advisory-lock release", () => {
  it("accepts exactly one boolean-true unlock result and does not retry release", async () => {
    const client = new ControlledAdvisoryClient(unlockRows({ released: true }));
    const lock = await acquireTestLock(client);

    await lock.release();
    await lock.release();

    expect(client.unlockQueries()).toHaveLength(1);
    expect(client.query).toHaveBeenCalledTimes(2);
  });

  it("fails closed on false and keeps later release calls failed without another unlock", async () => {
    const client = new ControlledAdvisoryClient(unlockRows({ released: false }));
    const lock = await acquireTestLock(client);

    await expect(lock.release()).rejects.toThrow(ADVISORY_LOCK_RELEASE_FAILED);
    await expect(lock.release()).rejects.toThrow(ADVISORY_LOCK_RELEASE_FAILED);

    expect(client.unlockQueries()).toHaveLength(1);
  });

  it.each([
    ["a malformed top-level value", null],
    ["missing rows", Object.freeze({})],
    ["zero rows", Object.freeze({ rows: Object.freeze([]) })],
    ["a missing unlock property", unlockRows({})],
    ["null", unlockRows({ released: null })],
    ["undefined", unlockRows({ released: undefined })],
    ["string true", unlockRows({ released: "true" })],
    ["numeric one", unlockRows({ released: 1 })],
    ["an unexpected row property", unlockRows({ released: true, unexpected: false })],
    ["multiple rows", Object.freeze({
      rows: Object.freeze([
        Object.freeze({ released: true }),
        Object.freeze({ released: true }),
      ]),
    })],
  ])("rejects %s with one safe release failure", async (_case, unlockResult) => {
    const client = new ControlledAdvisoryClient(unlockResult);
    const lock = await acquireTestLock(client);

    const error = await capturedFailure(lock.release());

    expect(error.message).toBe(ADVISORY_LOCK_RELEASE_FAILED);
    expect(error.cause).toBeUndefined();
    expect(client.unlockQueries()).toHaveLength(1);
  });

  it("maps unlock query rejection to the same path-free and value-free failure", async () => {
    const lowLevel = "server=db.internal key=7258356198714201 password=private";
    const client = new ControlledAdvisoryClient(new Error(lowLevel));
    const lock = await acquireTestLock(client);

    const error = await capturedFailure(lock.release());

    expect(error.message).toBe(ADVISORY_LOCK_RELEASE_FAILED);
    expect(error.cause).toBeUndefined();
    expect(String(error)).not.toContain(lowLevel);
    expect(client.unlockQueries()).toHaveLength(1);
  });

  it("gives the safe release failure precedence over an already-failed command body", async () => {
    const client = new ControlledAdvisoryClient(unlockRows({ released: false }));

    const error = await capturedFailure(runLockedCommand(client, () => {
      throw new Error("LOW_LEVEL_DURABLE_BODY_FAILURE");
    }));

    expect(error.message).toBe(ADVISORY_LOCK_RELEASE_FAILED);
    expect(String(error)).not.toContain("LOW_LEVEL_DURABLE_BODY_FAILURE");
    expect(client.unlockQueries()).toHaveLength(1);
  });

  it("keeps a foreign filesystem lock when acquisition cleanup cannot prove advisory release", async () => {
    const root = await temporaryRoot();
    const lockPath = join(root, "run.lock");
    await writeFile(lockPath, "foreign-lock\n", { mode: 0o600 });
    const client = new ControlledAdvisoryClient(unlockRows({ released: false }));

    await expect(acquireExclusiveRunLock(client, lockPath, RUN_ID))
      .rejects.toThrow(ADVISORY_LOCK_RELEASE_FAILED);

    expect(await readFile(lockPath, "utf8")).toBe("foreign-lock\n");
    expect(client.unlockQueries()).toHaveLength(1);
  });
});

describe("advisory-release command and provider lifecycle", () => {
  it("preserves normal non-provider command success when release is proven", async () => {
    const client = new ControlledAdvisoryClient(unlockRows({ released: true }));
    const body = vi.fn(() => Promise.resolve(Object.freeze({ code: "RUN_SEALED" })));

    await expect(runLockedCommand(client, body)).resolves.toEqual({ code: "RUN_SEALED" });

    expect(body).toHaveBeenCalledOnce();
    expect(client.unlockQueries()).toHaveLength(1);
  });

  it("cannot report a DB-backed seal success when unlock returns false", async () => {
    const client = new ControlledAdvisoryClient(unlockRows({ released: false }));
    const body = vi.fn(() => Promise.resolve(Object.freeze({ code: "RUN_SEALED" })));
    const writeStdout = vi.fn();
    const writeStderr = vi.fn();

    const exitCode = await runCliProcess([], {}, {
      execute: () => runLockedCommand(client, body),
      writeStdout,
      writeStderr,
    });

    expect(exitCode).toBe(1);
    expect(body).toHaveBeenCalledOnce();
    expect(writeStdout).not.toHaveBeenCalled();
    expect(writeStderr).toHaveBeenCalledWith("H1_COMMAND_FAILED\n");
    expect(client.unlockQueries()).toHaveLength(1);
  });

  it("keeps completed provider evidence and prevents duplicate contact after unlock false", async () => {
    const client = new ControlledAdvisoryClient(unlockRows({ released: false }));
    const durableRecords: BudgetRecord[] = [];
    let providerCalls = 0;

    await expect(runLockedCommand(client, async (lock) => {
      const budget = durableBudget(durableRecords, lock);
      await budget.invoke("S1", "POST", () => {
        providerCalls += 1;
        return Promise.resolve("provider-complete");
      });
      return Object.freeze({ code: "SCENARIO_COMPLETE" });
    })).rejects.toThrow(ADVISORY_LOCK_RELEASE_FAILED);

    expect(providerCalls).toBe(1);
    expect(durableRecords.map((entry) => entry.phase)).toEqual(["INTENT", "COMPLETED"]);
    const inspected = new ProviderCallBudget(undefined, durableRecords);
    expect(inspected.intentCounts("S1")).toEqual({ GET: 0, POST: 1 });
    expect(inspected.counts("S1")).toEqual({ GET: 0, POST: 1 });
    await expect(inspected.invoke("S1", "POST", () => {
      providerCalls += 1;
      return Promise.resolve("forbidden-duplicate");
    })).rejects.toThrow("PROVIDER_BUDGET_EXCEEDED");
    expect(providerCalls).toBe(1);
    expect(durableRecords).toHaveLength(2);
    expect(client.unlockQueries()).toHaveLength(1);
  });

  it("keeps intent-only evidence without fabricating completion or duplicate contact", async () => {
    const client = new ControlledAdvisoryClient(unlockRows({ released: false }));
    const durableRecords: BudgetRecord[] = [];
    let providerCalls = 0;

    await expect(runLockedCommand(client, async (lock) => {
      const budget = durableBudget(durableRecords, lock);
      await budget.invoke("S1", "POST", () => {
        providerCalls += 1;
        return Promise.reject(new Error("LOW_LEVEL_PROVIDER_FAILURE"));
      });
      return Object.freeze({ code: "UNREACHABLE" });
    })).rejects.toThrow(ADVISORY_LOCK_RELEASE_FAILED);

    expect(durableRecords.map((entry) => entry.phase)).toEqual(["INTENT"]);
    const inspected = new ProviderCallBudget(undefined, durableRecords);
    expect(inspected.counts("S1")).toEqual({ GET: 0, POST: 0 });
    await expect(inspected.invoke("S1", "POST", () => {
      providerCalls += 1;
      return Promise.resolve("forbidden-duplicate");
    })).rejects.toThrow("PROVIDER_BUDGET_EXCEEDED");
    expect(providerCalls).toBe(1);
    expect(durableRecords).toHaveLength(1);
    expect(client.unlockQueries()).toHaveLength(1);
  });
});

class ControlledAdvisoryClient implements AdvisoryLockClient {
  readonly query = vi.fn((text: string, _values: unknown[]): Promise<unknown> => {
    if (text.includes("pg_try_advisory_lock")) {
      return Promise.resolve(unlockRows({ acquired: true }));
    }
    if (!text.includes("pg_advisory_unlock")) {
      return Promise.reject(new Error("TEST_UNEXPECTED_ADVISORY_QUERY"));
    }
    if (this.unlockResult instanceof Error) return Promise.reject(this.unlockResult);
    return Promise.resolve(this.unlockResult);
  });

  constructor(private readonly unlockResult: unknown) {}

  unlockQueries(): readonly unknown[][] {
    return this.query.mock.calls.filter(([text]) => text.includes("pg_advisory_unlock"));
  }
}

function unlockRows(row: Readonly<Record<string, unknown>>): unknown {
  return Object.freeze({ rows: Object.freeze([Object.freeze(row)]) });
}

async function acquireTestLock(client: AdvisoryLockClient): Promise<ExclusiveRunLock> {
  const root = await temporaryRoot();
  return acquireExclusiveRunLock(client, join(root, "run.lock"), RUN_ID);
}

async function runLockedCommand<T>(
  client: AdvisoryLockClient,
  body: (lock: ExclusiveRunLock) => T | Promise<T>,
): Promise<T> {
  const lock = await acquireTestLock(client);
  try {
    return await body(lock);
  } finally {
    await lock.release();
  }
}

function durableBudget(
  durableRecords: BudgetRecord[],
  lock: ExclusiveRunLock,
): ProviderCallBudget {
  return new ProviderCallBudget(
    (entry) => {
      durableRecords.push(entry);
      return Promise.resolve();
    },
    [],
    undefined,
    undefined,
    lock.runProviderContact,
  );
}

async function capturedFailure(operation: Promise<unknown>): Promise<Error> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof Error) return error;
  }
  throw new Error("TEST_EXPECTED_FAILURE");
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mira-advisory-release-"));
  roots.push(root);
  return root;
}
