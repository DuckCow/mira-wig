import { CheckoutSessionStatus } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { snapshotToJson } from "@/lib/order/snapshot";
import { normalizeShippingAddress } from "@/lib/order/validation";
import { isCurrencyCode } from "@/lib/market/types";
import { isLocale } from "@/lib/market/locale";
import {
  priceSelectedPromotion,
  PromotionRedemptionError,
} from "@/lib/promotion";
import {
  variantPurchasableInMarketFailure,
  commerceIntegrityMessage,
} from "@/lib/commerce-integrity";
import { SESSION_TTL_MS, SessionException, type CreateCheckoutSessionInput, type CreateCheckoutSessionResult } from "./types";

type SessionTx = Prisma.TransactionClient;
type CartRow = Awaited<ReturnType<typeof loadCartItems>>[number];
interface FrozenCheckoutLine {
  readonly variantId: string;
  readonly sourceCartItemId: string;
  readonly wigStyleId: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly discountAmount: number;
  readonly fulfillmentType: CartRow["variant"]["fulfillmentType"];
  readonly snapshotData: Prisma.InputJsonValue;
}
type MarketRow = Awaited<ReturnType<typeof loadMarket>>;

export async function createCheckoutSession(
  client: PrismaClient,
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  if (!isLocale(input.communicationLocale)) {
    throw new SessionException(
      "COMMUNICATION_LOCALE_INVALID",
      "지원하지 않는 주문 커뮤니케이션 언어입니다.",
    );
  }
  const normalizedInput: CreateCheckoutSessionInput = {
    ...input,
    shipping: requireNormalizedShipping(input.shipping),
  };
  const now = normalizedInput.now ?? new Date();
  const normalExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  return client.$transaction(async (tx) => {
    const market = await loadMarket(tx, normalizedInput.marketCode);
    validateShippingCountry(normalizedInput.shipping.country, market.shippableCountries);
    const cartItems = await loadCartItems(tx, normalizedInput.userId, normalizedInput.marketCode);
    let lines = buildLines(cartItems, market.currency);
    const subtotalAmount = sumLines(lines);
    const shippingAmount = 0;
    let discountAmount = 0;
    let expiresAt = normalExpiresAt;
    if (normalizedInput.promotionGrantId !== undefined) {
      const promotion = await pricePromotion(tx, normalizedInput, lines, market.currency, now);
      discountAmount = promotion.discountAmount;
      lines = applyLineDiscounts(lines, promotion.lineDiscounts);
      if (promotion.expiresAt && promotion.expiresAt.getTime() < expiresAt.getTime()) {
        expiresAt = promotion.expiresAt;
      }
    }
    const totalAmount = subtotalAmount + shippingAmount - discountAmount;
    // Total-level payable guard only: zero-unit lines can pass once shipping/discount designs
    // make total >= 1. A fully free/no-payment order path must be designed explicitly later.
    if (totalAmount < 1) {
      throw new SessionException("TOTAL_AMOUNT_TOO_LOW", "결제 가능한 최소 금액에 미달합니다.");
    }
    const created = await createSession(
      tx,
      normalizedInput,
      lines,
      subtotalAmount,
      discountAmount,
      shippingAmount,
      totalAmount,
      market.currency,
      now,
      expiresAt,
    );
    return toResult(created);
  });
}

function requireNormalizedShipping(
  shipping: CreateCheckoutSessionInput["shipping"],
): CreateCheckoutSessionInput["shipping"] {
  const normalized = normalizeShippingAddress(shipping);
  if (normalized.kind === "invalidCountry") throwInvalidShippingCountry();
  if (normalized.kind === "invalidAddress") throwInvalidShippingAddress();
  return {
    recipientName: normalized.address.recipientName,
    phone: normalized.address.phone,
    country: shipping.country,
    postalCode: normalized.address.postalCode,
    administrativeArea: normalized.address.administrativeArea,
    city: normalized.address.city,
    addressLine1: normalized.address.addressLine1,
    addressLine2: shipping.addressLine2,
    memo: shipping.memo,
  };
}

function validateShippingCountry(country: string, shippableCountries: string[]): void {
  if (shippableCountries.includes(country)) return;
  throwInvalidShippingCountry();
}

function throwInvalidShippingCountry(): never {
  throw new SessionException("SHIPPING_COUNTRY_INVALID", "해당 마켓으로 배송할 수 없는 국가입니다.");
}

function throwInvalidShippingAddress(): never {
  throw new SessionException("SHIPPING_ADDRESS_INVALID", "배송지 필수 항목이 비어 있습니다.");
}

async function loadMarket(tx: SessionTx, marketCode: string) {
  const market = await tx.market.findUnique({
    where: { code: marketCode },
    select: { currency: true, shippableCountries: true, isActive: true },
  });
  if (!market) throw new SessionException("MARKET_UNAVAILABLE", "마켓을 찾을 수 없습니다.");
  if (!market.isActive) throw new SessionException("MARKET_UNAVAILABLE", "마켓을 찾을 수 없습니다.");
  if (!isCurrencyCode(market.currency)) {
    throw new SessionException("MARKET_UNAVAILABLE", "지원하지 않는 마켓 통화입니다.");
  }
  return market;
}

async function loadCartItems(tx: SessionTx, userId: string, marketCode: string) {
  return tx.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      variantId: true,
      wigStyleId: true,
      quantity: true,
      variant: {
        select: {
          id: true,
          wigStyleId: true,
          stock: true,
          isActive: true,
          fulfillmentType: true,
          color: true,
          colorHex: true,
          length: true,
          curl: true,
          wigStyle: {
            select: {
              name: true,
              coverImageKey: true,
              isActive: true,
              availableMarkets: {
                where: { marketCode, isActive: true },
                select: { marketCode: true },
                take: 1,
              },
            },
          },
          marketPrices: {
            where: { marketCode },
            select: { amount: true },
            take: 1,
          },
        },
      },
    },
  });
}

function buildLines(
  cartItems: CartRow[],
  currencyCode: string,
): FrozenCheckoutLine[] {
  if (cartItems.length === 0) throw new SessionException("CART_EMPTY", "장바구니가 비어 있습니다.");
  return cartItems.map((item) => buildLine(item, currencyCode));
}

function buildLine(
  item: CartRow,
  currencyCode: string,
): FrozenCheckoutLine {
  const failure = variantPurchasableInMarketFailure({
    selectedStyleId: item.wigStyleId,
    canonicalStyleId: item.variant.wigStyleId,
    styleActive: item.variant.wigStyle.isActive,
    stylePublishedInMarket: item.variant.wigStyle.availableMarkets.length === 1,
    variantActive: item.variant.isActive,
    hasMarketPrice: item.variant.marketPrices.length === 1,
    stock: item.variant.stock,
    quantity: item.quantity,
  });
  if (failure) throw new SessionException(failure, commerceIntegrityMessage(failure));
  const price = item.variant.marketPrices[0];
  if (!price) throw new Error("Missing guarded market price");
  validateAmount(price.amount);
  return {
    variantId: item.variantId,
    sourceCartItemId: item.id,
    wigStyleId: item.wigStyleId,
    quantity: item.quantity,
    unitAmount: price.amount,
    discountAmount: 0,
    fulfillmentType: item.variant.fulfillmentType,
    snapshotData: snapshotToJson(toSnapshot(item, currencyCode)),
  };
}

function validateAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new SessionException("INVALID_AMOUNT", "가격은 0 이상의 정수여야 합니다.");
  }
}

function toSnapshot(item: CartRow, currencyCode: string) {
  return {
    styleName: item.variant.wigStyle.name,
    color: item.variant.color,
    colorHex: item.variant.colorHex,
    length: item.variant.length,
    curl: item.variant.curl,
    coverImageKey: item.variant.wigStyle.coverImageKey,
    currencyCode,
  };
}

function sumLines(lines: readonly FrozenCheckoutLine[]): number {
  return lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
}

async function createSession(
  tx: SessionTx,
  input: CreateCheckoutSessionInput,
  lines: readonly FrozenCheckoutLine[],
  subtotalAmount: number,
  discountAmount: number,
  shippingAmount: number,
  totalAmount: number,
  currency: MarketRow["currency"],
  now: Date,
  expiresAt: Date,
) {
  return tx.checkoutSession.create({
    data: {
      user: { connect: { id: input.userId } },
      market: { connect: { code: input.marketCode } },
      communicationLocale: input.communicationLocale,
      promotionGrant: input.promotionGrantId
        ? { connect: { id: input.promotionGrantId } }
        : undefined,
      currency,
      status: CheckoutSessionStatus.SUBMITTED,
      subtotalAmount,
      discountAmount,
      shippingAmount,
      totalAmount,
      expiresAt,
      submittedAt: now,
      lines: { create: lines.map(toLineCreate) },
      shipping: { create: toShippingCreate(input.shipping) },
    },
    select: { id: true, expiresAt: true, subtotalAmount: true, discountAmount: true, shippingAmount: true, totalAmount: true, currency: true },
  });
}

function toShippingCreate(shipping: CreateCheckoutSessionInput["shipping"]) {
  return {
    recipientName: shipping.recipientName,
    phone: shipping.phone,
    country: shipping.country,
    postalCode: shipping.postalCode,
    administrativeArea: shipping.administrativeArea,
    city: shipping.city,
    addressLine1: shipping.addressLine1,
    addressLine2: optionalText(shipping.addressLine2),
    memo: optionalText(shipping.memo),
  };
}

function optionalText(value: string | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}

function toResult(created: Awaited<ReturnType<typeof createSession>>): CreateCheckoutSessionResult {
  return {
    sessionId: created.id,
    expiresAt: created.expiresAt,
    subtotalAmount: created.subtotalAmount,
    discountAmount: created.discountAmount,
    shippingAmount: created.shippingAmount,
    totalAmount: created.totalAmount,
    currency: created.currency,
  };
}

async function pricePromotion(
  tx: SessionTx,
  input: CreateCheckoutSessionInput,
  lines: readonly FrozenCheckoutLine[],
  currency: string,
  now: Date,
) {
  try {
    return await priceSelectedPromotion(tx, {
      promotionGrantId: input.promotionGrantId ?? "",
      userId: input.userId,
      marketCode: input.marketCode,
      currency,
      now,
      lines: lines.map((line) => ({
        // CartItem and CheckoutSessionLine each enforce one line per variant.
        lineId: line.variantId,
        grossAmount: line.unitAmount * line.quantity,
      })),
    });
  } catch (error) {
    if (error instanceof PromotionRedemptionError) {
      const code = error.code === "PROMOTION_DISCOUNT_UNAVAILABLE"
        ? "PROMOTION_DISCOUNT_UNAVAILABLE"
        : "PROMOTION_GRANT_UNAVAILABLE";
      throw new SessionException(code, error.message);
    }
    throw error;
  }
}

function applyLineDiscounts(
  lines: readonly FrozenCheckoutLine[],
  discounts: readonly Readonly<{ lineId: string; discountAmount: number }>[],
): FrozenCheckoutLine[] {
  const byVariantId = new Map(discounts.map((discount) => [discount.lineId, discount.discountAmount]));
  return lines.map((line) => {
    const discountAmount = byVariantId.get(line.variantId);
    if (discountAmount === undefined) {
      throw new SessionException("PROMOTION_DISCOUNT_UNAVAILABLE", "Promotion allocation is incomplete.");
    }
    return { ...line, discountAmount };
  });
}

function toLineCreate(line: FrozenCheckoutLine): Prisma.CheckoutSessionLineCreateWithoutSessionInput {
  return {
    variant: { connect: { id: line.variantId } },
    sourceCartItemId: line.sourceCartItemId,
    wigStyleId: line.wigStyleId,
    quantity: line.quantity,
    unitAmount: line.unitAmount,
    discountAmount: line.discountAmount,
    fulfillmentType: line.fulfillmentType,
    snapshotData: line.snapshotData,
  };
}
