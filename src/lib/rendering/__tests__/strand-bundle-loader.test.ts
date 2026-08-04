import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  StrandBundleAbortError,
  StrandBundleLoadError,
  loadDiagnosticStrandBundle,
} from "../strand-bundle-loader";

const FIXTURE_DIRECTORY = resolve(
  process.cwd(),
  "src/lib/rendering/fixtures/r2-diagnostic-v1",
);
const manifestBytes = new Uint8Array(readFileSync(resolve(FIXTURE_DIRECTORY, "manifest.json")));
const binaryBytes = new Uint8Array(readFileSync(resolve(FIXTURE_DIRECTORY, "strands.bin")));

interface ResponseOptions {
  readonly contentLength?: string | null;
  readonly chunks?: readonly Uint8Array[];
  readonly onCancel?: () => void;
  readonly status?: number;
  readonly redirected?: boolean;
  readonly nullBody?: boolean;
}

function streamedResponse(
  bytes: Uint8Array,
  contentType: string,
  options: ResponseOptions = {},
): Response {
  const chunks = options.chunks ?? [bytes.slice(0, Math.floor(bytes.length / 2)), bytes.slice(Math.floor(bytes.length / 2))];
  let index = 0;
  const body = options.nullBody
    ? null
    : new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks[index];
          index += 1;
          if (chunk === undefined) controller.close();
          else controller.enqueue(chunk);
        },
        cancel() {
          options.onCancel?.();
        },
      });
  const headers = new Headers({ "content-type": contentType });
  if (options.contentLength !== null) {
    headers.set("content-length", options.contentLength ?? String(bytes.byteLength));
  }
  const response = new Response(body, { status: options.status ?? 200, headers });
  if (options.redirected === true) {
    Object.defineProperty(response, "redirected", { value: true });
  }
  return response;
}

function validFetcher(options: {
  readonly manifest?: Response;
  readonly binary?: Response;
} = {}): typeof fetch {
  return vi.fn<typeof fetch>()
    .mockResolvedValueOnce(
      options.manifest ?? streamedResponse(manifestBytes, "application/json; charset=utf-8"),
    )
    .mockResolvedValueOnce(
      options.binary ?? streamedResponse(binaryBytes, "application/octet-stream"),
    );
}

describe("bounded strand bundle loader", () => {
  it("loads valid streamed responses with canonical fetch policy and returns only validated authority", async () => {
    const controller = new AbortController();
    const fetcher = validFetcher();
    const loaded = await loadDiagnosticStrandBundle(controller.signal, fetcher);

    expect(loaded.asset.strands).toHaveLength(72);
    expect(loaded.assetId).toBe("render-lab.r2-diagnostic");
    expect(loaded.assetVersion).toBe("1");
    expect(loaded.verifiedDigest).toBe(
      "15d308949b1cbfc3f4896b5d7ebd72b53df2ed45ec16f3ac141d8ff009676572",
    );
    expect(Object.keys(loaded).sort()).toEqual([
      "asset",
      "assetId",
      "assetVersion",
      "verifiedDigest",
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/admin/render-lab/strand-bundle/manifest.json",
      {
        method: "GET",
        credentials: "same-origin",
        cache: "no-cache",
        redirect: "error",
        signal: controller.signal,
      },
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "/admin/render-lab/strand-bundle/strands.bin",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("accepts absent or exact Content-Length and rejects malformed, over-limit, or mismatched values", async () => {
    await expect(
      loadDiagnosticStrandBundle(
        new AbortController().signal,
        validFetcher({
          manifest: streamedResponse(manifestBytes, "application/json; charset=utf-8", {
            contentLength: null,
          }),
          binary: streamedResponse(binaryBytes, "application/octet-stream", {
            contentLength: null,
          }),
        }),
      ),
    ).resolves.toMatchObject({ assetId: "render-lab.r2-diagnostic" });

    for (const contentLength of ["02017", "8193", "not-a-number"]) {
      await expect(
        loadDiagnosticStrandBundle(
          new AbortController().signal,
          validFetcher({
            manifest: streamedResponse(manifestBytes, "application/json; charset=utf-8", {
              contentLength,
            }),
          }),
        ),
      ).rejects.toBeInstanceOf(StrandBundleLoadError);
    }
    await expect(
      loadDiagnosticStrandBundle(
        new AbortController().signal,
        validFetcher({
          binary: streamedResponse(binaryBytes, "application/octet-stream", {
            contentLength: String(binaryBytes.byteLength - 1),
          }),
        }),
      ),
    ).rejects.toThrow(/Content-Length/);
  });

  it("enforces actual streamed caps and cancels an overflowing reader", async () => {
    let cancelCount = 0;
    const overflow = new Uint8Array(8_193);
    let delivered = false;
    const overflowBody = new ReadableStream<Uint8Array>({
      pull(target) {
        if (delivered) return;
        delivered = true;
        target.enqueue(overflow);
      },
      cancel() {
        cancelCount += 1;
      },
    });
    await expect(
      loadDiagnosticStrandBundle(
        new AbortController().signal,
        validFetcher({
          manifest: new Response(overflowBody, {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          }),
        }),
      ),
    ).rejects.toThrow(/exceeded/);
    expect(cancelCount).toBe(1);
  });

  it.each([
    ["status", streamedResponse(manifestBytes, "application/json; charset=utf-8", { status: 401 })],
    ["redirect", streamedResponse(manifestBytes, "application/json; charset=utf-8", { redirected: true })],
    ["content type", streamedResponse(manifestBytes, "application/json")],
    ["null body", streamedResponse(manifestBytes, "application/json; charset=utf-8", { nullBody: true })],
  ])("rejects a noncanonical manifest %s response", async (_label, response) => {
    await expect(
      loadDiagnosticStrandBundle(
        new AbortController().signal,
        validFetcher({ manifest: response }),
      ),
    ).rejects.toBeInstanceOf(StrandBundleLoadError);
  });

  it("rejects binary corruption, exact-length mismatch, and noncanonical binary content type", async () => {
    const corrupt = new Uint8Array(binaryBytes);
    corrupt[0] = (corrupt[0] ?? 0) ^ 1;
    await expect(
      loadDiagnosticStrandBundle(
        new AbortController().signal,
        validFetcher({
          binary: streamedResponse(corrupt, "application/octet-stream"),
        }),
      ),
    ).rejects.toThrow(/digest mismatch/);

    await expect(
      loadDiagnosticStrandBundle(
        new AbortController().signal,
        validFetcher({
          binary: streamedResponse(binaryBytes.slice(0, -1), "application/octet-stream", {
            contentLength: null,
          }),
        }),
      ),
    ).rejects.toThrow(/declared bundle length|bounded byte length/);

    await expect(
      loadDiagnosticStrandBundle(
        new AbortController().signal,
        validFetcher({
          binary: streamedResponse(binaryBytes, "application/octet-stream; charset=binary"),
        }),
      ),
    ).rejects.toThrow(/Content-Type/);
  });
});

describe("strand bundle abort identity", () => {
  it("rejects an already-aborted caller signal without fetching", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn<typeof fetch>();

    await expect(loadDiagnosticStrandBundle(controller.signal, fetcher)).rejects.toBeInstanceOf(
      StrandBundleAbortError,
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("cancels the manifest reader when aborted during streaming", async () => {
    const controller = new AbortController();
    let readStarted = false;
    let cancelCount = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(target) {
        if (readStarted) return;
        readStarted = true;
        target.enqueue(manifestBytes.slice(0, 10));
      },
      cancel() {
        cancelCount += 1;
      },
    });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    const promise = loadDiagnosticStrandBundle(controller.signal, validFetcher({ manifest: response }));
    await vi.waitFor(() => expect(readStarted).toBe(true));
    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(StrandBundleAbortError);
    expect(cancelCount).toBe(1);
  });

  it("keeps abort identity between requests and during binary streaming", async () => {
    const betweenController = new AbortController();
    const betweenFetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(streamedResponse(manifestBytes, "application/json; charset=utf-8"))
      .mockImplementationOnce(() => {
        betweenController.abort();
        return Promise.reject(new DOMException("aborted", "AbortError"));
      });
    await expect(
      loadDiagnosticStrandBundle(betweenController.signal, betweenFetcher),
    ).rejects.toBeInstanceOf(StrandBundleAbortError);

    const duringController = new AbortController();
    let cancelCount = 0;
    const binaryBody = new ReadableStream<Uint8Array>({
      start(target) {
        target.enqueue(binaryBytes.slice(0, 10));
      },
      cancel() {
        cancelCount += 1;
      },
    });
    const duringFetcher = validFetcher({
      binary: new Response(binaryBody, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    });
    const promise = loadDiagnosticStrandBundle(duringController.signal, duringFetcher);
    await vi.waitFor(() => expect(duringFetcher).toHaveBeenCalledTimes(2));
    duringController.abort();
    await expect(promise).rejects.toBeInstanceOf(StrandBundleAbortError);
    expect(cancelCount).toBe(1);
  });

  it("contains a rejecting abort-time cancellation and removes the listener", async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const cancellationFailure = new Error("cancel failed");
    const cancel = vi.fn(() => Promise.reject(cancellationFailure));
    let readStarted = false;
    const body = new ReadableStream<Uint8Array>({
      pull(target) {
        if (readStarted) return;
        readStarted = true;
        target.enqueue(manifestBytes.slice(0, 10));
      },
      cancel,
    });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    const promise = loadDiagnosticStrandBundle(
      controller.signal,
      validFetcher({ manifest: response }),
    );
    await vi.waitFor(() => expect(readStarted).toBe(true));

    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(StrandBundleAbortError);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
    expect(addListener).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
