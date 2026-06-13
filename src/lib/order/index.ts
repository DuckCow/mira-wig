// ============================================================
// lib/order/index.ts — 주문 계층 공개 API
//
// 서버 컴포넌트/액션: import { createOrder, getOrderById } from "@/lib/order"
// 클라이언트 컴포넌트: 타입·config는 하위 파일에서 직접 import
//   import { COUNTRY_FORM_CONFIGS } from "@/lib/order/address-config"
//   import type { CheckoutAddressInput } from "@/lib/order/types"
// ============================================================

export { getCartForCheckout, createOrder, getOrderById } from "./db";

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
  type CreateOrderResult,
  type CheckoutItem,
  type OrderView,
  type OrderItemView,
} from "./types";
