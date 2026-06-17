"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { WIG_CATEGORIES, CATEGORY_LABELS } from "@/lib/catalog.types";
import { updateStyleAction, deactivateStyleAction } from "@/app/actions/admin/catalog";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import type { StyleDetail } from "@/lib/admin-catalog.types";

const INPUT_CLS = "w-full border border-gray-300 rounded px-3 py-2 text-sm";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1";

function parseTags(raw: string): string[] {
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

export function StyleEditForm({ style }: { style: StyleDetail }) {
  const [name, setName] = useState(style.name);
  const [description, setDescription] = useState(style.description ?? "");
  const [category, setCategory] = useState<string>(style.category);
  const [tags, setTags] = useState(style.tags.join(", "));
  const [sortOrder, setSortOrder] = useState(String(style.sortOrder));
  const [isActive, setIsActive] = useState(style.isActive);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validCategory = WIG_CATEGORIES.find((c) => c === category);
    startTransition(async () => {
      const result = await updateStyleAction(style.id, {
        name: name.trim(),
        category: validCategory,
        description: description.trim() || undefined,
        tags: parseTags(tags),
        sortOrder: Number(sortOrder) || 0,
        isActive,
      });
      if (result.success) {
        showToast({ message: "저장되었습니다." });
        router.refresh();
      } else {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
      }
    });
  }

  function handleDeactivate() {
    startTransition(async () => {
      const result = await deactivateStyleAction(style.id);
      if (result.success) {
        showToast({ message: "비활성화되었습니다.", variant: "warning" });
        router.refresh();
      } else {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
      }
    });
  }

  return (
    <Card title="스타일 정보">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ef-name" className={LABEL_CLS}>스타일명 *</label>
            <input id="ef-name" required value={name} onChange={(e) => setName(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label htmlFor="ef-category" className={LABEL_CLS}>카테고리</label>
            <select id="ef-category" value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT_CLS}>
              {WIG_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="ef-desc" className={LABEL_CLS}>설명</label>
          <textarea id="ef-desc" value={description} onChange={(e) => setDescription(e.target.value)}
            rows={2} className={`${INPUT_CLS} resize-none`} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="ef-tags" className={LABEL_CLS}>태그 (쉼표 구분)</label>
            <input id="ef-tags" value={tags} onChange={(e) => setTags(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label htmlFor="ef-sort" className={LABEL_CLS}>정렬 순서</label>
            <input id="ef-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={INPUT_CLS} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input id="ef-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4" />
          <label htmlFor="ef-active" className="text-sm text-gray-700">활성 (전역 노출)</label>
        </div>
        <div className="pt-2">
          <label className={LABEL_CLS}>커버 이미지</label>
          <div className="border border-dashed border-gray-300 rounded px-3 py-4 text-sm text-gray-400 text-center">
            이미지 업로드 (스토리지 연결 후 활성화)
          </div>
        </div>
        <div className="flex justify-between pt-2">
          <button type="button" onClick={handleDeactivate} disabled={isPending || !style.isActive}
            className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-40">
            비활성화
          </button>
          <button type="submit" disabled={isPending}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40">
            {isPending ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Card>
  );
}
