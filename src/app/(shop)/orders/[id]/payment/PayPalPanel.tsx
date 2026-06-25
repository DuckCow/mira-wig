"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { capturePayPalOrderAction, type PayOrderResult } from "@/app/actions/payment";

type PendingPayOrderResult = Extract<PayOrderResult, { status: "pending" }>;
type PanelStatus = "loading" | "ready" | "capturing" | "processing";
type PayPalApproveData = { orderID?: string };
type PayPalButtons = { isEligible: () => boolean; render: (selector: string) => Promise<void> };
type PayPalButtonsOptions = {
  createOrder: () => string | Promise<string>;
  fundingSource?: string;
  onApprove: (data: PayPalApproveData) => void | Promise<void>;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
  style?: { layout?: "vertical"; color?: "gold"; shape?: "rect"; label?: "paypal" };
};
type PayPalNamespace = {
  Buttons: (options: PayPalButtonsOptions) => PayPalButtons;
  FUNDING: { PAYPAL: string };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

interface PayPalPanelProps {
  result: PendingPayOrderResult;
}

const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

function sdkUrl(currency: string): string {
  const params = new URLSearchParams({
    "client-id": PAYPAL_CLIENT_ID,
    components: "buttons,funding-eligibility",
    currency,
    intent: "capture",
    commit: "true",
    "disable-funding": "card,credit,paylater",
  });
  return `https://www.paypal.com/sdk/js?${params.toString()}`;
}

function buttonContainerId(orderId: string): string {
  return `paypal-button-container-${orderId}`;
}

export function PayPalPanel({ result }: PayPalPanelProps) {
  const router = useRouter();
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<PanelStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const paypalOrderId = result.providerTransactionId;
  const containerId = useMemo(() => buttonContainerId(result.orderId), [result.orderId]);

  useEffect(() => {
    if (!sdkReady || !paypalOrderId) return undefined;
    const paypal = window.paypal;
    if (!paypal) {
      setError("PayPal 결제창을 불러오지 못했습니다.");
      return undefined;
    }
    setStatus("ready");
    const buttons = paypal.Buttons({
      createOrder: () => paypalOrderId,
      fundingSource: paypal.FUNDING.PAYPAL,
      onApprove: async (data) => {
        if (!data.orderID || data.orderID !== paypalOrderId) {
          setError("PayPal 승인 정보가 주문과 일치하지 않습니다.");
          return;
        }
        setStatus("capturing");
        const capture = await capturePayPalOrderAction({ orderId: result.orderId, paypalOrderId: data.orderID });
        if (capture.status === "success") {
          router.push(`/orders/${capture.orderId}`);
          return;
        }
        if (capture.status === "unconfirmed") {
          setStatus("processing");
          setError(capture.error);
          return;
        }
        setStatus("ready");
        setError(capture.error);
      },
      onCancel: () => {
        setStatus("ready");
        setError("PayPal 결제가 취소되었습니다.");
      },
      onError: (paypalError) => {
        console.error("PAYPAL_BUTTON_ERROR", paypalError);
        setStatus("ready");
        setError("PayPal 결제창 오류가 발생했습니다.");
      },
      style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
    });
    if (!buttons.isEligible()) {
      setError("PayPal 계정 결제를 사용할 수 없습니다.");
      return undefined;
    }
    void buttons.render(`#${containerId}`).catch((renderError: unknown) => {
      console.error("PAYPAL_BUTTON_RENDER_ERROR", renderError);
      setError("PayPal 결제 버튼을 표시하지 못했습니다.");
    });
    return () => {
      const container = document.getElementById(containerId);
      if (container) container.innerHTML = "";
    };
  }, [containerId, paypalOrderId, result.orderId, router, sdkReady]);

  if (!PAYPAL_CLIENT_ID) {
    return <p role="alert" className="text-sm text-red-500">PayPal 클라이언트 키가 설정되지 않았습니다.</p>;
  }
  if (!paypalOrderId) {
    return <p role="alert" className="text-sm text-red-500">PayPal 주문 ID가 없습니다.</p>;
  }

  const busy = status === "loading" || status === "capturing";
  return (
    <div className="space-y-3" aria-busy={busy}>
      <Script
        id={`paypal-sdk-${result.currency}`}
        src={sdkUrl(result.currency)}
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
        onError={() => setError("PayPal SDK를 불러오지 못했습니다.")}
      />
      {status === "loading" && <p role="status" className="text-sm text-gray-600">PayPal 결제 준비 중</p>}
      {status === "capturing" && <p role="status" className="text-sm text-gray-600">PayPal 결제 승인 중</p>}
      {status === "processing" && <p role="status" className="text-sm text-amber-600">결제 처리 중입니다. 다시 시도하지 마세요.</p>}
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      {status !== "processing" && <div id={containerId} className="min-h-12" />}
    </div>
  );
}
