// ============================================================
// lib/storage/s3.ts
// S3StorageProvider — AWS S3 구현체
// ------------------------------------------------------------
// 키 구조 규칙:
//   user-upload/{ownerId}/{uuid}.{ext}     ← 비공개, 짧은 만료
//   tryon-result/{ownerId}/{uuid}.{ext}
//   wig-style/{uuid}.{ext}
//   review/{ownerId}/{uuid}.{ext}
//   hair-cad/{uuid}.{ext}
// ============================================================

import { randomUUID } from "crypto";
import { Readable } from "node:stream";
import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  NotFound,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  PresignedUploadResult,
  StorageProvider,
  UploadPurpose,
} from "./types";

const DEFAULT_VIEW_EXPIRY = 60 * 15; // 15분 — 민감 이미지 기본 만료
const UPLOAD_EXPIRY = 60 * 5; // 5분 — 업로드 URL 유효기간

function parseContentRangeTotal(contentRange: string | undefined): number {
  const match = /^bytes 0-\d+\/(\d+)$/.exec(contentRange ?? "");
  const total = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("S3 bounded read returned invalid Content-Range metadata.");
  }
  return total;
}

async function readNodeBodyBounded(
  body: Readable,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    for await (const streamedChunk of body) {
      const chunk: unknown = streamedChunk;
      if (!(chunk instanceof Uint8Array)) {
        throw new Error("S3 bounded read returned a non-byte stream chunk.");
      }
      if (chunk.byteLength > maxBytes - byteLength) {
        body.destroy();
        throw new Error("S3 bounded read exceeded its byte limit.");
      }
      chunks.push(chunk);
      byteLength += chunk.byteLength;
    }
  } catch (error) {
    if (!body.destroyed) body.destroy();
    throw error;
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Content-Type에서 확장자를 유추 (간단 매핑) */
function extFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  return map[contentType] ?? "bin";
}

function buildKey(
  purpose: UploadPurpose,
  ext: string,
  ownerId?: string
): string {
  const id = randomUUID();
  const ownerScoped: UploadPurpose[] = [
    "user-upload",
    "tryon-result",
    "review",
  ];
  if (ownerScoped.includes(purpose)) {
    if (!ownerId) {
      throw new Error(`${purpose} 업로드에는 ownerId가 필요합니다.`);
    }
    return `${purpose}/${ownerId}/${id}.${ext}`;
  }
  return `${purpose}/${id}.${ext}`;
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private client: S3Client;
  private bucket: string;

  constructor() {
    const region = process.env.AWS_REGION;
    const bucket = process.env.AWS_S3_BUCKET;
    if (!region || !bucket) {
      throw new Error("AWS_REGION / AWS_S3_BUCKET 환경변수가 필요합니다.");
    }
    this.bucket = bucket;
    this.client = new S3Client({ region });
    // 자격증명은 AWS SDK 기본 체인(env/IAM role)에서 자동 로드
  }

  async getUploadUrl(params: {
    purpose: UploadPurpose;
    contentType: string;
    ownerId?: string;
  }): Promise<PresignedUploadResult> {
    const ext = extFromContentType(params.contentType);
    const key = buildKey(params.purpose, ext, params.ownerId);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: params.contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_EXPIRY,
    });

    return {
      uploadUrl,
      key,
      requiredHeaders: { "Content-Type": params.contentType },
      expiresInSeconds: UPLOAD_EXPIRY,
    };
  }

  async getViewUrl(
    key: string,
    expiresInSeconds: number = DEFAULT_VIEW_EXPIRY
  ): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return true;
    } catch {
      return false;
    }
  }

  async statObject(key: string) {
    try {
      const output = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!Number.isSafeInteger(output.ContentLength) || (output.ContentLength ?? -1) < 0) {
        throw new Error("S3 object returned invalid Content-Length metadata.");
      }
      return {
        byteLength: output.ContentLength ?? -1,
        contentType: output.ContentType,
      };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  async readObjectBounded(key: string, maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new Error("maxBytes must be a positive safe integer.");
    }
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // HTTP ranges are inclusive. Request one sentinel byte beyond the local
        // ceiling so a stale/incorrect stat cannot hide an oversized object.
        Range: `bytes=0-${maxBytes}`,
      }),
    );
    if (!output.Body) throw new Error("S3 bounded read returned no body.");
    if (!(output.Body instanceof Readable)) {
      throw new Error("S3 bounded read returned an unsupported runtime body.");
    }
    const bytes = await readNodeBodyBounded(output.Body, maxBytes);
    return {
      bytes,
      totalByteLength: parseContentRangeTotal(output.ContentRange),
      contentType: output.ContentType,
    };
  }
}
