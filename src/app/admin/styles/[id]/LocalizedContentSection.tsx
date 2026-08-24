"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  decideLocalizedRevisionAction,
  publishLocalizedRevisionAction,
  submitLocalizedRevisionAction,
  withdrawLocalizedPublicationAction,
  type AdminLocalizedActionResult,
} from "@/app/actions/admin/wig-style-localized-content";
import type { AdminLocalizedContentState } from "@/lib/wig-style-localized-content/admin";
import type { LocalizedContentCapabilities } from "@/lib/wig-style-localized-content/types";

function newRequestKey(): string {
  return `admin-lpc-${crypto.randomUUID()}`;
}

function resultMessage(result: AdminLocalizedActionResult): string {
  return result.success ? "저장했습니다." : `실패: ${result.errorCode}`;
}

export function LocalizedContentSection({
  wigStyleId,
  state,
  capabilities,
}: {
  wigStyleId: string;
  state: AdminLocalizedContentState;
  capabilities: LocalizedContentCapabilities;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [sourceKind, setSourceKind] = useState<"MANUAL_AUTHORING" | "LEGACY_IMPORT" | "LOCALIZATION">("MANUAL_AUTHORING");
  const [locale, setLocale] = useState<"ko" | "en" | "ja">("ko");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [sourceRevisionId, setSourceRevisionId] = useState("");
  const [claimDisposition, setClaimDisposition] = useState<"" | "NON_MATERIAL" | "MATERIAL_OR_UNRESOLVED">("");
  const [submissionKey, setSubmissionKey] = useState(newRequestKey);

  function complete(result: AdminLocalizedActionResult): void {
    setMessage(resultMessage(result));
    if (result.success) {
      setSubmissionKey(newRequestKey());
      router.refresh();
    }
  }

  function submit(): void {
    startTransition(async () => {
      const result = await submitLocalizedRevisionAction({
        wigStyleId,
        locale,
        sourceKind,
        displayName: sourceKind === "LEGACY_IMPORT" ? undefined : displayName,
        description: sourceKind === "LEGACY_IMPORT" ? undefined : description,
        sourceRevisionId: sourceKind === "LOCALIZATION" ? sourceRevisionId : undefined,
        claimDisposition,
        submissionKey,
        legacyUpdatedAt:
          sourceKind === "LEGACY_IMPORT" ? state.legacyPreview.updatedAt : undefined,
      });
      complete(result);
    });
  }

  return (
    <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">지역화 상품 콘텐츠 권한</h2>
        <p className="mt-1 text-sm text-gray-500">
          작성은 모든 관리자에게 열려 있습니다. 승인자와 게시자는 프로젝트 소유자 환경설정의 단일 사용자만 허용됩니다.
        </p>
        <div className="mt-2 flex gap-2 text-xs">
          <CapabilityBadge enabled={capabilities.canApprove} configured={capabilities.editorialApproverConfigured} label="승인" />
          <CapabilityBadge enabled={capabilities.canPublish} configured={capabilities.publisherConfigured} label="게시" />
        </div>
      </div>

      <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-medium">Legacy preview · source language UNVERIFIED</p>
        <p className="mt-1">{state.legacyPreview.displayName}</p>
        <p className="mt-1 whitespace-pre-wrap text-xs">{state.legacyPreview.description || "설명 없음"}</p>
        <p className="mt-1 text-xs">updatedAt token: {state.legacyPreview.updatedAt}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm">소스 종류
          <select className="mt-1 w-full rounded border px-3 py-2" value={sourceKind} onChange={(event) => setSourceKind(sourceKindFromValue(event.target.value))}>
            <option value="MANUAL_AUTHORING">직접 작성</option>
            <option value="LEGACY_IMPORT">Legacy preview 가져오기</option>
            <option value="LOCALIZATION">기존 revision에서 지역화</option>
          </select>
        </label>
        <label className="text-sm">대상 locale
          <select className="mt-1 w-full rounded border px-3 py-2" value={locale} onChange={(event) => setLocale(localeFromValue(event.target.value))}>
            <option value="ko">ko</option><option value="en">en</option><option value="ja">ja</option>
          </select>
        </label>
        {sourceKind !== "LEGACY_IMPORT" ? (
          <>
            <label className="text-sm">표시 이름
              <input className="mt-1 w-full rounded border px-3 py-2" value={displayName} maxLength={200} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <label className="text-sm">설명
              <textarea className="mt-1 w-full rounded border px-3 py-2" value={description} maxLength={5000} onChange={(event) => setDescription(event.target.value)} />
            </label>
          </>
        ) : null}
        {sourceKind === "LOCALIZATION" ? (
          <label className="text-sm">Source revision
            <select className="mt-1 w-full rounded border px-3 py-2" value={sourceRevisionId} onChange={(event) => setSourceRevisionId(event.target.value)}>
              <option value="">선택</option>
              {state.revisions.filter((revision) => revision.locale !== locale).map((revision) => (
                <option key={revision.id} value={revision.id}>{revision.locale} · {revision.displayName} · {revision.id}</option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm">Claim disposition
          <select className="mt-1 w-full rounded border px-3 py-2" value={claimDisposition} onChange={(event) => setClaimDisposition(claimDispositionFromValue(event.target.value))}>
            <option value="">반드시 선택</option>
            <option value="NON_MATERIAL">NON_MATERIAL</option>
            <option value="MATERIAL_OR_UNRESOLVED">MATERIAL_OR_UNRESOLVED</option>
          </select>
        </label>
        <label className="text-sm md:col-span-2">Submission key
          <input className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs" value={submissionKey} maxLength={128} onChange={(event) => setSubmissionKey(event.target.value)} />
        </label>
      </div>
      <button type="button" disabled={pending || claimDisposition === ""} onClick={submit} className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">Revision 제출</button>
      {message ? <p role="status" className="text-sm text-gray-700">{message}</p> : null}

      <div className="space-y-3">
        <h3 className="font-semibold">Revision과 승인/게시 상태</h3>
        {state.revisions.length === 0 ? <p className="text-sm text-gray-500">제출된 revision이 없습니다.</p> : null}
        {state.revisions.map((revision) => {
          const publication = state.publications.find((item) => item.locale === revision.locale)!;
          return (
            <RevisionCard
              key={revision.id}
              wigStyleId={wigStyleId}
              revision={revision}
              publication={publication}
              capabilities={capabilities}
              disabled={pending}
              run={(operation) => startTransition(async () => complete(await operation()))}
            />
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Locale publication pointer</h3>
        {state.publications.map((publication) => (
          <PublicationRow
            key={publication.locale}
            wigStyleId={wigStyleId}
            publication={publication}
            canPublish={capabilities.canPublish}
            disabled={pending}
            run={(operation) => startTransition(async () => complete(await operation()))}
          />
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Approval audit decisions</h3>
        {state.approvalDecisions.length === 0 ? <p className="text-sm text-gray-500">결정이 없습니다.</p> : null}
        {state.approvalDecisions.map((decision) => (
          <div key={decision.id} className="rounded border p-3 font-mono text-xs">
            {decision.revisionId} #{decision.ordinal} {decision.decision}<br />
            {decision.authorityBasis} · actor {decision.actorUserId} · {decision.decidedAt}
            {decision.rationale ? <><br />rationale: {decision.rationale}</> : null}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="font-semibold">Publication audit events</h3>
        {state.publicationEvents.length === 0 ? <p className="text-sm text-gray-500">이벤트가 없습니다.</p> : null}
        {state.publicationEvents.map((event) => (
          <div key={event.id} className="rounded border p-3 font-mono text-xs">
            {event.locale}@{event.sequence} {event.action} · {event.fromRevisionId ?? "null"} → {event.toRevisionId ?? "null"}<br />
            {event.authorityBasis} · actor {event.actorUserId} · {event.occurredAt}
            {event.reason ? <><br />reason: {event.reason}</> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CapabilityBadge({ enabled, configured, label }: { enabled: boolean; configured: boolean; label: string }) {
  const text = enabled ? `${label} 가능` : configured ? `${label} 권한 없음` : `${label} 설정 없음`;
  return <span className={`rounded-full px-2 py-1 ${enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{text}</span>;
}

function sourceKindFromValue(value: string): "MANUAL_AUTHORING" | "LEGACY_IMPORT" | "LOCALIZATION" {
  if (value === "LEGACY_IMPORT" || value === "LOCALIZATION") return value;
  return "MANUAL_AUTHORING";
}

function localeFromValue(value: string): "ko" | "en" | "ja" {
  if (value === "en" || value === "ja") return value;
  return "ko";
}

function claimDispositionFromValue(value: string): "" | "NON_MATERIAL" | "MATERIAL_OR_UNRESOLVED" {
  if (value === "NON_MATERIAL" || value === "MATERIAL_OR_UNRESOLVED") return value;
  return "";
}

type RunOperation = (operation: () => Promise<AdminLocalizedActionResult>) => void;

function RevisionCard({
  wigStyleId,
  revision,
  publication,
  capabilities,
  disabled,
  run,
}: {
  wigStyleId: string;
  revision: AdminLocalizedContentState["revisions"][number];
  publication: AdminLocalizedContentState["publications"][number];
  capabilities: LocalizedContentCapabilities;
  disabled: boolean;
  run: RunOperation;
}) {
  const [rationale, setRationale] = useState("");
  const availability = revisionOperationAvailability(revision, publication, capabilities);
  const decide = (decision: "APPROVED" | "REJECTED" | "REVOKED") => run(() => decideLocalizedRevisionAction(wigStyleId, {
    revisionId: revision.id,
    decision,
    rationale: rationaleForDecision(decision, rationale),
    requestKey: newRequestKey(),
  }));
  return (
    <article className="rounded border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <strong>{revision.locale} · {revision.displayName}</strong>
        <code className="text-xs text-gray-500">{revision.id}</code>
        <CurrentPublicationBadge current={publication.currentRevisionId === revision.id} />
      </div>
      <p className="mt-1 text-xs text-gray-600">{revision.sourceKind} · {revision.claimDisposition} · latest {latestDecisionLabel(revision.latestDecision)}</p>
      <RevisionDescription description={revision.description} />
      <input className="mt-3 w-full rounded border px-3 py-2" placeholder="거절·철회 rationale" value={rationale} maxLength={1000} onChange={(event) => setRationale(event.target.value)} />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={disabled || !availability.approve} onClick={() => decide("APPROVED")} className="rounded border px-3 py-1 disabled:opacity-40">승인</button>
        <button type="button" disabled={disabled || !availability.reject} onClick={() => decide("REJECTED")} className="rounded border px-3 py-1 disabled:opacity-40">거절</button>
        <button type="button" disabled={disabled || !availability.revoke} onClick={() => decide("REVOKED")} className="rounded border px-3 py-1 disabled:opacity-40">승인 철회</button>
        <button type="button" disabled={disabled || !availability.publish} onClick={() => run(() => publishLocalizedRevisionAction(wigStyleId, {
          revisionId: revision.id,
          expectedPublicationVersion: publication.version,
          requestKey: newRequestKey(),
        }))} className="rounded bg-blue-700 px-3 py-1 text-white disabled:opacity-40">게시</button>
      </div>
    </article>
  );
}

function revisionOperationAvailability(
  revision: AdminLocalizedContentState["revisions"][number],
  publication: AdminLocalizedContentState["publications"][number],
  capabilities: LocalizedContentCapabilities,
) {
  const approvableStates = [null, "REJECTED", "REVOKED"];
  return {
    approve: capabilities.canApprove
      && approvableStates.includes(revision.latestDecision)
      && revision.claimDisposition === "NON_MATERIAL",
    reject: capabilities.canApprove && revision.latestDecision === null,
    revoke: capabilities.canApprove && revision.latestDecision === "APPROVED",
    publish: capabilities.canPublish
      && revision.latestDecision === "APPROVED"
      && revision.claimDisposition === "NON_MATERIAL"
      && publication.currentRevisionId !== revision.id,
  };
}

function rationaleForDecision(
  decision: "APPROVED" | "REJECTED" | "REVOKED",
  rationale: string,
): string | null {
  return decision === "APPROVED" ? null : rationale;
}

function latestDecisionLabel(decision: AdminLocalizedContentState["revisions"][number]["latestDecision"]): string {
  return decision ?? "PENDING";
}

function CurrentPublicationBadge({ current }: { current: boolean }) {
  if (!current) return null;
  return <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">현재 게시</span>;
}

function RevisionDescription({ description }: { description: string | null }) {
  if (!description) return null;
  return <p className="mt-2 whitespace-pre-wrap">{description}</p>;
}

function PublicationRow({ wigStyleId, publication, canPublish, disabled, run }: {
  wigStyleId: string;
  publication: AdminLocalizedContentState["publications"][number];
  canPublish: boolean;
  disabled: boolean;
  run: RunOperation;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="rounded border p-3 text-sm">
      <div><strong>{publication.locale}</strong> · version {publication.version} · {publication.currentRevisionId ?? "withdrawn / never published"}</div>
      <div className="mt-2 flex gap-2">
        <input className="min-w-0 flex-1 rounded border px-3 py-1" placeholder="게시 철회 reason" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
        <button type="button" disabled={disabled || !canPublish || publication.currentRevisionId === null || !reason.trim()} onClick={() => run(() => withdrawLocalizedPublicationAction({
          wigStyleId,
          locale: publication.locale,
          expectedPublicationVersion: publication.version,
          reason,
          requestKey: newRequestKey(),
        }))} className="rounded border px-3 py-1 disabled:opacity-40">게시 철회</button>
      </div>
    </div>
  );
}
