// ============================================================
// lib/storage/index.ts
// 스토리지 공급자 팩토리
// ------------------------------------------------------------
// 사용처:
//   import { storage } from "@/lib/storage";
//   const { uploadUrl, key } = await storage.getUploadUrl({ ... });
//   const viewUrl = await storage.getViewUrl(key);
// ============================================================

import type { StorageProvider } from "./types";
import { S3StorageProvider } from "./s3";
import { MockStorageProvider } from "./mock";

// STORAGE_PROVIDER=mock → 로컬 개발용 MockStorageProvider (AWS 자격증명 불필요)
// 그 외           → S3StorageProvider (AWS_REGION / AWS_S3_BUCKET 필수)
export const storage: StorageProvider =
  process.env.STORAGE_PROVIDER === "mock"
    ? new MockStorageProvider()
    : new S3StorageProvider();

export type {
  StorageProvider,
  PresignedUploadResult,
  UploadPurpose,
} from "./types";
