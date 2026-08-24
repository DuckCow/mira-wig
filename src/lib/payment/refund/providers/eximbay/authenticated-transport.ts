import { requireExactText } from "@/lib/payment/providers/eximbay/validation";

const credentialBrand: unique symbol = Symbol("EximbayRefundRestCredentials");
const credentialAuthorities = new WeakMap<object, Readonly<{ authorization: string }>>();

export interface EximbayRefundRestCredentials {
  readonly [credentialBrand]: true;
}

export type EximbayRefundRestFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type EximbayRefundRestAuthenticationErrorCode =
  | "INVALID_API_KEY"
  | "UNTRUSTED_CREDENTIAL_AUTHORITY"
  | "AUTHORIZATION_ALREADY_PRESENT"
  | "INVALID_CONTENT_TYPE";

export class EximbayRefundRestAuthenticationError extends Error {
  constructor(readonly code: EximbayRefundRestAuthenticationErrorCode) {
    super(code);
    this.name = "EximbayRefundRestAuthenticationError";
  }
}

export function createEximbayRefundRestCredentials(
  apiKey: unknown,
): EximbayRefundRestCredentials {
  let exactApiKey: string;
  try {
    exactApiKey = requireExactText(apiKey, "INVALID_API_KEY");
  } catch {
    throw new EximbayRefundRestAuthenticationError("INVALID_API_KEY");
  }
  const credentials: EximbayRefundRestCredentials = { [credentialBrand]: true };
  Object.defineProperty(credentials, credentialBrand, { enumerable: false });
  credentialAuthorities.set(credentials, Object.freeze({
    authorization: `Basic ${Buffer.from(`${exactApiKey}:`, "utf8").toString("base64")}`,
  }));
  return Object.freeze(credentials);
}

export function createAuthenticatedEximbayRefundRestFetch(
  credentials: EximbayRefundRestCredentials,
  fetchImpl: EximbayRefundRestFetch,
): EximbayRefundRestFetch {
  const authority = credentialAuthorities.get(credentials);
  if (!authority) {
    throw new EximbayRefundRestAuthenticationError("UNTRUSTED_CREDENTIAL_AUTHORITY");
  }
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const inputCarriesAuthorization = input instanceof Request
      && input.headers.has("Authorization");
    if (headers.has("Authorization") || inputCarriesAuthorization) {
      throw new EximbayRefundRestAuthenticationError("AUTHORIZATION_ALREADY_PRESENT");
    }
    if (headers.get("Content-Type") !== "application/json") {
      throw new EximbayRefundRestAuthenticationError("INVALID_CONTENT_TYPE");
    }
    headers.set("Authorization", authority.authorization);
    return fetchImpl(input, { ...init, headers });
  };
}
