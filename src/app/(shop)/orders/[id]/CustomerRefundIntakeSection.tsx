import { CustomerRefundIntakeStatus } from "@prisma/client";
import { LOCALE_INTL, type Locale } from "@/lib/market/locale";
import { messagesFor } from "@/lib/market/messages";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";
import { CustomerRefundIntakeControls } from "./CustomerRefundIntakeControls";
import {
  customerRefundIntakeAvailabilityCopy,
  customerRefundIntakeControlProps,
  customerRefundIntakeLifecycleCopy,
  customerRefundIntakeReasonLabel,
  customerRefundIntakeStatusLabel,
} from "./customer-intake-presentation";

export function CustomerRefundIntakeSection({ model, locale }: { model: CustomerRefundIntakeReadModel; locale: Locale }) {
  const latest = model.latestIntake;
  const controlProps = customerRefundIntakeControlProps(model);
  const messages = messagesFor(locale).order.intake;
  const availabilityCopy = customerRefundIntakeAvailabilityCopy(model.submissionUnavailableReason, locale);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">{messages.title}</h2>
      <div className="mt-4 space-y-5">
        {latest ? <LatestIntake intake={latest} locale={locale} /> : model.canSubmit ? (
          <p className="text-sm text-gray-600">{messages.intro}</p>
        ) : null}

        {availabilityCopy ? <AvailabilityNotice lines={availabilityCopy} /> : null}

        {controlProps?.mode === "submit" ? (
          <div className={latest ? "border-t border-gray-200 pt-5" : ""}>
            <h3 className="text-sm font-semibold text-gray-900">
              {latest ? messages.newRequest : messages.submitTitle}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              {messages.serverRecheck}
            </p>
            <CustomerRefundIntakeControls {...controlProps} locale={locale} />
          </div>
        ) : null}

        {controlProps?.mode === "withdraw" ? (
          <CustomerRefundIntakeControls {...controlProps} locale={locale} />
        ) : null}
      </div>
    </section>
  );
}

function LatestIntake({ intake, locale }: { intake: NonNullable<CustomerRefundIntakeReadModel["latestIntake"]>; locale: Locale }) {
  const messages = messagesFor(locale).order.intake;
  return (
    <article className="space-y-4">
      <div className="space-y-2">
        <p className="font-medium text-gray-900">{customerRefundIntakeStatusLabel(intake.status, locale)}</p>
        <div className="space-y-1 text-sm text-gray-600">
          {customerRefundIntakeLifecycleCopy(intake.status, locale).map((line) => <p key={line}>{line}</p>)}
        </div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label={messages.reason} value={customerRefundIntakeReasonLabel(intake.reasonCode, locale)} />
        <Info label={messages.submittedAt} value={formatDateTime(intake.submittedAt, locale)} />
        {intake.status === CustomerRefundIntakeStatus.WITHDRAWN && intake.withdrawnAt ? (
          <Info label={messages.withdrawnAt} value={formatDateTime(intake.withdrawnAt, locale)} />
        ) : null}
      </dl>
      {intake.reasonDetail ? (
        <div>
          <p className="text-xs text-gray-500">{messages.detail}</p>
          <p className="mt-1 whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm text-gray-700">
            {intake.reasonDetail}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function AvailabilityNotice({ lines }: { lines: readonly string[] }) {
  return (
    <div className="border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {lines.map((line) => <p key={line}>{line}</p>)}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-1 text-gray-900">{value}</dd>
    </div>
  );
}

function formatDateTime(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_INTL[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
