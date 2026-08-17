import "server-only";
import type { PrismaClient } from "@prisma/client";
import type { ProviderEnv } from "@/lib/payment/providers/credentials";
import { EximbayStatusParseError } from "@/lib/payment/providers/eximbay";
import { EXIMBAY_RAW_QUERY_MAX_BYTES } from "@/lib/payment/providers/eximbay/status";
import type { EximbayBf4Fetch } from "./bf4-contact";
import {
  processEximbayBf4Status,
  type ProcessEximbayBf4StatusResult,
} from "./bf4-engine";

export const EXIMBAY_BF4_STATUS_ROUTE_ENABLED = "EXIMBAY_BF4_STATUS_ROUTE_ENABLED";

// DESIGN_CHOICE_REQUIRES_SANDBOX_EVIDENCE: Eximbay does not currently freeze
// the callback method, carrier, media type, charset, or HTTP acknowledgement.
const RESPONSE_CONTENT_TYPE = "text/plain; charset=utf-8";
const MAX_REQUEST_CHUNKS = 256;
const CANONICAL_CONTENT_LENGTH = /^(?:0|[1-9]\d*)$/u;
const MAX_CONTENT_LENGTH_DECIMAL = String(EXIMBAY_RAW_QUERY_MAX_BYTES);

type GateState = "DISABLED" | "ENABLED" | "INVALID";

type BodyReadResult =
  | Readonly<{ kind: "ok"; exactRawBody: string }>
  | Readonly<{ kind: "rejected"; status: 400 | 413 }>;

export async function handleEximbayBf4StatusRoute(
  client: PrismaClient,
  request: Request,
  env: ProviderEnv,
  transport: EximbayBf4Fetch,
  now: () => Date = () => new Date(),
): Promise<Response> {
  try {
    return await handleRouteRequest(client, request, env, transport, now);
  } catch {
    return emptyResponse(503);
  }
}

async function handleRouteRequest(
  client: PrismaClient,
  request: Request,
  env: ProviderEnv,
  transport: EximbayBf4Fetch,
  now: () => Date,
): Promise<Response> {
  const gateFailure = gateFailureStatus(routeGate(env[EXIMBAY_BF4_STATUS_ROUTE_ENABLED]));
  if (gateFailure !== null) return emptyResponse(gateFailure);
  const metadataFailure = metadataFailureStatus(request);
  if (metadataFailure !== null) return emptyResponse(metadataFailure);

  const body = await readExactBody(request);
  if (body.kind === "rejected") return emptyResponse(body.status);

  try {
    const result = await processEximbayBf4Status(client, {
      exactRawQuery: body.exactRawBody,
      receivedAt: now(),
      modeCeiling: "SANDBOX",
      env,
      transport,
      now,
    });
    return renderEngineResult(result);
  } catch (error) {
    if (error instanceof EximbayStatusParseError) return emptyResponse(400);
    throw error;
  }
}

function routeGate(value: string | undefined): GateState {
  if (value === undefined || value === "") return "DISABLED";
  if (value === "ENABLED") return "ENABLED";
  return "INVALID";
}

function gateFailureStatus(gate: GateState): 404 | 503 | null {
  if (gate === "DISABLED") return 404;
  if (gate === "INVALID") return 503;
  return null;
}

function metadataFailureStatus(request: Request): 400 | 405 | 413 | 415 | null {
  if (request.method !== "POST") return 405;
  if (request.url.includes("?")) return 400;
  if (!admittedContentType(request.headers.get("content-type"))) return 415;
  if (!admittedContentEncoding(request.headers.get("content-encoding"))) return 415;
  if (declaredBodyTooLarge(request.headers.get("content-length"))) return 413;
  return null;
}

function admittedContentType(value: string | null): boolean {
  if (value === null) return false;
  return /^[\t ]*application\/x-www-form-urlencoded(?:[\t ]*;[\t ]*charset[\t ]*=[\t ]*utf-8)?[\t ]*$/iu
    .test(value);
}

function admittedContentEncoding(value: string | null): boolean {
  return value === null || value.trim().toLowerCase() === "identity";
}

function declaredBodyTooLarge(value: string | null): boolean {
  if (value === null || !CANONICAL_CONTENT_LENGTH.test(value)) return false;
  return value.length > MAX_CONTENT_LENGTH_DECIMAL.length
    || (value.length === MAX_CONTENT_LENGTH_DECIMAL.length && value > MAX_CONTENT_LENGTH_DECIMAL);
}

async function readExactBody(request: Request): Promise<BodyReadResult> {
  if (request.body === null) return rejectedBody(400);
  const reader = request.body.getReader();
  const retained = new Uint8Array(EXIMBAY_RAW_QUERY_MAX_BYTES);
  let chunkCount = 0;
  let retainedBytes = 0;
  try {
    while (true) {
      const next = await readWithAbort(reader, request.signal);
      if (next.kind === "aborted") {
        await cancelReader(reader);
        return rejectedBody(400);
      }
      if (next.result.done) return decodeExactBody(retained.subarray(0, retainedBytes));
      chunkCount += 1;
      const rejection = chunkRejectionStatus(
        next.result.value,
        chunkCount,
        EXIMBAY_RAW_QUERY_MAX_BYTES - retainedBytes,
      );
      if (rejection !== null) {
        await cancelReader(reader);
        return rejectedBody(rejection);
      }
      retained.set(next.result.value, retainedBytes);
      retainedBytes += next.result.value.byteLength;
    }
  } catch {
    await cancelReader(reader);
    return rejectedBody(400);
  } finally {
    reader.releaseLock();
  }
}

function chunkRejectionStatus(
  value: unknown,
  chunkCount: number,
  remainingBytes: number,
): 400 | 413 | null {
  if (chunkCount > MAX_REQUEST_CHUNKS) return 400;
  if (!(value instanceof Uint8Array)) return 400;
  if (value.byteLength > remainingBytes) return 413;
  return null;
}

type StreamReadResult =
  | Readonly<{ kind: "aborted" }>
  | Readonly<{ kind: "read"; result: ReadableStreamReadResult<Uint8Array> }>;

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<StreamReadResult> {
  if (signal.aborted) return Promise.resolve({ kind: "aborted" });
  return new Promise((resolve, reject) => {
    const cleanup = (): void => signal.removeEventListener("abort", onAbort);
    const onAbort = (): void => {
      cleanup();
      resolve({ kind: "aborted" });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => {
        cleanup();
        resolve({ kind: "read", result });
      },
      (error: unknown) => {
        cleanup();
        reject(new Error("BF4 request body read failed.", { cause: error }));
      },
    );
  });
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  await reader.cancel().catch(() => undefined);
}

function decodeExactBody(bytes: Uint8Array): BodyReadResult {
  if (bytes.byteLength === 0) return rejectedBody(400);
  try {
    const exactRawBody = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (exactRawBody.length === 0) return rejectedBody(400);
    return Object.freeze({ kind: "ok", exactRawBody });
  } catch {
    return rejectedBody(400);
  }
}

function rejectedBody(status: 400 | 413): BodyReadResult {
  return Object.freeze({ kind: "rejected", status });
}

function renderEngineResult(result: ProcessEximbayBf4StatusResult): Response {
  if (result.acknowledgement.kind !== "SUCCESS") return emptyResponse(503);
  return new Response(result.acknowledgement.body, {
    status: 200,
    headers: responseHeaders(),
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status, headers: responseHeaders() });
}

function responseHeaders(): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "Content-Type": RESPONSE_CONTENT_TYPE,
    "X-Content-Type-Options": "nosniff",
  };
}
