"use client";

import { useState } from "react";
import {
  issueRefundExecutionAuthorizationAction, readRefundExecutionAuthorizationsAction,
  revokeRefundExecutionAuthorizationAction,
} from "@/app/actions/admin/refund-execution-authorization";
import { formatPersistedMoney } from "@/lib/market/persisted-money";

type Inspection = Extract<Awaited<ReturnType<typeof readRefundExecutionAuthorizationsAction>>, { success: true }>["data"];

export function AuthorizationPanel() {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [requestId, setRequestId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function inspect(form: FormData) {
    setPending(true);
    try {
      const result = await readRefundExecutionAuthorizationsAction({ commandId: form.get("commandId") });
      if (!result.success) { setMessage(result.errorCode); return; }
      setInspection(result.data);
      setRequestId(crypto.randomUUID());
      setMessage("");
    } finally { setPending(false); }
  }

  async function issue(form: FormData) {
    if (!inspection) return;
    setPending(true);
    try {
      const result = await issueRefundExecutionAuthorizationAction({
        commandId: inspection.target.commandId, issuanceRequestId: requestId,
        expectedPredecessorGeneration: inspection.target.generation,
        confirmedTargetBindingDigest: inspection.target.targetBindingDigest,
        releasePolicyDigest: form.get("releasePolicyDigest"),
      });
      setMessage(result.success ? `승인 기록: ${result.data.id} · ${result.data.state}` : result.errorCode);
      await refresh();
    } finally { setPending(false); }
  }

  async function refresh() {
    if (!inspection) return;
    const result = await readRefundExecutionAuthorizationsAction({ commandId: inspection.target.commandId });
    if (result.success) setInspection(result.data);
    else setMessage(result.errorCode);
  }

  async function revoke(form: FormData) {
    setPending(true);
    try {
      const result = await revokeRefundExecutionAuthorizationAction({ grantId: form.get("grantId") });
      setMessage(result.success ? "미사용 승인을 취소했습니다." : result.errorCode);
      await refresh();
    } finally { setPending(false); }
  }

  return <section className="space-y-4 rounded border border-gray-200 bg-white p-5">
    <h2 className="font-semibold">재진입 실행 승인</h2>
    <p className="text-sm text-gray-600">승인은 다음 실행의 범위를 정합니다. 이미 소비된 실행은 여기서 취소할 수 없습니다.</p>
    <form action={inspect} className="flex gap-3">
      <input name="commandId" required aria-label="실행 명령 ID" placeholder="실행 명령 ID" className="min-w-0 flex-1 border p-2" />
      <button disabled={pending} className="border px-4 py-2">조회</button>
    </form>
    {inspection ? <>
      <p className="text-sm">{formatPersistedMoney(inspection.target.amount, inspection.target.currency)} · generation {inspection.target.generation} · {inspection.target.status}</p>
      <p className="break-all font-mono text-xs">대상 확인값: {inspection.target.targetBindingDigest ?? "기존 승인 없음"}</p>
      <form action={issue} className="flex flex-wrap gap-3">
        <input name="releasePolicyDigest" required pattern="[0-9a-f]{64}" aria-label="검토된 release 확인값" placeholder="검토된 release 확인값" className="min-w-0 flex-1 border p-2" />
        <button disabled={pending || !inspection.target.targetBindingDigest} className="border px-4 py-2">30분 유효 승인 발급</button>
      </form>
      <p className="text-xs text-gray-500">발급 요청 ID: {requestId}</p>
      <button type="button" disabled={pending} className="border px-3 py-1 text-sm" onClick={() => {
        setRequestId(crypto.randomUUID()); setMessage("새 발급 요청을 준비했습니다. 미사용 기존 승인을 먼저 취소한 후 발급하세요.");
      }}>새 발급 요청 준비</button>
      <ul className="space-y-3 text-sm">{inspection.grants.map((grant) => <li key={grant.id} className="border-t pt-3">
        <p className="break-all">{grant.id} · {grant.state} · generation {grant.expectedPredecessorGeneration} → {grant.expectedPredecessorGeneration + 1}</p>
        <p>유효 기한: {grant.expiresAt}</p>
        {grant.consumedExecutionId ? <p className="break-all">소비한 실행: {grant.consumedExecutionId}</p> : null}
        {!grant.consumedAt && !grant.revokedAt ? <form action={revoke}><input type="hidden" name="grantId" value={grant.id} /><button disabled={pending} className="mt-2 border px-3 py-1">미사용 승인 취소</button></form> : null}
      </li>)}</ul>
      {inspection.nextCursor ? <form action={async () => {
        setPending(true);
        try {
          const result = await readRefundExecutionAuthorizationsAction({ commandId: inspection.target.commandId, cursor: inspection.nextCursor });
          if (result.success) setInspection({ ...result.data, grants: [...inspection.grants, ...result.data.grants] });
          else setMessage(result.errorCode);
        } finally { setPending(false); }
      }}><button disabled={pending} className="border px-3 py-1 text-sm">이전 승인 더 보기</button></form> : null}
    </> : null}
    <p role="status" className="break-all text-sm">{message}</p>
  </section>;
}
