import { TOSS_API_ORIGIN } from "@/lib/payment/providers/toss/adapter";
import type { TossRefundCancellationWireRequest } from "./refund-wire-request";

export const TOSS_REFUND_CANCELLATION_TIMEOUT_MS = 3_000;
export const TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES = 64 * 1024;

export type TossRefundCancellationTransportResult =
  | Readonly<{ kind: "success"; body: string }>
  | Readonly<{ kind: "rejected" }>
  | Readonly<{ kind: "unknown" }>;

export type TossRefundCancellationContact = Readonly<{
  authorization: string;
  wire: TossRefundCancellationWireRequest;
}>;

export type TossRefundCancellationPort = (
  contact: TossRefundCancellationContact,
) => Promise<TossRefundCancellationTransportResult>;

type CancellationFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>;

export function createTossRefundCancellationPort(
  dependencies: Readonly<{ fetchFn: CancellationFetch; origin?: string }>,
): TossRefundCancellationPort {
  const origin = dependencies.origin ?? TOSS_API_ORIGIN;
  return (contact) => cancelPayment(dependencies.fetchFn, origin, contact);
}

async function cancelPayment(
  fetchFn: CancellationFetch,
  origin: string,
  contact: TossRefundCancellationContact,
): Promise<TossRefundCancellationTransportResult> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<TossRefundCancellationTransportResult>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve(unknown());
    }, TOSS_REFUND_CANCELLATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      sendCancellation(fetchFn, origin, contact, controller.signal),
      timeout,
    ]);
  } catch {
    return unknown();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function sendCancellation(
  fetchFn: CancellationFetch,
  origin: string,
  contact: TossRefundCancellationContact,
  signal: AbortSignal,
): Promise<TossRefundCancellationTransportResult> {
  const response = await fetchFn(new URL(contact.wire.path, origin), {
    method: contact.wire.method,
    headers: {
      Authorization: contact.authorization,
      "Idempotency-Key": contact.wire.idempotencyKey,
      "Content-Type": contact.wire.contentType,
    },
    body: JSON.stringify(contact.wire.body),
    redirect: "error",
    signal,
  });
  if (response.status >= 400 && response.status < 500) return rejected();
  if (response.status < 200 || response.status >= 300) return unknown();
  return readSuccessfulResponse(response);
}

async function readSuccessfulResponse(
  response: Response,
): Promise<TossRefundCancellationTransportResult> {
  if (!isJsonContentType(response.headers.get("content-type"))) return unknown();
  const declaredLength = declaredResponseLength(response.headers.get("content-length"));
  if (declaredLength === null || declaredLength !== undefined
    && declaredLength > TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES) return unknown();
  const bytes = await readBoundedBody(response);
  if (!bytes) return unknown();
  try {
    return Object.freeze({
      kind: "success",
      body: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    });
  } catch {
    return unknown();
  }
}

function isJsonContentType(value: string | null): boolean {
  return Boolean(value && /^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?$/iu
    .test(value.trim()));
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
    if (length > TOSS_REFUND_CANCELLATION_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  return joinChunks(chunks, length);
}

function joinChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

const unknown = () => Object.freeze({ kind: "unknown" as const });
const rejected = () => Object.freeze({ kind: "rejected" as const });
