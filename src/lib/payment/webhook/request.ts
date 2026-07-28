import { createHash } from "crypto";
import { WebhookIngressRejectionStage } from "@prisma/client";
import type { PaymentProvider, PrismaClient } from "@prisma/client";
import type {
  AcquiredWebhookRequest,
  CompleteWebhookBodyEvidence,
} from "./pipeline-types";
import {
  WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND,
  WEBHOOK_MAX_CONTENT_LENGTH_BYTES,
  recordWebhookRejection,
} from "./rejections";

const CANONICAL_CONTENT_LENGTH = /^(?:0|[1-9]\d*)$/u;
const MAX_CONTENT_LENGTH_DECIMAL = String(WEBHOOK_MAX_CONTENT_LENGTH_BYTES);
const UTF8_DECODER = new TextDecoder();
const EMPTY_BODY = new Uint8Array();

export type ReadWebhookRequestResult =
  | { kind: "ok"; raw: AcquiredWebhookRequest }
  | { kind: "rejected"; status: number };

type DeclaredContentLength =
  | { kind: "missingOrInvalid" }
  | { kind: "withinLimit"; exactBytes: number }
  | { kind: "overLimit" };

type StreamAcquisitionResult =
  | {
    kind: "complete";
    body: string;
    evidence: CompleteWebhookBodyEvidence;
  }
  | {
    kind: "incomplete";
    code: "BODY.READ_ABORTED" | "BODY.READ_FAILED";
    rawBodyBytes: number;
    rawBodyPrefix: string;
    lastError: string;
    status: 400;
  }
  | {
    kind: "overLimit";
    code: "BODY.TOO_LARGE";
    rawBodyBytes: typeof WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND;
    rawBodyPrefix: string;
    lastError: string;
    status: 413;
  };

export async function readWebhookRequest(
  client: PrismaClient,
  provider: PaymentProvider,
  request: Request,
): Promise<ReadWebhookRequestResult> {
  const receivedAt = new Date();
  const declaredLength = contentLength(request.headers);
  if (declaredLength.kind === "overLimit") {
    await recordOversized(client, provider, request.headers, receivedAt);
    return { kind: "rejected", status: 413 };
  }

  if (request.body === null) {
    return {
      kind: "ok",
      raw: acquiredRequest(EMPTY_BODY, request.headers, receivedAt),
    };
  }

  return readStreamedBody(
    client,
    provider,
    request.body,
    request.headers,
    request.signal,
    receivedAt,
  );
}

async function readStreamedBody(
  client: PrismaClient,
  provider: PaymentProvider,
  bodyStream: ReadableStream<Uint8Array>,
  headers: Headers,
  signal: AbortSignal,
  receivedAt: Date,
): Promise<ReadWebhookRequestResult> {
  const acquisition = await acquireStreamedBody(bodyStream, signal);
  if (acquisition.kind === "complete") {
    return {
      kind: "ok",
      raw: {
        body: acquisition.body,
        headers,
        receivedAt,
        completeBodyEvidence: acquisition.evidence,
      },
    };
  }
  await recordIncomplete(client, provider, headers, acquisition, receivedAt);
  return { kind: "rejected", status: acquisition.status };
}

async function acquireStreamedBody(
  bodyStream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<StreamAcquisitionResult> {
  const reader = bodyStream.getReader();
  const retained = new Uint8Array(WEBHOOK_MAX_CONTENT_LENGTH_BYTES);
  let retainedBytes = 0;
  try {
    while (true) {
      const next = await readWithAbort(reader, signal);
      if (next.kind === "aborted") {
        const cancelled = await cancelReader(reader);
        return incompleteResult(retained, retainedBytes, retainedBytes, {
          code: "BODY.READ_ABORTED",
          lastError: cancellationAwareMessage("Webhook request body read was aborted.", cancelled),
        });
      }
      if (next.result.done) {
        const exactBytes = retained.subarray(0, retainedBytes);
        return {
          kind: "complete",
          body: UTF8_DECODER.decode(exactBytes),
          evidence: exactOriginalBodyEvidence(exactBytes),
        };
      }
      if (next.result.value.byteLength > WEBHOOK_MAX_CONTENT_LENGTH_BYTES - retainedBytes) {
        const admittedBytes = WEBHOOK_MAX_CONTENT_LENGTH_BYTES - retainedBytes;
        retained.set(next.result.value.subarray(0, admittedBytes), retainedBytes);
        retainedBytes += admittedBytes;
        const cancelled = await cancelReader(reader);
        return overLimitResult(retained, retainedBytes, {
          code: "BODY.TOO_LARGE",
          lastError: cancellationAwareMessage(
            "Webhook body exceeded configured payment ingress limit before the complete body was read; rawBodyBytes records a lower bound of at least 65,537 bytes.",
            cancelled,
          ),
        });
      }
      retained.set(next.result.value, retainedBytes);
      retainedBytes += next.result.value.byteLength;
    }
  } catch {
    const cancelled = await cancelReader(reader);
    return incompleteResult(retained, retainedBytes, retainedBytes, {
      code: "BODY.READ_FAILED",
      lastError: cancellationAwareMessage("Webhook request body could not be read.", cancelled),
    });
  } finally {
    reader.releaseLock();
  }
}

function acquiredRequest(
  bytes: Uint8Array,
  headers: Headers,
  receivedAt: Date,
): AcquiredWebhookRequest {
  return {
    body: UTF8_DECODER.decode(bytes),
    headers,
    receivedAt,
    completeBodyEvidence: exactOriginalBodyEvidence(bytes),
  };
}

function exactOriginalBodyEvidence(bytes: Uint8Array): CompleteWebhookBodyEvidence {
  return {
    kind: "complete",
    rawBodyBytes: bytes.byteLength,
    rawBodyHash: createHash("sha256").update(bytes).digest("hex"),
  };
}

function incompleteResult(
  retained: Uint8Array,
  retainedBytes: number,
  observedBytes: number,
  failure: {
    code: "BODY.READ_ABORTED" | "BODY.READ_FAILED";
    lastError: string;
  },
): Extract<StreamAcquisitionResult, { kind: "incomplete" }> {
  return {
    kind: "incomplete",
    code: failure.code,
    rawBodyBytes: observedBytes,
    rawBodyPrefix: UTF8_DECODER.decode(retained.subarray(0, retainedBytes)),
    lastError: failure.lastError,
    status: 400,
  };
}

function overLimitResult(
  retained: Uint8Array,
  retainedBytes: number,
  failure: {
    code: "BODY.TOO_LARGE";
    lastError: string;
  },
): Extract<StreamAcquisitionResult, { kind: "overLimit" }> {
  return {
    kind: "overLimit",
    code: failure.code,
    rawBodyBytes: WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND,
    rawBodyPrefix: UTF8_DECODER.decode(retained.subarray(0, retainedBytes)),
    lastError: failure.lastError,
    status: 413,
  };
}

async function recordOversized(
  client: PrismaClient,
  provider: PaymentProvider,
  headers: Headers,
  receivedAt: Date,
): Promise<void> {
  await recordWebhookRejection(client, {
    provider,
    receivedAt,
    stage: WebhookIngressRejectionStage.METADATA_EXTRACT,
    code: "BODY.TOO_LARGE",
    rawBodyBytes: WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND,
    candidateTransmissionId: headers.get("x-mira-transmission-id") ?? undefined,
    candidateEventType: headers.get("x-mira-event-type") ?? undefined,
    lastError: "Webhook Content-Length exceeded configured payment ingress limit; rawBodyBytes records a lower bound of at least 65,537 bytes.",
  });
}

function contentLength(headers: Headers): DeclaredContentLength {
  const value = headers.get("content-length");
  if (value === null || !CANONICAL_CONTENT_LENGTH.test(value)) {
    return { kind: "missingOrInvalid" };
  }
  if (
    value.length > MAX_CONTENT_LENGTH_DECIMAL.length
    || (
      value.length === MAX_CONTENT_LENGTH_DECIMAL.length
      && value > MAX_CONTENT_LENGTH_DECIMAL
    )
  ) {
    return { kind: "overLimit" };
  }
  return { kind: "withinLimit", exactBytes: Number(value) };
}

type ReadWithAbortResult =
  | { kind: "aborted" }
  | { kind: "read"; result: ReadableStreamReadResult<Uint8Array> };

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadWithAbortResult> {
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
        reject(new Error("Webhook request stream read failed.", { cause: error }));
      },
    );
  });
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<boolean> {
  try {
    await reader.cancel();
    return true;
  } catch {
    return false;
  }
}

async function recordIncomplete(
  client: PrismaClient,
  provider: PaymentProvider,
  headers: Headers,
  acquisition: Exclude<StreamAcquisitionResult, { kind: "complete" }>,
  receivedAt: Date,
): Promise<void> {
  await recordWebhookRejection(client, {
    provider,
    receivedAt,
    stage: WebhookIngressRejectionStage.METADATA_EXTRACT,
    code: acquisition.code,
    rawBodyBytes: acquisition.rawBodyBytes,
    rawBodyPrefix: acquisition.rawBodyPrefix,
    candidateTransmissionId: headers.get("x-mira-transmission-id") ?? undefined,
    candidateEventType: headers.get("x-mira-event-type") ?? undefined,
    lastError: acquisition.lastError,
  });
}

function cancellationAwareMessage(message: string, cancelled: boolean): string {
  return cancelled ? message : `${message} Stream cancellation also failed.`;
}
