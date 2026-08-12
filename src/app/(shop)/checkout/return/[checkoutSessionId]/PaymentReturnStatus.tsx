"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  isPaymentReturnStatus,
  isTerminalPaymentReturnStatus,
  type PaymentReturnStatus,
  type PaymentReturnViewStatus,
} from "@/lib/payment/return-status-contract";
import { observePaymentReturnStatus } from "./payment-return-polling";

interface PaymentReturnStatusProps {
  checkoutSessionId: string;
  initialStatus: PaymentReturnStatus;
}

export function PaymentReturnStatus({
  checkoutSessionId,
  initialStatus,
}: PaymentReturnStatusProps) {
  const [status, setStatus] = useState<PaymentReturnViewStatus>(initialStatus);

  useEffect(() => {
    if (isTerminalPaymentReturnStatus(initialStatus)) return;
    const controller = new AbortController();
    void observePaymentReturnStatus({
      initialStatus,
      readStatus: (signal) => readLocalPaymentStatus(checkoutSessionId, signal),
      onStatus: setStatus,
      signal: controller.signal,
    });
    return () => controller.abort();
  }, [checkoutSessionId, initialStatus]);

  return <PaymentReturnStatusView status={status} />;
}

export function PaymentReturnStatusView({ status }: { status: PaymentReturnViewStatus }) {
  if (status.kind === "SUCCEEDED") {
    return (
      <StatusPanel tone="success" title="결제가 완료되었습니다.">
        <p>로컬 결제 기록에서 주문 생성을 확인했습니다.</p>
        <Link href={`/orders/${status.orderId}`} className="font-medium underline underline-offset-4">
          주문 상세 보기
        </Link>
      </StatusPanel>
    );
  }
  if (status.kind === "FAILED") {
    return (
      <StatusPanel tone="failure" title="결제가 완료되지 않았습니다.">
        <p>로컬 결제 기록에서 이 결제 시도가 종료된 것을 확인했습니다.</p>
        <Link href="/checkout" className="font-medium underline underline-offset-4">
          체크아웃으로 돌아가기
        </Link>
      </StatusPanel>
    );
  }
  if (status.kind === "UNAVAILABLE") {
    return (
      <StatusPanel tone="neutral" title="결제 정보를 확인할 수 없습니다.">
        <p>요청한 결제 정보가 없거나 현재 계정에서 확인할 수 없습니다.</p>
        <Link href="/orders" className="font-medium underline underline-offset-4">
          내 주문 보기
        </Link>
      </StatusPanel>
    );
  }
  if (status.kind === "UNRESOLVED") {
    return (
      <StatusPanel tone="pending" title="결제 결과를 계속 확인해야 합니다.">
        <p>관찰 시간이 지났지만 로컬 결제 결과는 아직 확정되지 않았습니다. 결제 실패로 처리되지는 않았습니다.</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="font-medium underline underline-offset-4"
          >
            다시 확인하기
          </button>
          <Link href="/orders" className="font-medium underline underline-offset-4">
            내 주문 보기
          </Link>
        </div>
      </StatusPanel>
    );
  }
  return (
    <StatusPanel tone="pending" title="결제 상태를 확인하고 있습니다.">
      <p>안전하게 로컬 결제 기록을 확인하는 중입니다. 이 화면에서 새 결제를 시작하지 않습니다.</p>
    </StatusPanel>
  );
}

function StatusPanel({
  tone,
  title,
  children,
}: {
  tone: "success" | "failure" | "pending" | "neutral";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass = {
    success: "border-green-200 bg-green-50 text-green-900",
    failure: "border-red-200 bg-red-50 text-red-900",
    pending: "border-amber-200 bg-amber-50 text-amber-900",
    neutral: "border-gray-200 bg-white text-gray-900",
  }[tone];
  return (
    <section
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`space-y-3 rounded-lg border p-6 ${toneClass}`}
    >
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="space-y-3 text-sm">{children}</div>
    </section>
  );
}

async function readLocalPaymentStatus(
  checkoutSessionId: string,
  signal: AbortSignal,
): Promise<PaymentReturnStatus> {
  const response = await fetch(`/api/payments/status/${encodeURIComponent(checkoutSessionId)}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const body: unknown = await response.json();
  if (isPaymentReturnStatus(body)) return body;
  throw new Error("Local payment status response is invalid.");
}
