// ============================================================
// lib/storage/types.ts
// 스토리지 추상화 계층 — "계약(contract)"
// ------------------------------------------------------------
// 규칙 4-4: DB에는 S3 key만 저장한다 (전체 URL 금지).
//           조회 시점에 이 계층에서 presigned URL을 생성한다.
// 규칙 4-5: 사용자 얼굴 사진은 민감 정보. presigned URL 만료는 짧게.
// ------------------------------------------------------------
// 컴포넌트/API는 @aws-sdk를 직접 import하지 않고 이 인터페이스만 쓴다.
// 나중에 S3 → CloudFront/다른 버킷으로 바꿔도 구현체 1파일만 교체.
// ============================================================

/** 업로드용 presigned URL 발급 결과 */
export interface PresignedUploadResult {
  /** 클라이언트가 PUT 요청을 보낼 URL */
  uploadUrl: string;
  /** DB에 저장할 객체 key (URL 아님) */
  key: string;
  /** 업로드 시 사용해야 할 헤더 (Content-Type 등) */
  requiredHeaders?: Record<string, string>;
  /** URL 만료까지 남은 초 */
  expiresInSeconds: number;
}

/** 업로드할 파일의 분류 — 경로/정책을 다르게 적용하기 위함 */
export type UploadPurpose =
  | "user-upload" // 사용자가 올린 얼굴 사진 (민감, 비공개, 짧은 만료)
  | "tryon-result" // AI 피팅 결과 이미지
  | "wig-style" // 관리자가 올린 스타일 카탈로그 이미지
  | "review" // 리뷰 첨부 이미지
  | "hair-cad"; // 제작 설계도 (제조 단계)

/** 공급자와 무관한 객체 metadata. 정책 계층에는 SDK 객체를 노출하지 않는다. */
export interface StoredObjectMetadata {
  /** 공급자가 관찰한 전체 객체 byte 수 */
  byteLength: number;
  /** 객체에 저장된 Content-Type. 없으면 기술 입장에서 검증 불가다. */
  contentType: string | undefined;
}

/** 최대 byte 수까지만 읽은 객체 결과. */
export interface BoundedObjectRead {
  bytes: Uint8Array;
  /** read 시점에 공급자가 관찰한 전체 객체 byte 수 */
  totalByteLength: number;
  /** read 시점의 저장 Content-Type */
  contentType: string | undefined;
}

/** 이미지 등 서버 측 기술 검증에 필요한 최소 객체 검사 capability. */
export interface ObjectInspectionProvider {
  /** 객체가 없으면 null, metadata 조회 실패면 reject한다. */
  statObject(key: string): Promise<StoredObjectMetadata | null>;
  /** 전체 크기와 관계없이 반환 bytes는 maxBytes를 넘지 않아야 한다. */
  readObjectBounded(key: string, maxBytes: number): Promise<BoundedObjectRead>;
}

export interface StorageProvider extends ObjectInspectionProvider {
  /** 공급자 식별자 (예: "s3") */
  readonly name: string;

  /**
   * 클라이언트 직접 업로드용 presigned PUT URL을 발급한다.
   * 큰 이미지를 서버를 거치지 않고 올리기 위함.
   */
  getUploadUrl(params: {
    purpose: UploadPurpose;
    contentType: string;
    /** 키 생성에 쓰일 식별자 (예: userId). 비공개 경로 구성용 */
    ownerId?: string;
  }): Promise<PresignedUploadResult>;

  /**
   * 저장된 key로부터 읽기용 presigned URL을 생성한다.
   * 민감 자료(user-upload)는 만료를 짧게(기본 15분) 둔다.
   */
  getViewUrl(key: string, expiresInSeconds?: number): Promise<string>;

  /** 객체 삭제 (사용자 이미지 삭제 요청, 정리 작업 등) */
  delete(key: string): Promise<void>;

  /** 객체 존재 여부 확인 */
  exists(key: string): Promise<boolean>;
}
