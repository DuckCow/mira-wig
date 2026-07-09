import { CURRENCY_META, formatPrice, type CurrencyMeta } from "@/lib/market/types";
import type { CreateCheckoutSessionResult } from "@/lib/payment/session/types";

export interface CheckoutCartItem {
  id: string;
  styleName: string;
  optionLabel: string;
  quantity: number;
  unitAmount: number;
  lineSubtotal: number;
}

export function CartSnapshot({
  cartItems,
  subtotal,
  currency,
}: {
  cartItems: CheckoutCartItem[];
  subtotal: number;
  currency: CurrencyMeta;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">주문 상품</h2>
      <ul className="mt-4 divide-y divide-gray-100">
        {cartItems.map((item) => (
          <li key={item.id} className="py-3 text-sm">
            <CartItemRow item={item} currency={currency} />
          </li>
        ))}
      </ul>
      <SummaryRow label="상품 합계" value={formatPrice(subtotal, currency)} strong />
      <p className="mt-2 text-xs text-gray-500">
        장바구니 상품 합계입니다. 배송비·세금·관세는 결제 준비 단계에서 확정되지 않았습니다.
      </p>
    </section>
  );
}

export function SessionSnapshot({
  session,
  fallbackCurrency,
}: {
  session: CreateCheckoutSessionResult;
  fallbackCurrency: CurrencyMeta;
}) {
  const sessionCurrency = CURRENCY_META[session.currency] ?? fallbackCurrency;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">주문서 스냅샷</h2>
      <div className="mt-4 space-y-3">
        <SummaryRow label="상품 합계" value={formatPrice(session.subtotalAmount, sessionCurrency)} />
        <SummaryRow label="배송비" value={shippingLabel(session, sessionCurrency)} />
        <SummaryRow label="세금·관세" value="정책 확정 전 - 금액으로 계산하지 않았습니다." />
        <SummaryRow label="총 결제 예정 금액" value={formatPrice(session.totalAmount, sessionCurrency)} strong />
      </div>
      <p className="mt-3 text-xs text-gray-500">
        아래 결제는 방금 생성한 주문서 스냅샷 기준입니다. 배송지를 수정하면 주문서를 다시 생성해 주세요.
      </p>
    </section>
  );
}

function CartItemRow({ item, currency }: { item: CheckoutCartItem; currency: CurrencyMeta }) {
  return (
    <>
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium text-gray-900">{item.styleName}</p>
          <p className="mt-1 text-xs text-gray-500">{item.optionLabel}</p>
        </div>
        <p className="shrink-0 font-medium text-gray-900">{formatPrice(item.lineSubtotal, currency)}</p>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        {formatPrice(item.unitAmount, currency)} × {item.quantity}
      </p>
    </>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 text-sm ${strong ? "font-semibold text-gray-900" : "text-gray-600"}`}>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function shippingLabel(session: CreateCheckoutSessionResult, currency: CurrencyMeta): string {
  return `${formatPrice(session.shippingAmount, currency)} · 배송비 정책 확정 전`;
}
