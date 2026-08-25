"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recoverCheckoutPayment } from "@/app/actions/payment";
import type { Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";

export function CheckoutRecoveryControl({
  checkoutSessionId,
  paymentId,
  locale,
}: {
  checkoutSessionId: string;
  paymentId: string;
  locale: Locale;
}) {
  const messages = messagesFor(locale).checkout;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<"OBSERVED" | "UNKNOWN" | "UNAVAILABLE" | null>(null);

  function recover() {
    if (pending) return;
    setFailure(null);
    startTransition(async () => {
      const result = await recoverCheckoutPayment(checkoutSessionId, paymentId);
      if (result.success) {
        router.refresh();
        return;
      }
      if (result.kind === "TRANSACTION_OBSERVED") setFailure("OBSERVED");
      else if (result.kind === "OUTCOME_UNKNOWN") setFailure("UNKNOWN");
      else setFailure("UNAVAILABLE");
    });
  }

  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50 p-5"
      data-resume-disposition="PAYMENT_RECOVERY_AVAILABLE"
    >
      <h2 className="text-base font-semibold text-amber-950">{messages.recoveryTitle}</h2>
      <p className="mt-2 text-sm text-amber-900">{messages.recoveryDescription}</p>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        onClick={recover}
        className="mt-4 w-full rounded-lg bg-amber-900 px-4 py-3 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-300"
      >
        {pending ? messages.recoveryChecking : messages.recoveryAction}
      </button>
      {failure && (
        <p className="mt-3 text-sm text-amber-950" role="alert">
          {failure === "OBSERVED"
            ? messages.recoveryObserved
            : failure === "UNKNOWN"
              ? messages.recoveryUnknown
              : messages.recoveryUnavailable}
        </p>
      )}
    </section>
  );
}
