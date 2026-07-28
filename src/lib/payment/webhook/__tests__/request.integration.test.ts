import { createHash, randomUUID } from "crypto";
import { PaymentProvider } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { readWebhookRequest } from "../request";
import {
  WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND,
  WEBHOOK_MAX_CONTENT_LENGTH_BYTES,
  WEBHOOK_RAW_PREFIX_CHARS,
} from "../rejections";

const ENCODER = new TextEncoder();
const MALFORMED_UTF8_CASES = [
  {
    label: "invalid continuation",
    chunks: [Uint8Array.of(0xC3, 0x28)],
    decoded: "\uFFFD(",
  },
  {
    label: "lone continuation byte",
    chunks: [Uint8Array.of(0x80)],
    decoded: "\uFFFD",
  },
  {
    label: "truncated multi-byte sequence",
    chunks: [Uint8Array.of(0xE2, 0x82)],
    decoded: "\uFFFD",
  },
  {
    label: "invalid leading byte",
    chunks: [Uint8Array.of(0xFF)],
    decoded: "\uFFFD",
  },
  {
    label: "malformed sequence crossing chunks",
    chunks: [Uint8Array.of(0xF0, 0x9F), Uint8Array.of(0x28)],
    decoded: "\uFFFD(",
  },
] as const;

interface StreamProbe {
  pullCount: number;
  cancelCount: number;
  pullsAfterCancellation: number;
  producedBytes: number;
  cancelled: boolean;
}

interface StreamRequest {
  request: Request;
  probe: StreamProbe;
}

interface StreamOptions {
  contentLength?: string;
  closeAfterLastChunk?: boolean;
  errorAtPull?: number;
  cancellationRejects?: boolean;
  signal?: AbortSignal;
}

const rejectionCandidates: string[] = [];

describe("bounded webhook request acquisition", () => {
  afterEach(async () => {
    await db.webhookIngressRejection.deleteMany({
      where: { candidateTransmissionId: { in: rejectionCandidates } },
    });
    rejectionCandidates.length = 0;
  });

  it.each([
    "65537",
    "2147483647",
    "2147483648",
    "9007199254740991",
    "9007199254740992",
    "9".repeat(512),
  ])(
    "classifies canonical declared oversize %s without pulling or retaining its exact value",
    async (contentLength) => {
      const candidate = nextCandidate();
      const streamed = streamRequest([ENCODER.encode("must-not-be-read")], {
        contentLength,
      }, candidate);

      const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

      expect(result).toEqual({ kind: "rejected", status: 413 });
      expect(streamed.probe).toMatchObject({
        pullCount: 0,
        cancelCount: 0,
        producedBytes: 0,
      });
      expect(streamed.request.body?.locked).toBe(false);
      const rejection = await onlyRejection(candidate);
      expect(rejection.code).toBe("BODY.TOO_LARGE");
      expect(rejection.rawBodyBytes).toBe(WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND);
      expect(rejection.rawBodyHash).toBeNull();
      expect(rejection.rawBodyPrefix).toBeNull();
      expect(rejection.lastError).toContain("at least 65,537 bytes");
    },
  );

  it("admits exactly 65,536 streamed bytes without an upstream pull after the final chunk", async () => {
    const candidate = nextCandidate();
    const body = exactLimitJson();
    const chunks = splitBytes(body, [7, 12_345, 41_000]);
    const streamed = streamRequest(chunks, {
      closeAfterLastChunk: true,
      contentLength: String(WEBHOOK_MAX_CONTENT_LENGTH_BYTES),
    }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    if (result.kind !== "ok") throw new Error("Expected exactly-limit body to be admitted.");
    expect(ENCODER.encode(result.raw.body)).toEqual(body);
    expect(result.raw.completeBodyEvidence).toEqual({
      kind: "complete",
      rawBodyBytes: body.byteLength,
      rawBodyHash: independentByteHash(body),
    });
    expect(JSON.parse(result.raw.body)).toHaveProperty("f");
    expect(streamed.probe.pullCount).toBe(chunks.length);
    expect(streamed.probe.cancelCount).toBe(0);
    expect(streamed.probe.producedBytes).toBe(WEBHOOK_MAX_CONTENT_LENGTH_BYTES);
    expect(streamed.request.body?.locked).toBe(false);
  });

  it.each([
    ["0", ""],
    ["1", "x"],
  ])("admits canonical declared length %s as an exact within-limit value", async (contentLength, body) => {
    const candidate = nextCandidate();
    const streamed = streamRequest(
      body.length === 0 ? [] : [ENCODER.encode(body)],
      { closeAfterLastChunk: true, contentLength },
      candidate,
    );

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    if (result.kind !== "ok") throw new Error("Expected within-limit declared body to be admitted.");
    expect(result.raw.body).toBe(body);
    const originalBytes = ENCODER.encode(body);
    expect(result.raw.completeBodyEvidence).toEqual({
      kind: "complete",
      rawBodyBytes: originalBytes.byteLength,
      rawBodyHash: independentByteHash(originalBytes),
    });
    expect(streamed.probe.cancelCount).toBe(0);
  });

  it("cancels at 65,537 streamed bytes and records only a bounded incomplete diagnostic", async () => {
    const candidate = nextCandidate();
    const chunks = [
      asciiBytes(WEBHOOK_MAX_CONTENT_LENGTH_BYTES - 17),
      asciiBytes(18),
      ENCODER.encode("must-not-be-pulled"),
    ];
    const streamed = streamRequest(chunks, {}, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result).toEqual({ kind: "rejected", status: 413 });
    expect(streamed.probe).toMatchObject({
      pullCount: 2,
      cancelCount: 1,
      pullsAfterCancellation: 0,
      producedBytes: WEBHOOK_MAX_CONTENT_LENGTH_BYTES + 1,
      cancelled: true,
    });
    expect(streamed.request.body?.locked).toBe(false);
    const rejection = await onlyRejection(candidate);
    expect(rejection.rawBodyBytes).toBe(WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND);
    expect(rejection.rawBodyHash).toBeNull();
    expect(rejection.rawBodyPrefix).toBe("a".repeat(WEBHOOK_RAW_PREFIX_CHARS));
    expect(rejection.lastError).toContain("lower bound");
  });

  it.each([
    "65537junk",
    "65536.9",
    "+65537",
    "-1",
    "01",
    "NaN",
    "Infinity",
    "65 537",
  ])("treats invalid Content-Length %j as untrusted and still enforces streamed bytes", async (contentLength) => {
    const candidate = nextCandidate();
    const streamed = streamRequest([
      asciiBytes(WEBHOOK_MAX_CONTENT_LENGTH_BYTES),
      asciiBytes(1),
    ], { contentLength }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result).toEqual({ kind: "rejected", status: 413 });
    expect(streamed.probe.pullCount).toBe(2);
    expect(streamed.probe.cancelCount).toBe(1);
    expect(streamed.probe.producedBytes).toBe(WEBHOOK_MAX_CONTENT_LENGTH_BYTES + 1);
  });

  it("lets the actual streamed limit override a valid under-limit declaration", async () => {
    const candidate = nextCandidate();
    const streamed = streamRequest([
      asciiBytes(32_768),
      asciiBytes(32_769),
    ], { contentLength: "100" }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result).toEqual({ kind: "rejected", status: 413 });
    expect(streamed.probe.pullCount).toBe(2);
    expect(streamed.probe.cancelCount).toBe(1);
    expect(streamed.probe.producedBytes).toBe(WEBHOOK_MAX_CONTENT_LENGTH_BYTES + 1);
  });

  it("does not concatenate or request beyond one materially oversized upstream chunk", async () => {
    const candidate = nextCandidate();
    const oversizedChunk = asciiBytes(WEBHOOK_MAX_CONTENT_LENGTH_BYTES * 4);
    oversizedChunk[0] = 0;
    const streamed = streamRequest([
      oversizedChunk,
      ENCODER.encode("must-not-be-pulled"),
    ], {}, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result).toEqual({ kind: "rejected", status: 413 });
    expect(streamed.probe).toMatchObject({
      pullCount: 1,
      cancelCount: 1,
      pullsAfterCancellation: 0,
      producedBytes: oversizedChunk.byteLength,
    });
    const rejection = await onlyRejection(candidate);
    expect(rejection.rawBodyBytes).toBe(WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND);
    expect(rejection.rawBodyHash).toBeNull();
    expect(rejection.rawBodyPrefix).toHaveLength(WEBHOOK_RAW_PREFIX_CHARS);
    expect(rejection.rawBodyPrefix).not.toHaveLength(oversizedChunk.byteLength);
    expect(rejection.rawBodyPrefix).not.toContain("\u0000");
    expect(rejection.rawBodyPrefix?.startsWith("\uFFFD")).toBe(true);
  });

  it("reconstructs UTF-8 when Korean and emoji code points cross stream chunk boundaries", async () => {
    const candidate = nextCandidate();
    const body = "시작-가🙂-끝";
    const encoded = ENCODER.encode(body);
    const streamed = streamRequest(splitBytes(encoded, [1, 2, 6, 8, 11]), {
      closeAfterLastChunk: true,
    }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    if (result.kind !== "ok") throw new Error("Expected bounded UTF-8 body to be admitted.");
    expect(result.raw.body).toBe(body);
    expect(result.raw.completeBodyEvidence).toEqual({
      kind: "complete",
      rawBodyBytes: encoded.byteLength,
      rawBodyHash: independentByteHash(encoded),
    });
    expect(streamed.probe.producedBytes).toBe(encoded.byteLength);
  });

  it.each([
    ["exact limit", 0, "ok"],
    ["one byte over", 1, "rejected"],
  ] as const)("uses UTF-8 bytes for a multibyte %s body", async (_label, extraBytes, expectedKind) => {
    const candidate = nextCandidate();
    const body = exactMultibyteBody(extraBytes);
    const encoded = ENCODER.encode(body);
    const streamed = streamRequest(splitBytes(encoded, [16_383, 32_769, 65_536]), {
      closeAfterLastChunk: extraBytes === 0,
    }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result.kind).toBe(expectedKind);
    expect(encoded.byteLength).toBe(WEBHOOK_MAX_CONTENT_LENGTH_BYTES + extraBytes);
    if (extraBytes === 0) {
      if (result.kind !== "ok") throw new Error("Expected exact multibyte body to be admitted.");
      expect(result.raw.body).toBe(body);
      expect(streamed.probe.cancelCount).toBe(0);
      return;
    }
    expect(streamed.probe.cancelCount).toBe(1);
    expect(streamed.probe.pullsAfterCancellation).toBe(0);
  });

  it.each(MALFORMED_UTF8_CASES)(
    "preserves exact original-byte evidence for complete $label input",
    async ({ chunks, decoded }) => {
      const candidate = nextCandidate();
      const originalBytes = concatenateBytes(chunks);
      const streamed = streamRequest(chunks, { closeAfterLastChunk: true }, candidate);

      const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

      if (result.kind !== "ok") throw new Error("Expected bounded malformed UTF-8 to be decoded.");
      expect(result.raw.body).toBe(decoded);
      expect(result.raw.completeBodyEvidence).toEqual({
        kind: "complete",
        rawBodyBytes: originalBytes.byteLength,
        rawBodyHash: independentByteHash(originalBytes),
      });
    },
  );

  it.each([
    ["before bytes", 1, 0],
    ["after a partial prefix", 2, 7],
  ] as const)("fails closed when the stream read throws %s", async (_label, errorAtPull, expectedBytes) => {
    const candidate = nextCandidate();
    const streamed = streamRequest([ENCODER.encode("partial")], { errorAtPull }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result).toEqual({ kind: "rejected", status: 400 });
    expect(streamed.request.body?.locked).toBe(false);
    const rejection = await onlyRejection(candidate);
    expect(rejection.code).toBe("BODY.READ_FAILED");
    expect(rejection.rawBodyBytes).toBe(expectedBytes);
    expect(rejection.rawBodyHash).toBeNull();
  });

  it("records a PostgreSQL-safe exact observed prefix when reading fails below the limit", async () => {
    const candidate = nextCandidate();
    const streamed = streamRequest([
      Uint8Array.of(0, ..."partial".split("").map((value) => value.charCodeAt(0))),
    ], { errorAtPull: 2 }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result).toEqual({ kind: "rejected", status: 400 });
    const rejection = await onlyRejection(candidate);
    expect(rejection.code).toBe("BODY.READ_FAILED");
    expect(rejection.rawBodyBytes).toBe(8);
    expect(rejection.rawBodyHash).toBeNull();
    expect(rejection.rawBodyPrefix).toBe("\uFFFDpartial");
    expect(rejection.rawBodyPrefix).not.toContain("\u0000");
  });

  it("aborts and cancels a body stream that has not closed without inventing a timeout", async () => {
    const candidate = nextCandidate();
    const controller = new AbortController();
    const stalled = stallingRequest(controller.signal, candidate);
    const pending = readWebhookRequest(db, PaymentProvider.TOSS, stalled.request);
    await stalled.pullStarted;

    controller.abort();
    const result = await pending;

    expect(result).toEqual({ kind: "rejected", status: 400 });
    expect(stalled.probe).toMatchObject({
      pullCount: 1,
      cancelCount: 1,
      pullsAfterCancellation: 0,
    });
    expect(stalled.request.body?.locked).toBe(false);
    const rejection = await onlyRejection(candidate);
    expect(rejection.code).toBe("BODY.READ_ABORTED");
    expect(rejection.rawBodyBytes).toBe(0);
    expect(rejection.rawBodyHash).toBeNull();
  });

  it("keeps an overflow rejection terminal when reader cancellation rejects", async () => {
    const candidate = nextCandidate();
    const streamed = streamRequest([
      asciiBytes(WEBHOOK_MAX_CONTENT_LENGTH_BYTES + 1),
    ], { cancellationRejects: true }, candidate);

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, streamed.request);

    expect(result).toEqual({ kind: "rejected", status: 413 });
    expect(streamed.probe.cancelCount).toBe(1);
    expect(streamed.request.body?.locked).toBe(false);
    const rejection = await onlyRejection(candidate);
    expect(rejection.lastError).toContain("cancellation also failed");
  });

  it("attempts one overflow diagnostic when persistence fails and does not relabel it", async () => {
    const candidate = nextCandidate();
    const streamed = streamRequest([
      asciiBytes(WEBHOOK_MAX_CONTENT_LENGTH_BYTES + 1),
    ], {}, candidate);
    const createSpy = vi.spyOn(db.webhookIngressRejection, "create")
      .mockRejectedValue(new Error("diagnostic insert sentinel"));

    try {
      await expect(readWebhookRequest(db, PaymentProvider.TOSS, streamed.request))
        .rejects.toThrow("diagnostic insert sentinel");
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.calls[0]?.[0].data).toMatchObject({
        code: "BODY.TOO_LARGE",
        rawBodyBytes: WEBHOOK_BODY_OVER_LIMIT_LOWER_BOUND,
        rawBodyHash: null,
      });
    } finally {
      createSpy.mockRestore();
    }
  });

  it("attempts one read-failure diagnostic when persistence fails", async () => {
    const candidate = nextCandidate();
    const streamed = streamRequest([
      ENCODER.encode("partial"),
    ], { errorAtPull: 2 }, candidate);
    const createSpy = vi.spyOn(db.webhookIngressRejection, "create")
      .mockRejectedValue(new Error("diagnostic insert sentinel"));

    try {
      await expect(readWebhookRequest(db, PaymentProvider.TOSS, streamed.request))
        .rejects.toThrow("diagnostic insert sentinel");
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(createSpy.mock.calls[0]?.[0].data).toMatchObject({
        code: "BODY.READ_FAILED",
        rawBodyBytes: 7,
        rawBodyHash: null,
      });
    } finally {
      createSpy.mockRestore();
    }
  });

  it("preserves an empty absent request body", async () => {
    const candidate = nextCandidate();
    const request = new Request("http://localhost/api/payments/toss/webhook", {
      method: "POST",
      headers: candidateHeaders(candidate),
    });

    const result = await readWebhookRequest(db, PaymentProvider.TOSS, request);

    if (result.kind !== "ok") throw new Error("Expected absent body to be admitted.");
    expect(result.raw.body).toBe("");
    expect(result.raw.completeBodyEvidence).toEqual({
      kind: "complete",
      rawBodyBytes: 0,
      rawBodyHash: independentByteHash(new Uint8Array()),
    });
  });
});

function streamRequest(
  chunks: readonly Uint8Array[],
  options: StreamOptions,
  candidate: string,
): StreamRequest {
  const probe = newProbe();
  let chunkIndex = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      probe.pullCount += 1;
      if (probe.cancelled) {
        probe.pullsAfterCancellation += 1;
        return;
      }
      if (options.errorAtPull === probe.pullCount) {
        controller.error(new Error("stream read sentinel"));
        return;
      }
      const chunk = chunks[chunkIndex];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      chunkIndex += 1;
      probe.producedBytes += chunk.byteLength;
      controller.enqueue(chunk);
      if (options.closeAfterLastChunk && chunkIndex === chunks.length) controller.close();
    },
    cancel() {
      probe.cancelled = true;
      probe.cancelCount += 1;
      if (options.cancellationRejects) return Promise.reject(new Error("cancel sentinel"));
    },
  }, { highWaterMark: 0 });
  return {
    request: requestWithStream(body, candidateHeaders(candidate, options.contentLength), options.signal),
    probe,
  };
}

function stallingRequest(
  signal: AbortSignal,
  candidate: string,
): StreamRequest & { pullStarted: Promise<void> } {
  const probe = newProbe();
  let markPullStarted: (() => void) | undefined;
  const pullStarted = new Promise<void>((resolve) => {
    markPullStarted = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    pull() {
      probe.pullCount += 1;
      markPullStarted?.();
      return new Promise<void>(() => undefined);
    },
    cancel() {
      probe.cancelled = true;
      probe.cancelCount += 1;
    },
  }, { highWaterMark: 0 });
  return {
    request: requestWithStream(body, candidateHeaders(candidate), signal),
    probe,
    pullStarted,
  };
}

function requestWithStream(
  body: ReadableStream<Uint8Array>,
  headers: Headers,
  signal?: AbortSignal,
): Request {
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers,
    body,
    duplex: "half",
    signal,
  };
  return new Request("http://localhost/api/payments/toss/webhook", init);
}

function candidateHeaders(candidate: string, contentLength?: string): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    "x-mira-event-type": "PAYMENT_STATUS_CHANGED",
    "x-mira-transmission-id": candidate,
  });
  if (contentLength !== undefined) headers.set("content-length", contentLength);
  return headers;
}

function newProbe(): StreamProbe {
  return {
    pullCount: 0,
    cancelCount: 0,
    pullsAfterCancellation: 0,
    producedBytes: 0,
    cancelled: false,
  };
}

function splitBytes(bytes: Uint8Array, boundaries: readonly number[]): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let start = 0;
  for (const boundary of boundaries) {
    if (boundary <= start || boundary >= bytes.byteLength) continue;
    chunks.push(bytes.subarray(start, boundary));
    start = boundary;
  }
  chunks.push(bytes.subarray(start));
  return chunks;
}

function concatenateBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const combined = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function independentByteHash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactLimitJson(): Uint8Array {
  const shellBytes = ENCODER.encode('{"f":""}').byteLength;
  const body = `{"f":"${"x".repeat(WEBHOOK_MAX_CONTENT_LENGTH_BYTES - shellBytes)}"}`;
  const encoded = ENCODER.encode(body);
  if (encoded.byteLength !== WEBHOOK_MAX_CONTENT_LENGTH_BYTES) {
    throw new Error("Exact-limit JSON fixture has the wrong byte length.");
  }
  return encoded;
}

function exactMultibyteBody(extraBytes: number): string {
  const unit = "가🙂";
  const unitBytes = ENCODER.encode(unit).byteLength;
  const targetBytes = WEBHOOK_MAX_CONTENT_LENGTH_BYTES + extraBytes;
  const repeated = unit.repeat(Math.floor(targetBytes / unitBytes));
  return `${repeated}${"x".repeat(targetBytes % unitBytes)}`;
}

function asciiBytes(length: number): Uint8Array {
  return new Uint8Array(length).fill("a".charCodeAt(0));
}

function nextCandidate(): string {
  const candidate = `request_reader_${randomUUID()}`;
  rejectionCandidates.push(candidate);
  return candidate;
}

async function onlyRejection(candidateTransmissionId: string) {
  const rows = await db.webhookIngressRejection.findMany({
    where: { candidateTransmissionId },
    orderBy: { createdAt: "asc" },
  });
  expect(rows).toHaveLength(1);
  const row = rows[0];
  if (!row) throw new Error("Expected one webhook ingress rejection.");
  return row;
}
