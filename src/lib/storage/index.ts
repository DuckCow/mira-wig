// ============================================================
// lib/storage/index.ts
// ------------------------------------------------------------
// catalogStorage — 카탈로그 이미지용 (STORAGE_PROVIDER env 스위치)
// fittingStorage — 피팅 셀카·결과용 (항상 MockStorageProvider 고정)
// ------------------------------------------------------------
// 사용처:
//   카탈로그 경로: import { catalogStorage } from "@/lib/storage";
//   피팅 경로:     import { fittingStorage } from "@/lib/storage";
// ============================================================

import type { StorageProvider } from "./types";
import { S3StorageProvider } from "./s3";
import { MockStorageProvider } from "./mock";

// STORAGE_PROVIDER=mock → 로컬 개발용 MockStorageProvider (AWS 자격증명 불필요)
// 그 외(미설정 포함)   → S3StorageProvider (AWS_REGION / AWS_S3_BUCKET 필수)
export const catalogStorage: StorageProvider =
  process.env.STORAGE_PROVIDER === "mock"
    ? new MockStorageProvider()
    : new S3StorageProvider();

// 피팅 셀카·결과는 항상 MockStorageProvider로 고정한다.
// 실 VTO(AI_PROVIDER=real) 전환 시 이 단일 지점에서 S3로 교체한다.
// STORAGE_PROVIDER 값과 독립 — catalogStorage와 별개로 전환.
export const fittingStorage: StorageProvider = new MockStorageProvider();

export type {
  StorageProvider,
  PresignedUploadResult,
  UploadPurpose,
} from "./types";
