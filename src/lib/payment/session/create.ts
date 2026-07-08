import { CheckoutSessionStatus } from "@prisma/client";
import type { Prisma, PrismaClient } from "@prisma/client";
import { snapshotToJson } from "@/lib/order/snapshot";
import { SESSION_TTL_MS, SessionException, type CreateCheckoutSessionInput, type CreateCheckoutSessionResult } from "./types";

type SessionTx = Prisma.TransactionClient;
type CartRow = Awaited<ReturnType<typeof loadCartItems>>[number];
type LineInput = Prisma.CheckoutSessionLineCreateWithoutSessionInput;
type MarketRow = Awaited<ReturnType<typeof loadMarket>>;

export async function createCheckoutSession(
  client: PrismaClient,
  input: CreateCheckoutSessionInput,
): Promise<CreateCheckoutSessionResult> {
  validateShippingFields(input.shipping);
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  return client.$transaction(async (tx) => {
    const market = await loadMarket(tx, input.marketCode);
    validateShippingCountry(input.shipping.country, market.shippableCountries);
    const cartItems = await loadCartItems(tx, input.userId);
    const lines = await buildLines(tx, cartItems, input.marketCode, market.currency);
    const subtotalAmount = sumLines(lines);
    const shippingAmount = 0;
    const totalAmount = subtotalAmount + shippingAmount;
    // Total-level payable guard only: zero-unit lines can pass once shipping/discount designs
    // make total >= 1. A fully free/no-payment order path must be designed explicitly later.
    if (totalAmount < 1) {
      throw new SessionException("TOTAL_AMOUNT_TOO_LOW", "결제 가능한 최소 금액에 미달합니다.");
    }
    const created = await createSession(
      tx,
      input,
      lines,
      subtotalAmount,
      shippingAmount,
      totalAmount,
      market.currency,
      now,
      expiresAt,
    );
    return toResult(created);
  });
}

function validateShippingFields(shipping: CreateCheckoutSessionInput["shipping"]): void {
  if (missingShippingFields(shipping)) {
    throw new SessionException("SHIPPING_ADDRESS_INVALID", "배송지 필수 항목이 비어 있습니다.");
  }
}

function validateShippingCountry(country: string, shippableCountries: string[]): void {
  if (shippableCountries.includes(country)) return;
  throw new SessionException("SHIPPING_COUNTRY_INVALID", "해당 마켓으로 배송할 수 없는 국가입니다.");
}

function missingShippingFields(shipping: CreateCheckoutSessionInput["shipping"]): boolean {
  return [
    shipping.recipientName,
    shipping.phone,
    shipping.postalCode,
    shipping.administrativeArea,
    shipping.city,
    shipping.addressLine1,
  ].some((value) => value.trim().length === 0);
}

async function loadMarket(tx: SessionTx, marketCode: string) {
  const market = await tx.market.findUnique({
    where: { code: marketCode },
    select: { currency: true, shippableCountries: true, isActive: true },
  });
  if (!market) throw new SessionException("MARKET_UNAVAILABLE", "마켓을 찾을 수 없습니다.");
  if (!market.isActive) throw new SessionException("MARKET_UNAVAILABLE", "마켓을 찾을 수 없습니다.");
  return market;
}

async function loadCartItems(tx: SessionTx, userId: string) {
  return tx.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      variantId: true,
      quantity: true,
      variant: {
        select: {
          id: true,
          stock: true,
          isActive: true,
          fulfillmentType: true,
          color: true,
          colorHex: true,
          length: true,
          curl: true,
          wigStyle: { select: { name: true, coverImageKey: true } },
        },
      },
    },
  });
}

async function buildLines(
  tx: SessionTx,
  cartItems: CartRow[],
  marketCode: CreateCheckoutSessionInput["marketCode"],
  currencyCode: string,
): Promise<LineInput[]> {
  if (cartItems.length === 0) throw new SessionException("CART_EMPTY", "장바구니가 비어 있습니다.");

  const lines: LineInput[] = [];
  for (const item of cartItems) {
    lines.push(await buildLine(tx, item, marketCode, currencyCode));
  }
  return lines;
}

async function buildLine(
  tx: SessionTx,
  item: CartRow,
  marketCode: CreateCheckoutSessionInput["marketCode"],
  currencyCode: string,
): Promise<LineInput> {
  validateVariant(item);
  const price = await findMarketPrice(tx, item.variantId, marketCode);
  validateAmount(price.amount);
  return {
    variant: { connect: { id: item.variantId } },
    quantity: item.quantity,
    unitAmount: price.amount,
    fulfillmentType: item.variant.fulfillmentType,
    snapshotData: snapshotToJson(toSnapshot(item, currencyCode)),
  };
}

function validateVariant(item: CartRow): void {
  if (!item.variant.isActive) {
    throw new SessionException("VARIANT_UNAVAILABLE", "구매할 수 없는 옵션입니다.");
  }
  if (!Number.isInteger(item.quantity) || item.quantity < 1) {
    throw new SessionException("STOCK_INSUFFICIENT", "수량이 올바르지 않습니다.");
  }
  if (item.variant.stock < item.quantity) {
    throw new SessionException("STOCK_INSUFFICIENT", "재고가 부족합니다.");
  }
}

async function findMarketPrice(tx: SessionTx, variantId: string, marketCode: string) {
  const price = await tx.variantMarketPrice.findUnique({
    where: { variantId_marketCode: { variantId, marketCode } },
    select: { amount: true },
  });
  if (!price) throw new SessionException("VARIANT_PRICE_UNAVAILABLE", "현재 마켓 가격이 없습니다.");
  return price;
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

function sumLines(lines: LineInput[]): number {
  return lines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
}

async function createSession(
  tx: SessionTx,
  input: CreateCheckoutSessionInput,
  lines: LineInput[],
  subtotalAmount: number,
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
      currency,
      status: CheckoutSessionStatus.SUBMITTED,
      subtotalAmount,
      shippingAmount,
      totalAmount,
      expiresAt,
      submittedAt: now,
      lines: { create: lines },
      shipping: { create: toShippingCreate(input.shipping) },
    },
    select: { id: true, expiresAt: true, subtotalAmount: true, shippingAmount: true, totalAmount: true, currency: true },
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
    shippingAmount: created.shippingAmount,
    totalAmount: created.totalAmount,
    currency: created.currency,
  };
}
