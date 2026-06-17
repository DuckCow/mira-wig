"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Table } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { deactivateVariantAction } from "@/app/actions/admin/catalog";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import { VariantDialog } from "./VariantDialog";
import type { Column } from "@/components/ui/Table";
import type { VariantRow } from "@/lib/admin-catalog.types";

interface VariantSectionProps {
  variants: VariantRow[];
  wigStyleId: string;
}

export function VariantSection({ variants, wigStyleId }: VariantSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VariantRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function handleEditClick(row: VariantRow) {
    setEditTarget(row);
    setDialogOpen(true);
  }

  function handleAddClick() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setEditTarget(null);
  }

  function handleDeactivate(variantId: string) {
    startTransition(async () => {
      const result = await deactivateVariantAction(variantId);
      if (result.success) {
        showToast({ message: "비활성화되었습니다.", variant: "warning" });
        router.refresh();
      } else {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
      }
    });
  }

  const columns: Column<VariantRow>[] = [
    { key: "color", header: "색상", render: (r) => r.color },
    { key: "length", header: "길이", render: (r) => r.length },
    { key: "curl", header: "컬", render: (r) => r.curl },
    { key: "sku", header: "SKU", render: (r) => <code className="text-xs">{r.sku}</code> },
    { key: "stock", header: "재고", render: (r) => r.stock },
    {
      key: "status", header: "상태",
      render: (r) => <Badge variant={r.isActive ? "active" : "inactive"}>{r.isActive ? "활성" : "비활성"}</Badge>,
    },
    {
      key: "actions", header: "",
      render: (r) => (
        <div className="flex gap-2">
          <button onClick={() => handleEditClick(r)} className="text-sm text-blue-600 hover:underline">편집</button>
          <button onClick={() => handleDeactivate(r.id)} disabled={isPending || !r.isActive}
            className="text-sm text-red-500 hover:underline disabled:opacity-40">비활성화</button>
        </div>
      ),
    },
  ];

  return (
    <Card title="바리언트">
      <div className="mb-4">
        <button onClick={handleAddClick}
          className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded hover:bg-gray-700">
          + 바리언트 추가
        </button>
      </div>
      <Table
        columns={columns}
        rows={variants}
        getRowKey={(r) => r.id}
        emptyMessage="등록된 바리언트가 없습니다."
      />
      <VariantDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        wigStyleId={wigStyleId}
        editTarget={editTarget}
      />
    </Card>
  );
}
