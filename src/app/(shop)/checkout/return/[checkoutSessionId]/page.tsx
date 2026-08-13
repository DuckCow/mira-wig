import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readPaymentReturnStatus } from "@/lib/payment/return-status";
import type { PaymentReturnStatus as PaymentReturnStatusModel } from "@/lib/payment/return-status-contract";
import { getSession } from "@/lib/session";
import { PaymentReturnStatus } from "./PaymentReturnStatus";

type PageParams = Promise<{ checkoutSessionId: string }>;

const UNAVAILABLE: PaymentReturnStatusModel = { kind: "UNAVAILABLE" };

export const metadata = { title: "결제 상태 확인" };

export default async function PaymentReturnPage({ params }: { params: PageParams }) {
  const { checkoutSessionId } = await params;
  const session = await getSession();
  if (!session?.user.id) redirect(loginPath(checkoutSessionId));

  const initialStatus = await readPaymentReturnStatus(db, {
    checkoutSessionId,
    userId: session.user.id,
  });

  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <Link href="/orders" className="text-sm text-gray-500 hover:text-gray-900">
        ← 내 주문
      </Link>
      <PaymentReturnStatus
        checkoutSessionId={checkoutSessionId}
        initialStatus={initialStatus ?? UNAVAILABLE}
      />
    </main>
  );
}

function loginPath(checkoutSessionId: string): string {
  const callbackUrl = `/checkout/return/${encodeURIComponent(checkoutSessionId)}`;
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}
