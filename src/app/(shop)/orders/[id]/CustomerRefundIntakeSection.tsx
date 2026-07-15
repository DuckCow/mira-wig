import { CustomerRefundIntakeStatus } from "@prisma/client";
import type { CustomerRefundIntakeReadModel } from "@/lib/payment/refund/customer-intake-read";
import { CustomerRefundIntakeControls } from "./CustomerRefundIntakeControls";
import {
  customerRefundIntakeAvailabilityCopy,
  customerRefundIntakeControlProps,
  customerRefundIntakeLifecycleCopy,
  customerRefundIntakeReasonLabel,
  customerRefundIntakeStatusLabel,
} from "./customer-intake-presentation";

export function CustomerRefundIntakeSection({ model }: { model: CustomerRefundIntakeReadModel }) {
  const latest = model.latestIntake;
  const controlProps = customerRefundIntakeControlProps(model);
  const availabilityCopy = customerRefundIntakeAvailabilityCopy(model.submissionUnavailableReason);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">환불 검토 요청</h2>
      <div className="mt-4 space-y-5">
        {latest ? <LatestIntake intake={latest} /> : model.canSubmit ? (
          <p className="text-sm text-gray-600">
            환불 가능 여부 검토를 요청할 수 있습니다. 요청만으로 환불 가능 여부나 금액은 확정되지 않습니다.
          </p>
        ) : null}

        {availabilityCopy ? <AvailabilityNotice lines={availabilityCopy} /> : null}

        {controlProps?.mode === "submit" ? (
          <div className={latest ? "border-t border-gray-200 pt-5" : ""}>
            <h3 className="text-sm font-semibold text-gray-900">
              {latest ? "새 환불 검토 요청" : "환불 검토 요청 접수"}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              접수 가능 여부는 요청 시점에 서버가 다시 확인합니다.
            </p>
            <CustomerRefundIntakeControls {...controlProps} />
          </div>
        ) : null}

        {controlProps?.mode === "withdraw" ? (
          <CustomerRefundIntakeControls {...controlProps} />
        ) : null}
      </div>
    </section>
  );
}

function LatestIntake({ intake }: { intake: NonNullable<CustomerRefundIntakeReadModel["latestIntake"]> }) {
  return (
    <article className="space-y-4">
      <div className="space-y-2">
        <p className="font-medium text-gray-900">{customerRefundIntakeStatusLabel(intake.status)}</p>
        <div className="space-y-1 text-sm text-gray-600">
          {customerRefundIntakeLifecycleCopy(intake.status).map((line) => <p key={line}>{line}</p>)}
        </div>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <Info label="요청 사유" value={customerRefundIntakeReasonLabel(intake.reasonCode)} />
        <Info label="접수 시각" value={formatDateTime(intake.submittedAt)} />
        {intake.status === CustomerRefundIntakeStatus.WITHDRAWN && intake.withdrawnAt ? (
          <Info label="철회 시각" value={formatDateTime(intake.withdrawnAt)} />
        ) : null}
      </dl>
      {intake.reasonDetail ? (
        <div>
          <p className="text-xs text-gray-500">요청 내용</p>
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

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
