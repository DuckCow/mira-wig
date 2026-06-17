// ============================================================
// lib/ai/types.ts — AI 피팅 추상화 계층 계약(contract)
// client-safe: server-only import 없음
// ------------------------------------------------------------
// 규칙: 컴포넌트/API는 외부 AI SDK를 직접 import하지 않는다.
//       반드시 이 인터페이스를 통해서만 호출한다.
// ============================================================

/** 성공 시 영속할 피팅 결과 */
export interface FittingResult {
  /** S3 key (URL 아님 — 규칙 4-4). 읽기 시 storage 계층이 presign한다. */
  resultImageKey: string;
}

/** provider의 job 상태 (폴링 응답) */
export type FittingJobStatus =
  | { status: "pending" }
  | { status: "succeeded"; result: FittingResult }
  | { status: "failed"; reason: string };

/** provider 동작 방식 */
export type FittingProviderMode = "server-async" | "client-widget";

/**
 * 서버에서 비동기로 job을 요청하고 폴링하는 provider.
 * mock / 외부 REST API 기반 provider가 이 인터페이스를 구현한다.
 */
export interface ServerAsyncFittingProvider {
  readonly mode: "server-async";
  readonly name: string;

  /**
   * 피팅 job을 외부 provider에 등록한다.
   * 즉각적인 결과 없이 추적용 jobId만 반환한다.
   */
  requestFitting(input: {
    sourceImageKey: string;
    variantId: string;
    /** 데모 canned 결과 파일명 키 (mock 전용 — 실 provider는 무시). */
    variantSku?: string;
  }): Promise<{ providerJobId: string }>;

  /** job 상태를 조회한다. terminal 상태이면 이후 폴링은 중단해야 한다. */
  getJob(providerJobId: string): Promise<FittingJobStatus>;
}

/**
 * FittingProvider 유니온.
 * 'client-widget'(온디바이스, 예: Banuba)는 향후 변형이다.
 * 실제 도입 시 ClientWidgetFittingProvider를 추가하고 유니온을 넓힌다.
 * 지금은 server-async만 구현한다.
 */
export type FittingProvider = ServerAsyncFittingProvider;
