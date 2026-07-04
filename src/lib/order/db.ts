// ============================================================
// lib/order/db.ts — 주문 DB 계층 (STRICT 존, 서버 전용)
// 단일 Prisma 트랜잭션으로 고아 레코드 없이 주문을 생성한다.
// 클라이언트 입력 금액은 절대 신뢰하지 않는다 — 모든 금액을 서버 계산.
// ============================================================
import "server-only";

import { Prisma, ShippingCountry } from "@prisma/client";
import { db } from "@/lib/db";
import { MARKET_CONFIGS, isMarketCode } from "@/lib/market/types";
import { validateAndBuildLines, computeTotal } from "./core";
import { parseSnapshotData, snapshotToJson } from "./snapshot";
import {
  OrderException,
  type CheckoutAddressInput,
  type CheckoutItem,
  type OrderView,
  type OrderItemView,
  type OrderLine,
} from "./types";

function isShippingCountry(v: string): v is ShippingCountry {
  return v === "KR" || v === "US" || v === "JP";
}

// ── 체크아웃용 장바구니 로드 ──────────────────────────────────

export async function getCartForCheckout(
  userId: string,
  marketCode: string,
): Promise<CheckoutItem[]> {
  const rows = await db.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, quantity: true, variantId: true, wigStyleId: true,
      variant: {
        select: {
          color: true, colorHex: true, length: true, curl: true, stock: true,
          marketPrices: { where: { marketCode }, select: { amount: true } },
          wigStyle: { select: { id: true, name: true, coverImageKey: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    cartItemId: r.id,
    variantId: r.variantId,
    wigStyleId: r.wigStyleId,
    quantity: r.quantity,
    unitPrice: r.variant.marketPrices[0]?.amount ?? 0,
    styleName: r.variant.wigStyle.name,
    color: r.variant.color,
    colorHex: r.variant.colorHex,
    length: r.variant.length,
    curl: r.variant.curl,
    stock: r.variant.stock,
    coverImageKey: r.variant.wigStyle.coverImageKey,
  }));
}

// ── 트랜잭션 내부 (50줄 이하) ────────────────────────────────

async function runCreateOrderTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    marketCode: string;
    currency: string;
    totalAmount: number;
    address: CheckoutAddressInput;
    country: ShippingCountry; // createOrder에서 검증 후 전달
    lines: OrderLine[];
  },
): Promise<string> {
  const { userId, marketCode, currency, totalAmount, address, country, lines } = params;
  const order = await tx.order.create({
    data: {
      userId, status: "PENDING_PAYMENT",
      marketCode, currency,
      totalAmount, shippingFee: 0,
      recipientName: address.recipientName,
      phone: address.phone,
      country,
      postalCode: address.postalCode,
      administrativeArea: address.administrativeArea || null,
      city: address.city,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 || null,
      memo: address.memo || null,
      items: {
        create: lines.map((line) => ({
          variant: { connect: { id: line.variantId } },
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          snapshotData: snapshotToJson(line.snapshotData),
          manufacturingRequest: { create: {} },
        })),
      },
    },
    select: { id: true },
  });
  return order.id;
}

// ── 주문 생성 공개 API ────────────────────────────────────────

export async function createOrder(
  userId: string,
  marketCode: string,
  address: CheckoutAddressInput,
): Promise<string> {
  if (!isMarketCode(marketCode)) {
    throw new OrderException("SHIPPING_COUNTRY_INVALID", "유효하지 않은 마켓입니다.");
  }
  if (!isShippingCountry(address.country)) {
    throw new OrderException("SHIPPING_COUNTRY_INVALID", "유효하지 않은 배송 국가입니다.");
  }

  const market = MARKET_CONFIGS[marketCode];
  if (!market.shippableCountries.includes(address.country)) {
    throw new OrderException(
      "SHIPPING_COUNTRY_INVALID",
      `${address.country}는 현재 마켓에서 배송 불가 국가입니다.`,
    );
  }

  const cartItems = await loadCartForOrder(userId, marketCode);
  const lines = validateAndBuildLines(cartItems, market.currency.code);
  const totalAmount = computeTotal(lines, 0);

  // isShippingCountry guard 통과 후 → TypeScript가 country 타입을 ShippingCountry로 좁힘
  const country: ShippingCountry = address.country;

  return db.$transaction((tx) =>
    runCreateOrderTx(tx, {
      userId, marketCode, currency: market.currency.code,
      totalAmount, address, country, lines,
    }),
  );
}

async function loadCartForOrder(userId: string, marketCode: string) {
  return db.cartItem.findMany({
    where: { userId },
    select: {
      variantId: true, wigStyleId: true, quantity: true,
      variant: {
        select: {
          stock: true, color: true, colorHex: true,
          length: true, curl: true, sku: true,
          marketPrices: { where: { marketCode }, select: { amount: true } },
          wigStyle: {
            select: {
              id: true, name: true, coverImageKey: true,
              availableMarkets: {
                where: { marketCode },
                select: { isActive: true },
              },
            },
          },
        },
      },
    },
  });
}

// ── 주문 조회 ─────────────────────────────────────────────────

export async function getOrderById(
  orderId: string,
  userId: string,
): Promise<OrderView | null> {
  const row = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, status: true, marketCode: true, currency: true,
      totalAmount: true, shippingFee: true, createdAt: true,
      recipientName: true, phone: true, country: true,
      postalCode: true, administrativeArea: true, city: true,
      addressLine1: true, addressLine2: true, memo: true, userId: true,
      items: {
        select: { id: true, quantity: true, unitPrice: true, snapshotData: true },
      },
    },
  });

  if (!row || row.userId !== userId) return null;

  return {
    id: row.id, status: row.status,
    marketCode: row.marketCode, currency: row.currency,
    totalAmount: row.totalAmount, shippingFee: row.shippingFee,
    createdAt: row.createdAt,
    recipientName: row.recipientName, phone: row.phone,
    country: row.country,
    postalCode: row.postalCode, administrativeArea: row.administrativeArea,
    city: row.city, addressLine1: row.addressLine1, addressLine2: row.addressLine2,
    memo: row.memo,
    items: row.items.map((item): OrderItemView => ({
      id: item.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      snapshotData: parseSnapshotData(item.snapshotData),
    })),
  };
}
