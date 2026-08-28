import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn<(command: unknown) => Promise<unknown>>(),
}));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  class TestS3Client {
    send(command: unknown): Promise<unknown> {
      return mockSend(command);
    }
  }
  return { ...actual, S3Client: TestS3Client };
});

import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
} from "@aws-sdk/client-s3";
import { S3StorageProvider } from "../s3";

class ObservableBody extends Readable {
  private nextChunk = 0;
  pulledChunks = 0;

  constructor(private readonly chunks: readonly Uint8Array[]) {
    super({ highWaterMark: 1 });
  }

  override _read(): void {
    const chunk = this.chunks[this.nextChunk];
    this.nextChunk += 1;
    if (!chunk) {
      this.push(null);
      return;
    }
    this.pulledChunks += 1;
    this.push(chunk);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AWS_REGION = "ap-northeast-2";
  process.env.AWS_S3_BUCKET = "test-bucket";
});

describe("S3 provider-neutral object inspection", () => {
  it("maps HeadObject metadata without exposing the AWS response", async () => {
    mockSend.mockResolvedValue({ ContentLength: 4, ContentType: "image/png" });
    const storage = new S3StorageProvider();
    await expect(storage.statObject("wig-style/a.png")).resolves.toEqual({
      byteLength: 4,
      contentType: "image/png",
    });
    expect(mockSend.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("maps an S3 not-found response to absent metadata", async () => {
    mockSend.mockRejectedValue(new NotFound({ message: "missing", $metadata: {} }));
    const storage = new S3StorageProvider();
    await expect(storage.statObject("wig-style/missing.png")).resolves.toBeNull();
  });

  it("uses a sentinel byte range and admits a compliant body smaller than the ceiling", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const body = new ObservableBody([bytes]);
    mockSend.mockResolvedValue({
      Body: body,
      ContentRange: "bytes 0-2/3",
      ContentType: "image/png",
    });
    const storage = new S3StorageProvider();
    await expect(storage.readObjectBounded("wig-style/a.png", 4)).resolves.toEqual({
      bytes,
      totalByteLength: 3,
      contentType: "image/png",
    });
    const command = mockSend.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    if (command instanceof GetObjectCommand) {
      expect(command.input.Range).toBe("bytes=0-4");
    }
  });

  it("admits a body exactly equal to maxBytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const body = new ObservableBody([
      bytes.slice(0, 2),
      bytes.slice(2),
    ]);
    mockSend.mockResolvedValue({
      Body: body,
      ContentRange: "bytes 0-3/4",
      ContentType: "image/png",
    });
    const storage = new S3StorageProvider();
    await expect(storage.readObjectBounded("wig-style/a.png", 4)).resolves.toEqual({
      bytes,
      totalByteLength: 4,
      contentType: "image/png",
    });
    expect(body.pulledChunks).toBe(2);
  });

  it("rejects maxBytes + 1 and destroys the stream", async () => {
    const body = new ObservableBody([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5]),
    ]);
    mockSend.mockResolvedValue({
      Body: body,
      ContentRange: "bytes 0-4/5",
      ContentType: "image/png",
    });
    const storage = new S3StorageProvider();
    await expect(storage.readObjectBounded("wig-style/a.png", 4)).rejects.toThrow(
      "exceeded its byte limit",
    );
    expect(body.pulledChunks).toBe(3);
    expect(body.destroyed).toBe(true);
  });

  it("stops before later chunks when a significantly oversized body ignores Range", async () => {
    const body = new ObservableBody([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5, 6]),
      new Uint8Array(64),
    ]);
    mockSend.mockResolvedValue({
      Body: body,
      ContentRange: "bytes 0-69/70",
      ContentType: "image/png",
    });
    const storage = new S3StorageProvider();
    await expect(storage.readObjectBounded("wig-style/ignored-range.png", 4)).rejects.toThrow(
      "exceeded its byte limit",
    );
    expect(body.pulledChunks).toBe(3);
    expect(body.destroyed).toBe(true);
    const command = mockSend.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(GetObjectCommand);
    if (command instanceof GetObjectCommand) {
      expect(command.input.Range).toBe("bytes=0-4");
    }
  });

  it("rejects missing range metadata instead of assuming a complete read", async () => {
    mockSend.mockResolvedValue({
      Body: new ObservableBody([new Uint8Array([1])]),
      ContentType: "image/png",
    });
    const storage = new S3StorageProvider();
    await expect(storage.readObjectBounded("wig-style/a.png", 4)).rejects.toThrow(
      "invalid Content-Range",
    );
  });
});
