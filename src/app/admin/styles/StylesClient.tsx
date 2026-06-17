"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { WIG_CATEGORIES, CATEGORY_LABELS } from "@/lib/catalog.types";
import { createStyleAction } from "@/app/actions/admin/catalog";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import type { Column } from "@/components/ui/Table";
import type { StyleRow } from "@/lib/admin-catalog.types";

// ── 새 스타일 생성 Dialog ─────────────────────────────────────

function CreateStyleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>(WIG_CATEGORIES[0] ?? "FASHION");
  const [description, setDescription] = useState("");
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const validCategory = WIG_CATEGORIES.find((c) => c === category);
    if (!validCategory) return;
    startTransition(async () => {
      const result = await createStyleAction({
        name: name.trim(),
        category: validCategory,
        description: description.trim() || undefined,
      });
      if (result.success) {
        showToast({ message: "스타일이 생성되었습니다." });
        setName(""); setDescription("");
        onClose();
        router.refresh();
      } else {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="새 스타일 생성">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="cs-name" className="block text-sm font-medium text-gray-700 mb-1">스타일명 *</label>
          <input id="cs-name" required value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="cs-category" className="block text-sm font-medium text-gray-700 mb-1">카테고리 *</label>
          <select id="cs-category" value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
            {WIG_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cs-desc" className="block text-sm font-medium text-gray-700 mb-1">설명</label>
          <textarea id="cs-desc" value={description} onChange={(e) => setDescription(e.target.value)}
            rows={3} className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">취소</button>
          <button type="submit" disabled={isPending}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40">
            {isPending ? "생성 중…" : "생성"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

const COLUMNS: Column<StyleRow>[] = [
  { key: "name", header: "스타일명", render: (r) => r.name },
  { key: "category", header: "카테고리", render: (r) => CATEGORY_LABELS[r.category] },
  { key: "variants", header: "variants", render: (r) => `${r.variantCount}개` },
  {
    key: "status", header: "상태",
    render: (r) => <Badge variant={r.isActive ? "active" : "inactive"}>{r.isActive ? "활성" : "비활성"}</Badge>,
  },
  {
    key: "action", header: "",
    render: (r) => (
      <Link href={`/admin/styles/${r.id}`} className="text-sm text-blue-600 hover:underline">
        상세 →
      </Link>
    ),
  },
];

export function StylesClient({ styles }: { styles: StyleRow[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold text-gray-900">스타일 관리</h1>
        <button onClick={() => setDialogOpen(true)}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-700">
          + 새 스타일
        </button>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <Table
          columns={COLUMNS}
          rows={styles}
          getRowKey={(r) => r.id}
          emptyMessage="등록된 스타일이 없습니다."
        />
      </div>
      <CreateStyleDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
