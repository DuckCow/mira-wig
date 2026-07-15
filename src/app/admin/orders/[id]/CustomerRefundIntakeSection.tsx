import { Card } from "@/components/ui/Card";
import type { AdminCustomerRefundIntakeDetail } from "./admin-order-detail-data";
import { CustomerRefundIntakeReviewControls } from "./CustomerRefundIntakeReviewControls";
import {
  buildCustomerRefundIntakeSectionViewModel,
  type CustomerRefundIntakeApproveState,
} from "./customer-intake-presentation";

interface Props {
  orderId: string;
  intakes: readonly AdminCustomerRefundIntakeDetail[];
  approveState: CustomerRefundIntakeApproveState;
  currency: string;
  remainingRequestableAmount: string;
}

export function CustomerRefundIntakeSection({
  orderId,
  intakes,
  approveState,
  currency,
  remainingRequestableAmount,
}: Props) {
  const view = buildCustomerRefundIntakeSectionViewModel(intakes);
  return (
    <section id="customer-refund-intakes" className="scroll-mt-6">
      <Card title="고객 환불 검토 요청">
        {view.rows.length === 0 ? (
          <p className="text-sm text-gray-500">고객 환불 검토 요청 내역이 없습니다.</p>
        ) : (
          <>
            {view.activeIntake ? (
              <CustomerRefundIntakeReviewControls
                orderId={orderId}
                intakeId={view.activeIntake.intakeId}
                ownershipConsistent={view.activeIntake.ownershipConsistent}
                approveState={approveState}
                currency={currency}
                remainingRequestableAmount={remainingRequestableAmount}
              />
            ) : null}
            <h3 className={`${view.activeIntake ? "mt-8" : ""} text-sm font-semibold text-gray-900`}>
              요청 내역
            </h3>
            <ol className="mt-3 divide-y divide-gray-100">
              {view.rows.map((row) => (
                <li key={row.renderKey} className="space-y-3 py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-gray-900">{row.statusLabel}</p>
                      <p className="mt-1 text-sm text-gray-700">{row.reasonLabel}</p>
                    </div>
                    <p className="text-xs text-gray-500">접수 {row.submittedAt}</p>
                  </div>
                  {row.reasonDetail ? (
                    <p className="whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm text-gray-700">
                      {row.reasonDetail}
                    </p>
                  ) : null}
                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {row.withdrawnAt ? <Info label="철회 시각" value={row.withdrawnAt} /> : null}
                    {row.reviewedAt ? <Info label="검토 시각" value={row.reviewedAt} /> : null}
                    {row.adminRejectionReason ? (
                      <Info label="관리자 거절 사유" value={row.adminRejectionReason} />
                    ) : null}
                    {row.approvedRefundAttemptId ? (
                      <Info label="연결 환불 요청 ID" value={row.approvedRefundAttemptId} mono />
                    ) : null}
                  </dl>
                  {row.approvedCopy ? <p className="text-sm text-blue-800">{row.approvedCopy}</p> : null}
                  {row.approvedRefundAttempt ? (
                    <dl className="grid gap-3 rounded border border-gray-200 p-3 text-sm sm:grid-cols-3">
                      <Info label="환불 요청 상태" value={row.approvedRefundAttempt.statusLabel} />
                      <Info label="환불 요청 금액" value={row.approvedRefundAttempt.amount} />
                      <Info label="환불 요청 시각" value={row.approvedRefundAttempt.requestedAt} />
                    </dl>
                  ) : null}
                  {row.missingApprovedAttemptWarning ? (
                    <p className="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {row.missingApprovedAttemptWarning}
                    </p>
                  ) : null}
                  {row.ownershipWarning ? (
                    <p className="border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      {row.ownershipWarning}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </section>
  );
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className={`mt-1 break-words text-gray-900 ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
