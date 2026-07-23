import { describe, expect, it, vi } from "vitest";
import {
  REFUND_PROVIDER_CONTACT_ADMISSION_KEY,
  REFUND_PROVIDER_CONTACT_ADMISSION_KEY_VERSION,
  runWithRefundProviderContactAdmission,
  type RefundProviderContactAdmissionClient,
} from "../refund-provider-contact-admission";

const ENV = Object.freeze({ DATABASE_URL: "postgresql://local.invalid/refund" });

describe("refund provider-contact admission contract", () => {
  it("freezes one collision-reviewed signed-int32 authority and acquires/releases it once", async () => {
    const fixture = clientFixture([true, true]);
    const operation = vi.fn(() => Promise.resolve("COMPLETE"));

    await expect(runWithRefundProviderContactAdmission(
      ENV,
      operation,
      Object.freeze({ createClient: () => fixture.client }),
    )).resolves.toEqual({ outcome: "ACQUIRED", result: "COMPLETE" });

    expect(REFUND_PROVIDER_CONTACT_ADMISSION_KEY_VERSION)
      .toBe("mira-refund-provider-contact-admission/v1");
    expect(REFUND_PROVIDER_CONTACT_ADMISSION_KEY).toEqual([1_296_646_721, 1_380_336_385]);
    expect(REFUND_PROVIDER_CONTACT_ADMISSION_KEY.every(
      (key) => Number.isInteger(key) && key >= -2_147_483_648 && key <= 2_147_483_647,
    )).toBe(true);
    expect(fixture.connect).toHaveBeenCalledTimes(1);
    expect(fixture.query).toHaveBeenCalledTimes(2);
    expect(fixture.query.mock.calls).toEqual([
      ["SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired", REFUND_PROVIDER_CONTACT_ADMISSION_KEY],
      ["SELECT pg_advisory_unlock($1::integer, $2::integer) AS released", REFUND_PROVIDER_CONTACT_ADMISSION_KEY],
    ]);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(fixture.end).toHaveBeenCalledTimes(1);
  });

  it("returns BUSY, closes once, and never invokes protected work or unlock", async () => {
    const fixture = clientFixture([false]);
    const operation = vi.fn(() => Promise.resolve("MUST_NOT_RUN"));

    await expect(runWithRefundProviderContactAdmission(
      ENV,
      operation,
      Object.freeze({ createClient: () => fixture.client }),
    )).resolves.toEqual({ outcome: "BUSY" });
    expect(operation).not.toHaveBeenCalled();
    expect(fixture.query).toHaveBeenCalledTimes(1);
    expect(fixture.end).toHaveBeenCalledTimes(1);
  });

  it.each(["construct", "connect", "acquire", "malformed", "busy-close"] as const)(
    "bounds %s failure before protected work",
    async (failure) => {
      const fixture = clientFixture(failure === "malformed" ? ["MALFORMED"] : [false], failure);
      const operation = vi.fn(() => Promise.resolve("MUST_NOT_RUN"));
      const createClient = failure === "construct"
        ? () => { throw new Error("CONSTRUCTION_SECRET"); }
        : () => fixture.client;

      await expect(runWithRefundProviderContactAdmission(
        ENV,
        operation,
        Object.freeze({ createClient }),
      )).resolves.toEqual({ outcome: "ADMISSION_UNAVAILABLE" });
      expect(operation).not.toHaveBeenCalled();
      if (failure !== "construct") expect(fixture.end).toHaveBeenCalledTimes(1);
    },
  );

  it("preserves the protected result while bounding unlock failure and awaiting close", async () => {
    const fixture = clientFixture([true, false]);

    await expect(runWithRefundProviderContactAdmission(
      ENV,
      () => Promise.resolve({ primary: "POSSIBLE_CONTACT" as const }),
      Object.freeze({ createClient: () => fixture.client }),
    )).resolves.toEqual({
      outcome: "ADMISSION_CLEANUP_FAILED",
      result: { primary: "POSSIBLE_CONTACT" },
    });
    expect(fixture.end).toHaveBeenCalledTimes(1);
  });

  it("preserves the protected result while bounding acquired-client close failure", async () => {
    const fixture = clientFixture([true, true], "acquired-close");

    await expect(runWithRefundProviderContactAdmission(
      ENV,
      () => Promise.resolve({ primary: "POSSIBLE_CONTACT" as const }),
      Object.freeze({ createClient: () => fixture.client }),
    )).resolves.toEqual({
      outcome: "ADMISSION_CLEANUP_FAILED",
      result: { primary: "POSSIBLE_CONTACT" },
    });
    expect(fixture.query).toHaveBeenCalledTimes(2);
    expect(fixture.end).toHaveBeenCalledTimes(1);
  });

  it("preserves an operation rejection after one unlock and one awaited close", async () => {
    const fixture = clientFixture([true, true]);
    const failure = new Error("PRIMARY_OPERATION_FAILURE");

    await expect(runWithRefundProviderContactAdmission(
      ENV,
      () => Promise.reject(failure),
      Object.freeze({ createClient: () => fixture.client }),
    )).rejects.toBe(failure);
    expect(fixture.query).toHaveBeenCalledTimes(2);
    expect(fixture.end).toHaveBeenCalledTimes(1);
  });

  it("does not construct a client without a database connection string", async () => {
    const createClient = vi.fn(() => clientFixture([true, true]).client);
    const operation = vi.fn(() => Promise.resolve("MUST_NOT_RUN"));

    await expect(runWithRefundProviderContactAdmission(
      {}, operation, Object.freeze({ createClient }),
    )).resolves.toEqual({ outcome: "ADMISSION_UNAVAILABLE" });
    expect(createClient).not.toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled();
  });
});

function clientFixture(
  results: readonly (boolean | "MALFORMED")[],
  failure?: "construct" | "connect" | "acquire" | "malformed" | "busy-close" | "acquired-close",
) {
  const connect = vi.fn(() => failure === "connect"
    ? Promise.reject(new Error("CONNECT_SECRET"))
    : Promise.resolve());
  const query = vi.fn((_text: string, _values: readonly [number, number]) => {
    if (failure === "acquire") return Promise.reject(new Error("QUERY_SECRET"));
    const value = results[query.mock.calls.length - 1];
    if (value === "MALFORMED") return Promise.resolve({ rows: [{ acquired: true, extra: true }] });
    const key = query.mock.calls.length === 1 ? "acquired" : "released";
    return Promise.resolve({ rows: [{ [key]: value }] });
  });
  const end = vi.fn(() => failure === "busy-close" || failure === "acquired-close"
    ? Promise.reject(new Error("CLOSE_SECRET"))
    : Promise.resolve());
  const client: RefundProviderContactAdmissionClient = Object.freeze({ connect, query, end });
  return { client, connect, query, end };
}
