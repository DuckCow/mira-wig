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

// 현재는 S3 단일 구현. 향후 CloudFront/다른 백엔드 추가 시 여기서 분기.
export const storage: StorageProvider = new S3StorageProvider();

export type {
  StorageProvider,
  PresignedUploadResult,
  UploadPurpose,
} from "./types";
