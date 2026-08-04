import type { StrandAsset } from "./strand-asset";
import {
  STRAND_BUNDLE_BINARY_MAX_BYTES,
  STRAND_BUNDLE_MANIFEST_MAX_BYTES,
  decodeCanonicalStrandBundleManifest,
  decodeStrandBundleBinary,
  strandBundleBinaryByteLength,
} from "./strand-bundle";

const MANIFEST_URL = "/admin/render-lab/strand-bundle/manifest.json";
const BINARY_URL = "/admin/render-lab/strand-bundle/strands.bin";
const MANIFEST_CONTENT_TYPE = "application/json; charset=utf-8";
const BINARY_CONTENT_TYPE = "application/octet-stream";
const CANONICAL_LENGTH_PATTERN = /^[1-9][0-9]*$/;

export interface LoadedStrandBundle {
  readonly asset: StrandAsset;
  readonly assetId: string;
  readonly assetVersion: string;
  readonly verifiedDigest: string;
}

export class StrandBundleAbortError extends Error {
  constructor() {
    super("Strand bundle load was aborted.");
    this.name = "StrandBundleAbortError";
  }
}

export class StrandBundleLoadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StrandBundleLoadError";
  }
}

export function isStrandBundleAbortError(error: unknown): error is StrandBundleAbortError {
  return error instanceof StrandBundleAbortError;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new StrandBundleAbortError();
}

function normalizeLoadError(error: unknown): StrandBundleLoadError {
  if (error instanceof StrandBundleLoadError) return error;
  if (error instanceof Error) {
    return new StrandBundleLoadError(error.message, { cause: error });
  }
  return new StrandBundleLoadError("The strand bundle load failed.", { cause: error });
}

function readContentLength(
  response: Response,
  maximumBytes: number,
  expectedBytes?: number,
): number | null {
  const header = response.headers.get("content-length");
  if (header === null) return null;
  if (!CANONICAL_LENGTH_PATTERN.test(header)) {
    throw new StrandBundleLoadError("Content-Length is not a canonical positive integer.");
  }
  const length = Number(header);
  if (!Number.isSafeInteger(length) || length > maximumBytes) {
    throw new StrandBundleLoadError("Content-Length exceeds the bounded diagnostic limit.");
  }
  if (expectedBytes !== undefined && length !== expectedBytes) {
    throw new StrandBundleLoadError("Content-Length does not match the declared bundle length.");
  }
  return length;
}

async function cancelAfterFailure(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  failure: unknown,
): Promise<never> {
  try {
    await reader.cancel(failure);
  } catch (cancelError) {
    throw new AggregateError(
      [normalizeLoadError(failure), normalizeLoadError(cancelError)],
      "Strand bundle stream failure and cancellation both failed.",
      { cause: cancelError },
    );
  }
  throw normalizeLoadError(failure);
}

interface ValidatedResponseBody {
  readonly body: ReadableStream<Uint8Array>;
  readonly declaredLength: number | null;
}

function validateResponseBody(
  response: Response,
  expectedContentType: string,
  maximumBytes: number,
  expectedBytes?: number,
): ValidatedResponseBody {
  if (response.redirected) throw new StrandBundleLoadError("Redirected bundle responses are rejected.");
  if (response.status !== 200) {
    throw new StrandBundleLoadError(`Bundle response returned HTTP ${response.status}.`);
  }
  if (response.headers.get("content-type") !== expectedContentType) {
    throw new StrandBundleLoadError("Bundle response Content-Type is not canonical.");
  }
  const declaredLength = readContentLength(response, maximumBytes, expectedBytes);
  if (response.body === null) throw new StrandBundleLoadError("Bundle response body is unavailable.");
  return { body: response.body, declaredLength };
}

interface StreamedBytes {
  readonly chunks: readonly Uint8Array[];
  readonly totalLength: number;
}

async function readStreamedBytes(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  maximumBytes: number,
  expectedBytes?: number,
): Promise<StreamedBytes> {
  throwIfAborted(signal);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  const abortFailure = new StrandBundleAbortError();
  const abortState: { cancellation: Promise<void> } = {
    cancellation: Promise.resolve(),
  };
  const cancelOnAbort = (): void => {
    try {
      abortState.cancellation = reader.cancel(abortFailure).catch(() => undefined);
    } catch {
      abortState.cancellation = Promise.resolve();
    }
  };
  signal.addEventListener("abort", cancelOnAbort, { once: true });
  try {
    while (true) {
      const result = await reader.read();
      if (signal.aborted) throw abortFailure;
      if (result.done) break;
      totalLength += result.value.byteLength;
      if (totalLength > maximumBytes || (expectedBytes !== undefined && totalLength > expectedBytes)) {
        throw new StrandBundleLoadError("Bundle response exceeded its bounded byte length.");
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (signal.aborted) {
      await abortState.cancellation;
      throw new StrandBundleAbortError();
    }
    return cancelAfterFailure(reader, error);
  } finally {
    signal.removeEventListener("abort", cancelOnAbort);
  }
  return { chunks, totalLength };
}

function requireActualLength(
  streamed: StreamedBytes,
  declaredLength: number | null,
  expectedBytes?: number,
): void {
  if (declaredLength !== null && streamed.totalLength !== declaredLength) {
    throw new StrandBundleLoadError("Actual body length does not match Content-Length.");
  }
  if (expectedBytes !== undefined && streamed.totalLength !== expectedBytes) {
    throw new StrandBundleLoadError("Actual body length does not match the declared bundle length.");
  }
}

function joinChunks(streamed: StreamedBytes): Uint8Array {
  const bytes = new Uint8Array(streamed.totalLength);
  let offset = 0;
  for (const chunk of streamed.chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readBoundedBody(
  response: Response,
  signal: AbortSignal,
  expectedContentType: string,
  maximumBytes: number,
  expectedBytes?: number,
): Promise<Uint8Array> {
  const validated = validateResponseBody(
    response,
    expectedContentType,
    maximumBytes,
    expectedBytes,
  );
  const streamed = await readStreamedBytes(
    validated.body,
    signal,
    maximumBytes,
    expectedBytes,
  );
  requireActualLength(streamed, validated.declaredLength, expectedBytes);
  return joinChunks(streamed);
}

async function fetchBundleResponse(
  fetcher: typeof fetch,
  url: string,
  signal: AbortSignal,
): Promise<Response> {
  throwIfAborted(signal);
  return fetcher(url, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-cache",
    redirect: "error",
    signal,
  });
}

function digestHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes);
  return digestHex(await globalThis.crypto.subtle.digest("SHA-256", digestInput));
}

export async function loadDiagnosticStrandBundle(
  signal: AbortSignal,
  fetcher: typeof fetch = globalThis.fetch,
): Promise<LoadedStrandBundle> {
  try {
    const manifestResponse = await fetchBundleResponse(fetcher, MANIFEST_URL, signal);
    const manifestBytes = await readBoundedBody(
      manifestResponse,
      signal,
      MANIFEST_CONTENT_TYPE,
      STRAND_BUNDLE_MANIFEST_MAX_BYTES,
    );
    throwIfAborted(signal);
    const manifest = decodeCanonicalStrandBundleManifest(manifestBytes);
    if (manifest.buffer.uri !== "strands.bin") {
      throw new StrandBundleLoadError("Manifest binary URI is not allowlisted.");
    }
    const formulaLength = strandBundleBinaryByteLength(
      manifest.strandCount,
      manifest.controlPointCount,
    );
    if (manifest.buffer.byteLength !== formulaLength) {
      throw new StrandBundleLoadError("Manifest binary length does not match the schema-v1 formula.");
    }

    throwIfAborted(signal);
    const binaryResponse = await fetchBundleResponse(fetcher, BINARY_URL, signal);
    const binaryBytes = await readBoundedBody(
      binaryResponse,
      signal,
      BINARY_CONTENT_TYPE,
      STRAND_BUNDLE_BINARY_MAX_BYTES,
      manifest.buffer.byteLength,
    );
    throwIfAborted(signal);
    const verifiedDigest = await sha256(binaryBytes);
    throwIfAborted(signal);
    if (verifiedDigest !== manifest.buffer.sha256) {
      throw new StrandBundleLoadError("Strand bundle SHA-256 digest mismatch.");
    }
    const asset = decodeStrandBundleBinary(manifest, binaryBytes);
    return {
      asset,
      assetId: manifest.assetId,
      assetVersion: manifest.assetVersion,
      verifiedDigest,
    };
  } catch (error) {
    if (signal.aborted || isStrandBundleAbortError(error)) throw new StrandBundleAbortError();
    throw normalizeLoadError(error);
  }
}
