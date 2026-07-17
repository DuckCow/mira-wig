import { TOSS_API_ORIGIN } from "@/lib/payment/providers/toss/adapter";

export const TOSS_REFUND_LOOKUP_TIMEOUT_MS = 3_000;
export const TOSS_REFUND_LOOKUP_MAX_RESPONSE_BYTES = 64 * 1024;

export type TossRefundLookupHttpResult =
  | Readonly<{ kind: "response"; body: string }>
  | Readonly<{ kind: "rejected" }>
  | Readonly<{ kind: "unavailable" }>;

export type TossRefundLookupPort = (
  paymentKey: string,
  authorization: string,
) => Promise<TossRefundLookupHttpResult>;

type TossRefundLookupFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export type TossRefundLookupDependencies = Readonly<{
  fetchFn: TossRefundLookupFetch;
  origin?: string;
}>;

// Refund lookup owns stricter response bounds and parsing so webhook/payment behavior remains unchanged.
export function createTossRefundLookupPort(
  dependencies: TossRefundLookupDependencies,
): TossRefundLookupPort {
  const origin = dependencies.origin ?? TOSS_API_ORIGIN;
  return (paymentKey, authorization) => lookupPayment(
    dependencies.fetchFn,
    origin,
    paymentKey,
    authorization,
  );
}

async function lookupPayment(
  fetchFn: TossRefundLookupFetch,
  origin: string,
  paymentKey: string,
  authorization: string,
): Promise<TossRefundLookupHttpResult> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<TossRefundLookupHttpResult>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(Object.freeze({ kind: "unavailable" }));
    }, TOSS_REFUND_LOOKUP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      fetchAndRead(fetchFn, origin, paymentKey, authorization, controller.signal),
      timeout,
    ]);
  } catch {
    return Object.freeze({ kind: "unavailable" });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchAndRead(
  fetchFn: TossRefundLookupFetch,
  origin: string,
  paymentKey: string,
  authorization: string,
  signal: AbortSignal,
): Promise<TossRefundLookupHttpResult> {
  const response = await fetchFn(
    new URL(`/v1/payments/${encodeURIComponent(paymentKey)}`, origin),
    {
      method: "GET",
      headers: { Authorization: authorization },
      redirect: "error",
      signal,
    },
  );
  return classifyResponse(response);
}

async function classifyResponse(response: Response): Promise<TossRefundLookupHttpResult> {
  if (response.status === 429 || response.status >= 500) {
    return Object.freeze({ kind: "unavailable" });
  }
  if (response.status < 200 || response.status >= 300) {
    return Object.freeze({ kind: "rejected" });
  }
  return readSuccessfulResponse(response);
}

async function readSuccessfulResponse(response: Response): Promise<TossRefundLookupHttpResult> {
  if (!isJsonContentType(response.headers.get("content-type"))) {
    return Object.freeze({ kind: "rejected" });
  }
  const declaredLength = declaredResponseLength(response.headers.get("content-length"));
  if (declaredLength === null
    || declaredLength !== undefined
      && declaredLength > TOSS_REFUND_LOOKUP_MAX_RESPONSE_BYTES) {
    return Object.freeze({ kind: "rejected" });
  }
  const bytes = await readBoundedBody(response);
  if (!bytes) return Object.freeze({ kind: "rejected" });
  try {
    const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return Object.freeze({ kind: "response", body });
  } catch {
    return Object.freeze({ kind: "rejected" });
  }
}

function isJsonContentType(value: string | null): boolean {
  if (!value) return false;
  return /^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/iu.test(value.trim());
}

function declaredResponseLength(value: string | null): number | undefined | null {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const length = Number(normalized);
  return Number.isSafeInteger(length) ? length : null;
}

async function readBoundedBody(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.byteLength;
    if (length > TOSS_REFUND_LOOKUP_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}
