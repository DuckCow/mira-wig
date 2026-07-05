// ============================================================
// lib/order/index.ts — 주문 계층 공개 API
//
// 컷오버 Phase 1: 주문 생성/조회 DB 경로는 제거되고 순수 스냅샷 계산만 남는다.
// 클라이언트 컴포넌트: 타입·config는 하위 파일에서 직접 import
//   import { COUNTRY_FORM_CONFIGS } from "@/lib/order/address-config"
//   import type { CheckoutAddressInput } from "@/lib/order/types"
// ============================================================

export {
  computeTotal,
  buildSnapshotData,
  validateAndBuildLines,
} from "./core";

export {
  OrderException,
  type OrderErrorCode,
  type SnapshotData,
  type CheckoutAddressInput,
} from "./types";
