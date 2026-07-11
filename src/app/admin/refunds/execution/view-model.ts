import {
  OrderStatus,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
} from "@prisma/client";
import { CURRENCY_META, formatPrice } from "@/lib/market/types";
import {
  REFUND_EXECUTION_WORKLIST_DEFAULT_PAGE_SIZE,
  type RefundExecutionLeaseState,
  type RefundExecutionWorklistResult,
} from "@/lib/payment/refund/admin/execution-worklist";

const DIAGNOSTIC_MESSAGE_MAX_CODE_POINTS = 120;

export const COMMAND_STATUS_OPTIONS = [
  [RefundExecutionCommandStatus.READY, "실행 대기"],
  [RefundExecutionCommandStatus.LEASED, "처리 주체 할당됨"],
  [RefundExecutionCommandStatus.WAITING_EVIDENCE, "결과 확인 대기"],
  [RefundExecutionCommandStatus.WAITING_RETRY, "재시도 정책 확인 필요"],
  [RefundExecutionCommandStatus.PARKED, "운영 확인 필요"],
  [RefundExecutionCommandStatus.DONE, "처리 기록 완료"],
] as const;

export const LEASE_STATE_OPTIONS: readonly [RefundExecutionLeaseState, string][] = [
  ["all", "전체 리스 상태"],
  ["active", "할당 활성"],
  ["deadline-passed", "기한 경과"],
];

export interface RefundExecutionWorklistViewModel {
  rows: readonly RefundExecutionWorklistViewRow[];
  filters: {
    status: string;
    leaseState: RefundExecutionLeaseState;
    orderId: string;
    pageSize: string;
  };
  nextHref: string | null;
}

interface RefundExecutionWorklistViewRow {
  renderKey: string;
  orderId: string;
  orderHref: string;
  refundAmount: string;
  commandStatus: string;
  attemptStatus: string;
  orderStatus: string;
  providerContext: string;
  dispatchAttempt: string;
  availableAt: string;
  leaseUntil: string;
  leaseState: string | null;
  createdAt: string;
  updatedAt: string;
  diagnostic: null | { code: string; message: string };
}

export function buildRefundExecutionWorklistViewModel(
  result: RefundExecutionWorklistResult,
): RefundExecutionWorklistViewModel {
  return {
    rows: result.rows.map((row, index) => ({
      renderKey: `${row.orderId}:${row.createdAt.toISOString()}:${index}`,
      orderId: row.orderId,
      orderHref: `/admin/orders/${encodeURIComponent(row.orderId)}`,
      refundAmount: formatMoney(row.refundAmount, row.currency),
      commandStatus: commandStatusLabel(row.commandStatus),
      attemptStatus: attemptStatusLabel(row.attemptStatus),
      orderStatus: orderStatusLabel(row.orderStatus),
      providerContext: `${row.provider} / ${row.mode}`,
      dispatchAttempt: String(row.dispatchAttempt),
      availableAt: formatDateTime(row.availableAt),
      leaseUntil: row.leaseUntil ? formatDateTime(row.leaseUntil) : "—",
      leaseState: leaseStateLabel(row.commandStatus, row.leaseUntil, row.leaseDeadlinePassed),
      createdAt: formatDateTime(row.createdAt),
      updatedAt: formatDateTime(row.updatedAt),
      diagnostic: buildDiagnostic(row.operationalDiagnosticCode, row.operationalDiagnosticMessage),
    })),
    filters: {
      status: result.filters.status ?? "",
      leaseState: result.filters.leaseState,
      orderId: result.filters.orderId ?? "",
      pageSize: String(result.filters.pageSize),
    },
    nextHref: result.nextCursor ? buildNextHref(result, result.nextCursor) : null,
  };
}

export function commandStatusLabel(status: RefundExecutionCommandStatus): string {
  return COMMAND_STATUS_OPTIONS.find(([value]) => value === status)?.[1] ?? "상태 확인 필요";
}

function attemptStatusLabel(status: RefundAttemptStatus): string {
  if (status === RefundAttemptStatus.REQUESTED) return "환불 요청됨";
  if (status === RefundAttemptStatus.PROCESSING) return "환불 처리 중";
  if (status === RefundAttemptStatus.SUCCEEDED) return "환불 완료";
  if (status === RefundAttemptStatus.FAILED_RETRYABLE) return "재시도 검토 필요";
  if (status === RefundAttemptStatus.FAILED_TERMINAL) return "환불 실패";
  if (status === RefundAttemptStatus.MANUAL_REVIEW) return "수동 확인 필요";
  if (status === RefundAttemptStatus.CANCELLED) return "요청 철회";
  return "상태 확인 필요";
}

function orderStatusLabel(status: OrderStatus): string {
  if (status === OrderStatus.PAID) return "결제 완료";
  if (status === OrderStatus.CANCELLED) return "주문 취소";
  if (status === OrderStatus.REFUND_PENDING) return "환불 요청 접수";
  if (status === OrderStatus.PARTIALLY_REFUNDED) return "부분 환불";
  if (status === OrderStatus.REFUNDED) return "환불 완료";
  return "상태 확인 필요";
}

function leaseStateLabel(
  status: RefundExecutionCommandStatus,
  leaseUntil: Date | null,
  deadlinePassed: boolean,
): string | null {
  if (deadlinePassed) return "리스 기한 경과 · 조사 필요";
  if (status === RefundExecutionCommandStatus.LEASED && leaseUntil) return "리스 활성";
  return null;
}

function buildDiagnostic(code: string | null, message: string | null) {
  if (code === null && message === null) return null;
  return {
    code: code ?? "—",
    message: message ? truncateCodePoints(message, DIAGNOSTIC_MESSAGE_MAX_CODE_POINTS) : "—",
  };
}

export function truncateCodePoints(value: string, maximum: number): string {
  const points = Array.from(value);
  return points.length <= maximum ? value : `${points.slice(0, maximum).join("")}…`;
}

function buildNextHref(result: RefundExecutionWorklistResult, cursor: string): string {
  const params = new URLSearchParams();
  if (result.filters.status) params.set("status", result.filters.status);
  if (result.filters.leaseState !== "all") params.set("leaseState", result.filters.leaseState);
  if (result.filters.orderId) params.set("orderId", result.filters.orderId);
  if (result.filters.pageSize !== REFUND_EXECUTION_WORKLIST_DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(result.filters.pageSize));
  }
  params.set("cursor", cursor);
  return `/admin/refunds/execution?${params.toString()}`;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatMoney(amount: number, currency: string): string {
  const meta = CURRENCY_META[currency];
  return meta ? formatPrice(amount, meta) : `${amount.toLocaleString("ko-KR")} ${currency}`;
}
