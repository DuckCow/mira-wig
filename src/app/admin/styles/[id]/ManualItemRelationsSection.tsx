"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createManualStyleRelationAction,
  setManualStyleRelationActiveAction,
  updateManualStyleRelationAction,
} from "@/app/actions/admin/manual-item-relations";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import type {
  ManualRelationCustomerGateState,
  ManualRelationCustomerGateStates,
} from "@/lib/manual-item-relations/activation";
import {
  ManualStyleRelationPurpose,
  type AdminManualStyleRelation,
  type ManualRelationDiagnostic,
  type ManualRelationTargetChoice,
  type ManualStyleRelationPurpose as ManualStyleRelationPurposeValue,
} from "@/lib/manual-item-relations/types";

interface Props {
  sourceStyleId: string;
  relations: AdminManualStyleRelation[];
  targetChoices: ManualRelationTargetChoice[];
  customerGateStates: ManualRelationCustomerGateStates;
}

interface RelationDraft {
  purpose: ManualStyleRelationPurposeValue;
  priority: string;
  internalRationale: string;
}

const PURPOSE_LABELS: Readonly<Record<ManualStyleRelationPurposeValue, string>> = {
  SIMILAR_STYLE: "비슷한 스타일",
  COMPARE_WITH: "함께 비교",
};

const DIAGNOSTIC_LABELS: Readonly<Record<ManualRelationDiagnostic, string>> = {
  READY: "활성화 요건 충족",
  TARGET_GLOBALLY_INACTIVE: "대상 전역 비활성",
  TARGET_NOT_PUBLISHED: "대상 KR 미공개",
  TARGET_NO_ACTIVE_PRICED_VARIANT: "대상 KR 활성·가격 바리언트 없음",
};

function draftFromRelation(relation: AdminManualStyleRelation): RelationDraft {
  return {
    purpose: relation.purpose,
    priority: String(relation.priority),
    internalRationale: relation.internalRationale ?? "",
  };
}

function purposeFromValue(value: string): ManualStyleRelationPurposeValue | null {
  if (value === ManualStyleRelationPurpose.SIMILAR_STYLE) return value;
  if (value === ManualStyleRelationPurpose.COMPARE_WITH) return value;
  return null;
}

function TargetStateBadges({ target }: { target: ManualRelationTargetChoice }) {
  return (
    <span className="inline-flex flex-wrap gap-1 ml-2">
      <Badge variant={target.isActive ? "active" : "inactive"}>
        {target.isActive ? "전역 활성" : "전역 비활성"}
      </Badge>
      <Badge variant={target.marketIsActive ? "active" : "warning"}>
        {target.marketIsActive ? "KR 공개" : "KR 미공개"}
      </Badge>
      <Badge variant={target.hasActivePricedVariant ? "active" : "warning"}>
        {target.hasActivePricedVariant ? "KR 활성·가격 있음" : "KR 활성·가격 없음"}
      </Badge>
    </span>
  );
}

function RelationStateBadges({ relation }: { relation: AdminManualStyleRelation }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={relation.targetIsActive ? "active" : "inactive"}>
        {relation.targetIsActive ? "대상 전역 활성" : "대상 전역 비활성"}
      </Badge>
      <Badge variant={relation.targetMarketIsActive ? "active" : "warning"}>
        {relation.targetMarketIsActive ? "대상 KR 공개" : "대상 KR 미공개"}
      </Badge>
      <Badge variant={relation.targetHasActivePricedVariant ? "active" : "warning"}>
        {relation.targetHasActivePricedVariant ? "활성·가격 있음" : "활성·가격 없음"}
      </Badge>
      <Badge variant={relation.isActive ? "active" : "inactive"}>
        {relation.isActive ? "활성" : "초안"}
      </Badge>
    </div>
  );
}

function diagnosticClass(diagnostic: ManualRelationDiagnostic): string {
  return diagnostic === "READY" ? "text-green-700" : "text-amber-700";
}

function activationButtonClass(isActive: boolean): string {
  if (isActive) return "bg-gray-200 text-gray-700 hover:bg-gray-300";
  return "bg-gray-900 text-white hover:bg-gray-700";
}

function customerGateBadgeVariant(
  state: ManualRelationCustomerGateState,
): "active" | "inactive" | "error" {
  if (state === "ON") return "active";
  if (state === "INVALID CONFIGURATION") return "error";
  return "inactive";
}

function CustomerGateState({
  purpose,
  state,
}: {
  purpose: ManualStyleRelationPurposeValue;
  state: ManualRelationCustomerGateState;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded border border-gray-200 bg-white px-3 py-2">
      <code className="text-xs font-medium text-gray-700">{purpose}</code>
      <Badge variant={customerGateBadgeVariant(state)}>{state}</Badge>
    </div>
  );
}

function RelationEditor({
  relation,
  draft,
  isPending,
  onDraft,
  onSave,
  onActivation,
}: {
  relation: AdminManualStyleRelation;
  draft: RelationDraft;
  isPending: boolean;
  onDraft: (patch: Partial<RelationDraft>) => void;
  onSave: () => void;
  onActivation: () => void;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900">{relation.targetName}</p>
          <code className="text-xs text-gray-500">{relation.targetStyleId}</code>
        </div>
        <RelationStateBadges relation={relation} />
      </div>

      <p className={`text-xs ${diagnosticClass(relation.diagnostic)}`}>
        진단: {DIAGNOSTIC_LABELS[relation.diagnostic]}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-3">
        <label className="text-xs font-medium text-gray-600">
          목적
          <select
            value={draft.purpose}
            onChange={(event) => {
              const purpose = purposeFromValue(event.target.value);
              if (purpose) onDraft({ purpose });
            }}
            className="mt-1 w-full border border-gray-200 rounded px-2 py-2 text-sm"
          >
            <option value="SIMILAR_STYLE">{PURPOSE_LABELS.SIMILAR_STYLE}</option>
            <option value="COMPARE_WITH">{PURPOSE_LABELS.COMPARE_WITH}</option>
          </select>
        </label>
        <label className="text-xs font-medium text-gray-600">
          우선순위
          <input
            type="number"
            min={0}
            max={10000}
            step={1}
            value={draft.priority}
            onChange={(event) => onDraft({ priority: event.target.value })}
            className="mt-1 w-full border border-gray-200 rounded px-2 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-gray-600">
        내부 근거 (관리자 전용)
        <textarea
          value={draft.internalRationale}
          maxLength={1000}
          rows={3}
          onChange={(event) => onDraft({ internalRationale: event.target.value })}
          className="mt-1 w-full border border-gray-200 rounded px-2 py-2 text-sm"
        />
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={onSave}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
        >
          편집 저장
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={onActivation}
          className={`px-3 py-1.5 text-sm rounded disabled:opacity-40 ${
            activationButtonClass(relation.isActive)
          }`}
        >
          {relation.isActive ? "비활성화" : "활성화"}
        </button>
      </div>
    </div>
  );
}

export function ManualItemRelationsSection({
  sourceStyleId,
  relations,
  targetChoices,
  customerGateStates,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [targetStyleId, setTargetStyleId] = useState(targetChoices[0]?.id ?? "");
  const [createDraft, setCreateDraft] = useState<RelationDraft>({
    purpose: ManualStyleRelationPurpose.SIMILAR_STYLE,
    priority: "0",
    internalRationale: "",
  });
  const [editDrafts, setEditDrafts] = useState<Record<string, RelationDraft>>(() => (
    Object.fromEntries(relations.map((relation) => [relation.id, draftFromRelation(relation)]))
  ));
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function showError(errorCode: string): void {
    showToast({ message: getAdminErrorMessage(errorCode), variant: "error" });
  }

  function handleCreate(): void {
    const priority = Number(createDraft.priority);
    startTransition(async () => {
      const result = await createManualStyleRelationAction({
        sourceStyleId,
        targetStyleId,
        marketCode: "KR",
        purpose: createDraft.purpose,
        priority,
        internalRationale: createDraft.internalRationale,
      });
      if (!result.success) {
        showError(result.errorCode);
        return;
      }
      showToast({ message: "비활성 초안 관계를 만들었습니다.", variant: "success" });
      setCreateOpen(false);
      router.refresh();
    });
  }

  function updateDraft(relationId: string, patch: Partial<RelationDraft>): void {
    setEditDrafts((current) => ({
      ...current,
      [relationId]: {
        ...(current[relationId] ?? {
          purpose: ManualStyleRelationPurpose.SIMILAR_STYLE,
          priority: "0",
          internalRationale: "",
        }),
        ...patch,
      },
    }));
  }

  function handleSave(relation: AdminManualStyleRelation): void {
    const draft = editDrafts[relation.id] ?? draftFromRelation(relation);
    startTransition(async () => {
      const result = await updateManualStyleRelationAction(relation.id, {
        purpose: draft.purpose,
        priority: Number(draft.priority),
        internalRationale: draft.internalRationale,
      });
      if (!result.success) {
        showError(result.errorCode);
        return;
      }
      showToast({ message: "수동 관계를 저장했습니다.", variant: "success" });
      router.refresh();
    });
  }

  function handleActivation(relation: AdminManualStyleRelation): void {
    const nextActive = !relation.isActive;
    startTransition(async () => {
      const result = await setManualStyleRelationActiveAction(relation.id, nextActive);
      if (!result.success) {
        showError(result.errorCode);
        return;
      }
      showToast({
        message: nextActive ? "수동 관계를 활성화했습니다." : "수동 관계를 비활성화했습니다.",
        variant: nextActive ? "success" : "warning",
      });
      router.refresh();
    });
  }

  return (
    <Card title="수동 스타일 관계 (KR)">
      <section
        aria-labelledby="manual-relation-customer-gates"
        className="mb-5 rounded-lg border border-gray-300 bg-gray-50 p-4"
      >
        <h3
          id="manual-relation-customer-gates"
          className="text-sm font-semibold text-gray-900"
        >
          고객 노출 게이트
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          고객 목적별 노출 설정입니다. 아래 관계 행의 활성·초안 상태와 별개이며 읽기 전용입니다.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <CustomerGateState
            purpose={ManualStyleRelationPurpose.SIMILAR_STYLE}
            state={customerGateStates.SIMILAR_STYLE}
          />
          <CustomerGateState
            purpose={ManualStyleRelationPurpose.COMPARE_WITH}
            state={customerGateStates.COMPARE_WITH}
          />
        </div>
      </section>

      <div className="flex items-start justify-between gap-4 mb-5">
        <p className="text-xs text-gray-500">
          방향성 있는 편집 관계입니다. 자동 유사도나 상업적 대체 가능성을 의미하지 않습니다.
          내부 근거는 관리자에게만 표시됩니다.
        </p>
        <button
          type="button"
          disabled={isPending || targetChoices.length === 0}
          onClick={() => setCreateOpen(true)}
          className="shrink-0 px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40"
        >
          초안 추가
        </button>
      </div>

      {relations.length === 0 ? (
        <p className="text-sm text-gray-400">KR 수동 관계가 없습니다.</p>
      ) : (
        <div className="space-y-4">
          {relations.map((relation) => (
            <RelationEditor
              key={relation.id}
              relation={relation}
              draft={editDrafts[relation.id] ?? draftFromRelation(relation)}
              isPending={isPending}
              onDraft={(patch) => updateDraft(relation.id, patch)}
              onSave={() => handleSave(relation)}
              onActivation={() => handleActivation(relation)}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="KR 수동 관계 초안 추가">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-gray-700">
            대상 스타일
            <select
              value={targetStyleId}
              onChange={(event) => setTargetStyleId(event.target.value)}
              className="mt-1 w-full border border-gray-200 rounded px-2 py-2 text-sm"
            >
              {targetChoices.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name} · {target.id}
                  {!target.isActive ? " · 전역 비활성" : ""}
                  {!target.marketIsActive ? " · KR 미공개" : ""}
                  {!target.hasActivePricedVariant ? " · KR 활성·가격 없음" : ""}
                </option>
              ))}
            </select>
          </label>
          {targetChoices.find((target) => target.id === targetStyleId) ? (
            <TargetStateBadges
              target={targetChoices.find((target) => target.id === targetStyleId)!}
            />
          ) : null}
          <label className="block text-sm font-medium text-gray-700">
            목적
            <select
              value={createDraft.purpose}
              onChange={(event) => {
                const purpose = purposeFromValue(event.target.value);
                if (purpose) setCreateDraft((current) => ({ ...current, purpose }));
              }}
              className="mt-1 w-full border border-gray-200 rounded px-2 py-2 text-sm"
            >
              <option value="SIMILAR_STYLE">{PURPOSE_LABELS.SIMILAR_STYLE}</option>
              <option value="COMPARE_WITH">{PURPOSE_LABELS.COMPARE_WITH}</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            우선순위
            <input
              type="number"
              min={0}
              max={10000}
              step={1}
              value={createDraft.priority}
              onChange={(event) => setCreateDraft(
                (current) => ({ ...current, priority: event.target.value }),
              )}
              className="mt-1 w-full border border-gray-200 rounded px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            내부 근거 (초안에서는 선택)
            <textarea
              value={createDraft.internalRationale}
              rows={3}
              onChange={(event) => setCreateDraft(
                (current) => ({ ...current, internalRationale: event.target.value }),
              )}
              className="mt-1 w-full border border-gray-200 rounded px-2 py-2 text-sm"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded"
            >
              취소
            </button>
            <button
              type="button"
              disabled={isPending || !targetStyleId}
              onClick={handleCreate}
              className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded disabled:opacity-40"
            >
              비활성 초안 만들기
            </button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}
