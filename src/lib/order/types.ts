// ============================================================
// lib/order/types.ts — 주문 공유 타입 (클라이언트 안전)
// server-only 없음 — 클라이언트 컴포넌트도 import 가능
// ============================================================

// ── 에러 ─────────────────────────────────────────────────────

export type OrderErrorCode =
  | "CART_EMPTY"
  | "VARIANT_PRICE_UNAVAILABLE" // 현재 마켓에 해당 변형 가격 없음
  | "STYLE_UNAVAILABLE"         // 현재 마켓에서 스타일 비활성
  | "STOCK_INSUFFICIENT"        // 재고 부족
  | "SHIPPING_COUNTRY_INVALID"; // 마켓 배송 불가 국가

export class OrderException extends Error {
  constructor(
    public readonly code: OrderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderException";
  }
}

// ── 스냅샷 데이터 ─────────────────────────────────────────────
// OrderItem.snapshotData 에 동결. variant가 삭제·변경돼도 과거 주문 표시 가능.

export interface SnapshotData {
  styleName: string;
  color: string;
  colorHex: string | null;
  length: string;
  curl: string;
  /** S3 key (URL 아님) — 조회 시점에 presigned URL 생성 */
  coverImageKey: string | null;
  /** 최소단위 정수 저장 시의 통화 코드 */
  currencyCode: string;
}

// ── DB 로딩용 내부 타입 (core.ts, db.ts 공유) ─────────────────

export interface CartItemForValidation {
  variantId: string;
  wigStyleId: string;
  quantity: number;
  variant: {
    stock: number;
    color: string;
    colorHex: string | null;
    length: string;
    curl: string;
    sku: string;
    marketPrices: { amount: number }[];
    wigStyle: {
      id: string;
      name: string;
      coverImageKey: string | null;
      availableMarkets: { isActive: boolean }[];
    };
  };
}

// ── 주문 라인 (검증 통과 후) ──────────────────────────────────

export interface OrderLine {
  variantId: string;
  wigStyleId: string;
  quantity: number;
  unitPrice: number; // 최소단위 정수, 동결
  snapshotData: SnapshotData;
}

// ── 주문서 제출 주소 입력 ──────────────────────────────────────

export interface CheckoutAddressInput {
  recipientName: string;
  phone: string;
  country: string; // "KR" | "US" | "JP" — 서버에서 ShippingCountry로 검증
  postalCode: string;
  administrativeArea: string; // US/JP 필수, KR 선택
  city: string;
  addressLine1: string;
  addressLine2: string;
  memo: string;
}

// ── 결제 대기 주문 생성 결과 ──────────────────────────────────

export type CreateOrderResult =
  | { success: true; orderId: string }
  | { success: false; error: string };

// ── 체크아웃용 장바구니 항목 (마켓 가격 포함) ────────────────────

export interface CheckoutItem {
  cartItemId: string;
  variantId: string;
  wigStyleId: string;
  quantity: number;
  /** 현재 마켓 최소단위 정수 금액 */
  unitPrice: number;
  styleName: string;
  color: string;
  colorHex: string | null;
  length: string;
  curl: string;
  stock: number;
  coverImageKey: string | null;
}

// ── 주문 확인 뷰 ──────────────────────────────────────────────

export interface OrderItemView {
  id: string;
  quantity: number;
  unitPrice: number;
  snapshotData: SnapshotData;
}

export interface OrderView {
  id: string;
  status: string;
  marketCode: string;
  currency: string;
  totalAmount: number;
  shippingFee: number;
  createdAt: Date;
  recipientName: string;
  phone: string;
  country: string;
  postalCode: string;
  administrativeArea: string | null;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  memo: string | null;
  items: OrderItemView[];
}
