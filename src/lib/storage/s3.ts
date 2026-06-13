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
import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  PresignedUploadResult,
  StorageProvider,
  UploadPurpose,
} from "./types";

const DEFAULT_VIEW_EXPIRY = 60 * 15; // 15분 — 민감 이미지 기본 만료
const UPLOAD_EXPIRY = 60 * 5; // 5분 — 업로드 URL 유효기간

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
}
