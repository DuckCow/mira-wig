// ============================================================
// lib/storage/mock.ts — MockStorageProvider (로컬 개발용)
// ------------------------------------------------------------
// S3 자격증명 없이 피팅 플로우를 개발할 때 사용한다.
// STORAGE_PROVIDER=mock 환경변수로 활성화한다.
//
// 업로드 URL: {NEXTAUTH_URL}/api/__mock-storage?key=...
// 브라우저가 해당 경로에 PUT하면 src/app/api/__mock-storage/route.ts 가 받는다.
// 같은 origin 요청이므로 CORS 불필요.
// ============================================================

import { randomUUID } from "crypto";
import type { PresignedUploadResult, StorageProvider, UploadPurpose } from "./types";

function extFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[contentType] ?? "bin";
}

function buildMockKey(purpose: UploadPurpose, ext: string, ownerId?: string): string {
  const id = randomUUID();
  const ownerScoped: UploadPurpose[] = ["user-upload", "tryon-result", "review"];
  if (ownerScoped.includes(purpose)) {
    if (!ownerId) throw new Error(`${purpose} 업로드에는 ownerId가 필요합니다.`);
    return `${purpose}/${ownerId}/${id}.${ext}`;
  }
  return `${purpose}/${id}.${ext}`;
}

export class MockStorageProvider implements StorageProvider {
  readonly name = "mock";

  private baseUrl(): string {
    return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  }

  getUploadUrl(params: {
    purpose: UploadPurpose;
    contentType: string;
    ownerId?: string;
  }): Promise<PresignedUploadResult> {
    const ext = extFromContentType(params.contentType);
    const key = buildMockKey(params.purpose, ext, params.ownerId);
    const uploadUrl = `${this.baseUrl()}/api/__mock-storage?key=${encodeURIComponent(key)}`;
    return Promise.resolve({
      uploadUrl,
      key,
      requiredHeaders: { "Content-Type": params.contentType },
      expiresInSeconds: 300,
    });
  }

  getViewUrl(key: string): Promise<string> {
    return Promise.resolve(
      `${this.baseUrl()}/api/__mock-storage?key=${encodeURIComponent(key)}`,
    );
  }

  delete(_key: string): Promise<void> {
    return Promise.resolve();
  }

  exists(_key: string): Promise<boolean> {
    return Promise.resolve(true);
  }
}
