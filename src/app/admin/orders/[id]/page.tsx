import Link from "next/link";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { requireAdmin } from "@/lib/admin";
import {
  CustomerRefundIntakeActivationConfigError,
  isCustomerRefundIntakeApproveEnabled,
} from "@/lib/payment/refund/customer-intake-activation";
import {
  isRefundExecutionClaimEnabled,
  RefundExecutionActivationConfigError,
} from "@/lib/payment/refund/execution-activation";
import {
  loadAdminOrderDetail,
  type AdminOrderDetailReadModel,
} from "./admin-order-detail-data";
import { CustomerRefundIntakeSection } from "./CustomerRefundIntakeSection";
import type { CustomerRefundIntakeApproveState } from "./customer-intake-presentation";
import { RefundExecutionClaimControl } from "./RefundExecutionClaimControl";
import { RefundRequestCloseControl } from "./RefundRequestCloseControl";
import type { RefundExecutionClaimActivationState } from "./refund-claim-presentation";
import {
  isMtoProductionStartEnabled,
  OrderCancellationActivationConfigError,
} from "@/lib/order-cancellation/activation";
import { ProductionStartControl } from "./ProductionStartControl";
import { CancellationRefundReplacementControl } from "./CancellationRefundReplacementControl";

type Params = Promise<{ id: string }>;
type Detail = AdminOrderDetailReadModel;

export const metadata = { title: "관리자 주문 상세" };

export default async function AdminOrderDetailPage({ params }: { params: Params }) {
  const guard = await requireAdmin();
  if (!guard.success) redirect("/");

  const { id } = await params;
  const order = await loadAdminOrderDetail(id, resolveClaimState());
  if (!order) notFound();
  const approveState = order.customerRefundIntakes.some((intake) => intake.status === "SUBMITTED")
    ? resolveApproveState()
    : "disabled";

  return (
    <AdminOrderDetailView
      order={order}
      approveState={approveState}
      productionStartEnabled={resolveProductionStartEnabled()}
    />
  );
}

export function AdminOrderDetailView({
  order,
  approveState,
  productionStartEnabled = false,
}: {
  order: Detail;
  approveState: CustomerRefundIntakeApproveState;
  productionStartEnabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      <Link href="/admin/orders" className="text-sm text-gray-500 hover:text-gray-900">
        ← 주문 목록
      </Link>
      <OrderHeader order={order} />
      <CancellationSummary order={order} />
      <CustomerSummary order={order} />
      <OrderItems orderId={order.id} items={order.items} productionStartEnabled={productionStartEnabled} />
      <ShippingSummary shipping={order.shipping} />
      <PaymentSummary order={order} />
      <RefundReview review={order.refundReview} />
      <CustomerRefundIntakeSection
        orderId={order.id}
        intakes={order.customerRefundIntakes}
        approveState={approveState}
        currency={order.currency}
        remainingRequestableAmount={order.refundReview.remainingRequestableAmount}
        items={order.items}
      />
      <RefundLedger orderId={order.id} attempts={order.refundAttempts} />
      <FulfillmentPolicyNote />
    </div>
  );
}

export function resolveApproveState(): CustomerRefundIntakeApproveState {
  try {
    return isCustomerRefundIntakeApproveEnabled() ? "enabled" : "disabled";
  } catch (error) {
    if (error instanceof CustomerRefundIntakeActivationConfigError) return "misconfigured";
    throw error;
  }
}

export function resolveClaimState(): RefundExecutionClaimActivationState {
  try {
    return isRefundExecutionClaimEnabled() ? "enabled" : "disabled";
  } catch (error) {
    if (error instanceof RefundExecutionActivationConfigError) return "misconfigured";
    throw error;
  }
}

export function resolveProductionStartEnabled(): boolean {
  try {
    return isMtoProductionStartEnabled();
  } catch (error) {
    if (error instanceof OrderCancellationActivationConfigError) return false;
    throw error;
  }
}

function CancellationSummary({ order }: { order: Detail }) {
  const cancellation = order.cancellation;
  if (!cancellation) return null;
  return (
    <Card title="주문 취소">
      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        {cancellation.obligationState === "INCONSISTENT"
          ? "환불 원장 확인 필요. 수동 검토가 필요합니다."
          : cancellation.obligationState === "OUTSTANDING"
            ? "주문 취소는 확정되었고 환불 의무가 아직 남아 있습니다."
            : "주문 취소와 전체 환불이 완료되었습니다."}
      </div>
      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Info label="취소 접수" value={cancellation.acceptedAt} />
        <Info label="요청 고객" value={cancellation.requestedBy} />
        <Info label="요청 고객 ID" value={cancellation.requestedByUserId} mono />
        <Info label="초기 환불 요청" value={cancellation.initialRefundAttemptId} mono />
        <Info label="취소 환불 의무" value={cancellation.capturedObligation} />
        <Info label="환불 완료 금액" value={cancellation.succeededAmount} />
        <Info label="미해결 금액" value={cancellation.outstandingAmount} />
      </dl>
      {cancellation.canReplaceRefund ? (
        <CancellationRefundReplacementControl orderId={order.id} requestKey={randomUUID()} />
      ) : null}
    </Card>
  );
}

function OrderHeader({ order }: { order: Detail }) {
  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">주문 상세</h1>
          <p className="mt-1 font-mono text-xs text-gray-500">주문번호: {order.id}</p>
        </div>
        <span className="rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white">
          {order.statusLabel}
        </span>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <Info label="결제일" value={order.paidAt} />
        <Info label="생성일" value={order.createdAt} />
        <Info label="최종 변경" value={order.updatedAt} />
      </dl>
    </header>
  );
}

function CustomerSummary({ order }: { order: Detail }) {
  return (
    <Card title="고객 정보">
      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <Info label="이름" value={order.customer.name} />
        <Info label="이메일" value={order.customer.email} />
        <Info label="고객 ID" value={order.customer.id} mono />
      </dl>
    </Card>
  );
}

function OrderItems({
  orderId,
  items,
  productionStartEnabled,
}: {
  orderId: string;
  items: Detail["items"];
  productionStartEnabled: boolean;
}) {
  return (
    <Card title="주문 상품">
      <ul className="divide-y divide-gray-100">
        {items.map((item) => (
          <li key={item.id} className="grid gap-4 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-gray-900">{item.name}</p>
              <p className="text-sm text-gray-500">{item.options}</p>
              <p className="text-xs text-gray-500">{item.fulfillment} · {item.mrStatus}</p>
              <p className="text-xs text-gray-400">
                제작 요청 {item.mrCreatedAt} · 시작 {item.mrStartedAt} · 변경 {item.mrUpdatedAt}
              </p>
              {productionStartEnabled && item.canStartProduction ? (
                <ProductionStartControl
                  orderId={orderId}
                  orderItemId={item.id}
                  requestKey={randomUUID()}
                />
              ) : null}
            </div>
            <div className="text-left text-sm sm:text-right">
              <p className="font-semibold text-gray-900">{item.lineTotal}</p>
              <p className="mt-1 text-xs text-gray-500">{item.unitAmount} × {item.quantity}</p>
              <p className="mt-1 text-xs text-gray-500">
                환불 수량 귀속 가능: {item.remainingAttributableQuantity ?? "확인 필요"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ShippingSummary({ shipping }: { shipping: Detail["shipping"] }) {
  return (
    <Card title="배송 스냅샷">
      {!shipping ? <p className="text-sm text-gray-500">배송지 정보 확인 중</p> : (
        <div className="space-y-2 text-sm text-gray-600">
          <p className="font-medium text-gray-900">{shipping.recipientName}</p>
          <p>{shipping.phone}</p>
          <p>
            [{shipping.postalCode}] {shipping.country} {shipping.administrativeArea} {shipping.city}{" "}
            {shipping.addressLine1}{shipping.addressLine2 ? ` ${shipping.addressLine2}` : ""}
          </p>
          {shipping.memo ? <p className="text-xs text-gray-500">배송 메모: {shipping.memo}</p> : null}
          <p className="text-xs text-gray-400">배송 정보 변경 {shipping.updatedAt}</p>
        </div>
      )}
    </Card>
  );
}

function PaymentSummary({ order }: { order: Detail }) {
  const payment = order.payment;
  return (
    <Card title="결제 요약">
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Info label="결제 ID" value={payment.id} mono />
        <Info label="결제 상태" value={payment.status} />
        <Info label="결제 금액" value={payment.amount} />
        <Info label="제공자 / 모드" value={payment.providerContext} />
        <Info label="결제 생성" value={payment.createdAt} />
        <Info label="결제 변경" value={payment.updatedAt} />
        <Info label="상품 합계" value={order.amounts.subtotal} />
        <Info label="배송비" value={order.amounts.shipping} />
        <Info label="주문 합계" value={order.amounts.total} />
        <Info label="마켓 / 통화" value={`${order.marketCode} / ${order.currency}`} />
      </dl>
    </Card>
  );
}

function RefundReview({ review }: { review: Detail["refundReview"] }) {
  return (
    <Card title="환불 검토 요약">
      <p className="mb-4 text-sm text-amber-700">
        환불 실행 버튼은 아직 연결되지 않았습니다. 아래 정보는 운영 검토용입니다.
      </p>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <Info label="주문 합계" value={review.orderTotal} />
        <Info label="결제 금액" value={review.paymentAmount} />
        <Info label="환불 완료 금액" value={review.succeededAmount} />
        <Info label="보호·예약 금액" value={review.guardedAmount} />
        <Info label="남은 환불 가능 금액" value={review.remainingRefundableAmount} />
        <Info label="남은 요청 가능 금액" value={review.remainingRequestableAmount} />
        <Info label="진행 중 요청" value={review.openAttempt} />
        <Info label="금액 보호 상태" value={review.guardedAttempt} />
        <Info label="결제 상태" value={review.paymentStatus} />
        <Info label="실행 참조" value={review.executionReference} />
        <Info label="결제 정합성" value={review.paymentIdentityMatch} />
        <Info label="주문 상태 검토" value={review.orderStatusRefundable} />
        <Info label="분쟁 검토" value={review.disputeReview} />
      </dl>
    </Card>
  );
}

function RefundLedger({ orderId, attempts }: { orderId: string; attempts: Detail["refundAttempts"] }) {
  return (
    <Card title="환불 요청 내역">
      {attempts.length === 0 ? <p className="text-sm text-gray-500">환불 요청 내역이 없습니다.</p> : (
        <ol className="divide-y divide-gray-100">
          {attempts.map((attempt) => (
            <li key={`${attempt.shortId}-${attempt.requestedAt}`} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-gray-400">환불 #{attempt.shortId}</p>
                  <p className="mt-1 font-medium text-gray-900">{attempt.status}</p>
                </div>
                <p className="font-semibold text-gray-900">{attempt.amount}</p>
              </div>
              <p className="text-sm text-gray-700">{attempt.reason}</p>
              <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <Info label="요청 주체" value={attempt.actor} />
                <Info label="요청 시각" value={attempt.requestedAt} />
                <Info label="제공자 / 모드" value={attempt.providerContext} />
                {attempt.processedAt ? <Info label="처리 시각" value={attempt.processedAt} /> : null}
                {attempt.failedAt ? <Info label="실패 시각" value={attempt.failedAt} /> : null}
              </dl>
              {attempt.safeFailureMessage ? (
                <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {attempt.safeFailureMessage}
                </p>
              ) : null}
              <RefundLineAttribution attribution={attempt.lineAttribution} />
              {attempt.closeWarning ? (
                <p className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {attempt.closeWarning}
                </p>
              ) : null}
              {attempt.canCloseRequest ? (
                <RefundRequestCloseControl orderId={orderId} refundAttemptId={attempt.refundAttemptId} />
              ) : null}
              {attempt.claim.advisory ? (
                <p className="border-l-2 border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {attempt.claim.advisory}
                </p>
              ) : null}
              {attempt.claim.control ? (
                <RefundExecutionClaimControl orderId={orderId} target={attempt.claim.control} />
              ) : null}
              <RefundTransitionHistory history={attempt.transitionHistory} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function RefundLineAttribution({
  attribution,
}: {
  attribution: Detail["refundAttempts"][number]["lineAttribution"];
}) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
      <p className="font-medium text-gray-800">상품 수량 귀속</p>
      {attribution.emptyState ? <p className="mt-1 text-gray-600">{attribution.emptyState}</p> : (
        <ul className="mt-2 space-y-1 text-gray-700">
          {attribution.entries.map((line) => (
            <li key={line.orderItemId}>{line.itemName} · 수량 {line.quantity}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RefundTransitionHistory({
  history,
}: {
  history: Detail["refundAttempts"][number]["transitionHistory"];
}) {
  return (
    <div className="border-t border-gray-100 pt-3">
      <h4 className="text-xs font-medium text-gray-700">상태 변경 기록</h4>
      {history.emptyState ? <p className="mt-2 text-xs text-gray-500">{history.emptyState}</p> : (
        <ol className="mt-3 space-y-4">
          {history.entries.map((entry) => (
            <li key={entry.key} className="border-l-2 border-gray-200 pl-3">
              <p className="text-xs text-gray-400">{entry.timestamp}</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{entry.attemptStatusChange}</p>
              <p className="mt-1 text-xs text-gray-600">주문 상태: {entry.orderStatusChange}</p>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <Info label="작업 주체" value={entry.actor} />
                <Info label="기록 사유" value={entry.auditReason} />
              </dl>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function FulfillmentPolicyNote() {
  return (
    <Card title="제작·이행 정책">
      <p className="text-sm text-gray-600">제작 상태 정책 검토 필요</p>
      <p className="mt-2 text-xs text-gray-500">제작 상태는 환불 실행 가능 여부를 확정하지 않습니다.</p>
    </Card>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-1 break-words text-gray-900 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
