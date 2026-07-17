import { isDeepStrictEqual } from "util";
import { describe, expect, it } from "vitest";
import { deriveTossRefundOperationKey } from "../refund-operation-key";
import {
  deriveTossRefundCancellationWireRequest,
  TossRefundWireInputError,
} from "../refund-wire-request";
import {
  fingerprintTossRefundWireRequest,
  serializeTossRefundWireFingerprint,
} from "../refund-wire-fingerprint";

const OPERATION_KEY = deriveTossRefundOperationKey("refund:payment_1:attempt_1");
const WIRE_PREIMAGE =
  '["refund-provider-toss-wire/v1","TOSS","SANDBOX","toss-payment-1","FULL",["cancelAmount","85000"],"Mira merchant refund",["taxFreeAmount","ABSENT"],["currency","ABSENT"],"toss-refund-v1-2d1c1179e42747d0f0b0abb3b7ddbd04d7127abd5a0886b1a47922fa46b05dba"]';
const WIRE_DIGEST = "60d5ef6aa31c841b8c1943688442c1d162bb3e642a16df92c5af21ee74923fb6";

describe("Toss refund cancellation wire request", () => {
  it("derives the exact frozen request without authorization material", () => {
    const request = deriveTossRefundCancellationWireRequest(wireInput());

    expect(request.method).toBe("POST");
    expect(request.path === "/v1/payments/toss-payment-1/cancel").toBe(true);
    expect(request.contentType).toBe("application/json");
    expect(request.idempotencyKey === OPERATION_KEY).toBe(true);
    expect(isDeepStrictEqual(Object.keys(request), [
      "method", "path", "contentType", "idempotencyKey", "body",
    ])).toBe(true);
    expect(isDeepStrictEqual(Object.keys(request.body), ["cancelReason", "cancelAmount"]))
      .toBe(true);
    expect(Object.isFrozen(request) && Object.isFrozen(request.body)).toBe(true);
  });

  it("pins exact JSON body order and integer representation", () => {
    const body = deriveTossRefundCancellationWireRequest(wireInput()).body;
    const serialized = JSON.stringify(body);

    expect(serialized === '{"cancelReason":"Mira merchant refund","cancelAmount":85000}')
      .toBe(true);
    expect(typeof body.cancelAmount).toBe("number");
  });

  it("encodes the authoritative payment key only in the URL path", () => {
    const request = deriveTossRefundCancellationWireRequest(wireInput({
      paymentKey: "key/with space?and=query",
    }));

    expect(request.path === "/v1/payments/key%2Fwith%20space%3Fand%3Dquery/cancel").toBe(true);
  });

  it.each([
    null,
    [],
    { ...wireInput(), extra: "field" },
    { paymentKey: "toss-payment-1", providerOperationKey: OPERATION_KEY },
    wireInput({ paymentKey: "key\nvalue" }),
    wireInput({ providerOperationKey: "refund:local:key" }),
    wireInput({ cancelAmount: 0 }),
    wireInput({ cancelAmount: 1.5 }),
    wireInput({ cancelAmount: 2_147_483_648 }),
  ])("rejects invalid wire inputs with a static failure", (input) => {
    let error: unknown;
    try {
      deriveTossRefundCancellationWireRequest(input);
    } catch (caught) {
      error = caught;
    }

    expect(error instanceof TossRefundWireInputError).toBe(true);
    expect(error instanceof Error && error.message === "Toss refund wire input is invalid.")
      .toBe(true);
  });
});

describe("Toss refund wire fingerprint", () => {
  it("pins the exact preimage and independently computed digest", () => {
    expect(serializeTossRefundWireFingerprint(wireInput()) === WIRE_PREIMAGE).toBe(true);
    expect(fingerprintTossRefundWireRequest(wireInput()) === WIRE_DIGEST).toBe(true);
  });

  it("uses decimal text while the HTTP body uses a JSON number", () => {
    const preimage: unknown = JSON.parse(serializeTossRefundWireFingerprint(wireInput()));
    const body = deriveTossRefundCancellationWireRequest(wireInput()).body;
    if (!Array.isArray(preimage) || !Array.isArray(preimage[5])) {
      throw new Error("Expected canonical Toss refund wire array.");
    }

    expect(typeof preimage[5][1]).toBe("string");
    expect(preimage[5][1] === "85000").toBe(true);
    expect(typeof body.cancelAmount).toBe("number");
  });

  it("emits lowercase hexadecimal fingerprints", () => {
    const fingerprint = fingerprintTossRefundWireRequest(wireInput({ cancelAmount: 1 }));

    expect(/^[0-9a-f]{64}$/.test(fingerprint)).toBe(true);
  });
});

function wireInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    paymentKey: "toss-payment-1",
    providerOperationKey: OPERATION_KEY,
    cancelAmount: 85_000,
    ...overrides,
  };
}
