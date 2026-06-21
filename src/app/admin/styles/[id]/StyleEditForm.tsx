"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { WIG_CATEGORIES, CATEGORY_LABELS } from "@/lib/catalog.types";
import { updateStyleAction, getCoverImageUploadUrlAction } from "@/app/actions/admin/catalog";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import type { StyleDetail } from "@/lib/admin-catalog.types";

const INPUT_CLS = "w-full border border-gray-300 rounded px-3 py-2 text-sm";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1";

function parseTags(raw: string): string[] {
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

// ── 커버 이미지 필드 ──────────────────────────────────────────

interface CoverImageFieldProps {
  previewUrl: string | null;
  isUploading: boolean;
  isBusy: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: React.ChangeEventHandler<HTMLInputElement>;
  onRemove: () => void;
}

function CoverImageField({ previewUrl, isUploading, isBusy, fileInputRef, onFileChange, onRemove }: CoverImageFieldProps) {
  return (
    <div>
      <label className={LABEL_CLS}>커버 이미지</label>
      {previewUrl && (
        <div className="mb-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="커버 이미지 미리보기"
            className="h-32 w-32 object-cover rounded border border-gray-200" />
        </div>
      )}
      <div className="flex items-center gap-2 mt-1">
        <label htmlFor="ef-cover-file"
          className="px-3 py-1.5 text-sm border border-gray-300 rounded cursor-pointer hover:bg-gray-50">
          {isUploading ? "업로드 중…" : previewUrl ? "이미지 교체" : "이미지 선택"}
        </label>
        <input id="ef-cover-file" ref={fileInputRef} type="file"
          accept="image/jpeg,image/png,image/webp" className="sr-only"
          disabled={isBusy} onChange={onFileChange} />
        {previewUrl && (
          <button type="button" onClick={onRemove} disabled={isBusy}
            className="px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded hover:bg-red-50 disabled:opacity-40">
            이미지 제거
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-400">JPEG / PNG / WEBP, 저장 후 반영됩니다.</p>
    </div>
  );
}

// ── 메인 폼 ──────────────────────────────────────────────────

interface Props {
  style: StyleDetail;
  initialCoverUrl: string | null;
}

export function StyleEditForm({ style, initialCoverUrl }: Props) {
  const [name, setName] = useState(style.name);
  const [description, setDescription] = useState(style.description ?? "");
  const [category, setCategory] = useState<string>(style.category);
  const [tags, setTags] = useState(style.tags.join(", "));
  const [sortOrder, setSortOrder] = useState(String(style.sortOrder));
  const [isActive, setIsActive] = useState(style.isActive);
  const [coverImageKey, setCoverImageKey] = useState<string | null>(style.coverImageKey);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(initialCoverUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const urlResult = await getCoverImageUploadUrlAction(file.type);
    if (!urlResult.success) {
      showToast({ message: getAdminErrorMessage(urlResult.errorCode), variant: "error" });
      setIsUploading(false);
      return;
    }
    const putResp = await fetch(urlResult.uploadUrl, {
      method: "PUT", body: file, headers: urlResult.requiredHeaders,
    });
    if (!putResp.ok) {
      showToast({ message: "이미지 업로드에 실패했습니다.", variant: "error" });
      setIsUploading(false);
      return;
    }
    setCoverImageKey(urlResult.key);
    setCoverPreviewUrl(URL.createObjectURL(file));
    showToast({ message: "이미지가 업로드되었습니다. 저장 버튼을 눌러 반영하세요.", variant: "success" });
    setIsUploading(false);
  }

  // onChange는 void를 반환해야 하므로 async 함수를 래핑한다
  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => { void handleFileChange(e); };

  function handleRemoveCover() {
    setCoverImageKey(null);
    setCoverPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validCategory = WIG_CATEGORIES.find((c) => c === category);
    startTransition(async () => {
      const result = await updateStyleAction(style.id, {
        name: name.trim(), category: validCategory,
        description: description.trim() || undefined,
        tags: parseTags(tags), sortOrder: Number(sortOrder) || 0,
        isActive, coverImageKey,
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
      const result = await updateStyleAction(style.id, { isActive: false });
      if (result.success) {
        showToast({ message: "비활성화되었습니다.", variant: "warning" });
        router.refresh();
      } else {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
      }
    });
  }

  const isBusy = isPending || isUploading;

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
          <input id="ef-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4" />
          <label htmlFor="ef-active" className="text-sm text-gray-700">활성 (전역 노출)</label>
        </div>
        <CoverImageField
          previewUrl={coverPreviewUrl} isUploading={isUploading} isBusy={isBusy}
          fileInputRef={fileInputRef} onFileChange={onFileChange} onRemove={handleRemoveCover}
        />
        <div className="flex justify-between pt-2">
          <button type="button" onClick={handleDeactivate} disabled={isBusy || !style.isActive}
            className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-40">
            비활성화
          </button>
          <button type="submit" disabled={isBusy}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40">
            {isPending ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Card>
  );
}
