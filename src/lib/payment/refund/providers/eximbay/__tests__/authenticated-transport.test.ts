import { describe, expect, it, vi } from "vitest";
import {
  EximbayRefundRestAuthenticationError,
  createAuthenticatedEximbayRefundRestFetch,
  createEximbayRefundRestCredentials,
} from "../authenticated-transport";

const API_KEY = "synthetic-api-key-never-log";

describe("Eximbay refund authenticated transport", () => {
  it("keeps credentials opaque and rejects caller-supplied authorization", async () => {
    const credentials = createEximbayRefundRestCredentials(API_KEY);
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const transport = createAuthenticatedEximbayRefundRestFetch(credentials, fetchImpl);

    await expect(transport("https://api-test.eximbay.com/v1/payments/retrieve", {
      method: "POST",
      headers: {
        Authorization: "Bearer caller-controlled",
        "Content-Type": "application/json",
      },
    })).rejects.toMatchObject({ code: "AUTHORIZATION_ALREADY_PRESENT" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(Object.keys(credentials)).toEqual([]);
    expect(JSON.stringify(credentials)).not.toContain(API_KEY);
  });

  it("rejects authorization carried by an input Request", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const transport = createAuthenticatedEximbayRefundRestFetch(
      createEximbayRefundRestCredentials(API_KEY),
      fetchImpl,
    );
    const request = new Request("https://api-test.eximbay.com/v1/payments/retrieve", {
      headers: { Authorization: "Basic caller-controlled" },
    });

    await expect(transport(request, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })).rejects.toMatchObject({ code: "AUTHORIZATION_ALREADY_PRESENT" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   ", " padded-secret ", "line\nbreak"])(
    "rejects malformed API key %j without retaining it",
    (apiKey) => {
      let thrown: unknown;
      try {
        createEximbayRefundRestCredentials(apiKey);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(EximbayRefundRestAuthenticationError);
      if (apiKey) {
        expect(String(thrown)).not.toContain(apiKey);
        expect(JSON.stringify(thrown)).not.toContain(apiKey);
      }
    },
  );
});
