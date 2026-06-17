"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { createVariantAction, updateVariantAction } from "@/app/actions/admin/catalog";
import { getAdminErrorMessage } from "@/lib/admin-messages";
import type { VariantRow } from "@/lib/admin-catalog.types";

const INPUT_CLS = "w-full border border-gray-300 rounded px-3 py-2 text-sm";
const LABEL_CLS = "block text-sm font-medium text-gray-700 mb-1";

interface VariantDialogProps {
  open: boolean;
  onClose: () => void;
  wigStyleId: string;
  editTarget: VariantRow | null;
}

export function VariantDialog({ open, onClose, wigStyleId, editTarget }: VariantDialogProps) {
  const [color, setColor] = useState("");
  const [length, setLength] = useState("");
  const [curl, setCurl] = useState("");
  const [sku, setSku] = useState("");
  const [stock, setStock] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setColor(editTarget.color);
      setLength(editTarget.length);
      setCurl(editTarget.curl);
      setSku(editTarget.sku);
      setStock(String(editTarget.stock));
      setIsActive(editTarget.isActive);
    } else {
      setColor(""); setLength(""); setCurl(""); setSku(""); setStock("0"); setIsActive(true);
    }
  }, [open, editTarget]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const stockNum = parseInt(stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      showToast({ message: "재고는 0 이상의 정수여야 합니다.", variant: "error" });
      return;
    }
    startTransition(async () => {
      const result = editTarget
        ? await updateVariantAction(editTarget.id, { color, length, curl, sku, stock: stockNum, isActive })
        : await createVariantAction({ wigStyleId, color, length, curl, sku, stock: stockNum, isActive });
      if (result.success) {
        showToast({ message: editTarget ? "수정되었습니다." : "바리언트가 생성되었습니다." });
        onClose();
        router.refresh();
      } else {
        showToast({ message: getAdminErrorMessage(result.errorCode), variant: "error" });
      }
    });
  }

  const title = editTarget ? "바리언트 편집" : "바리언트 추가";

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vd-color" className={LABEL_CLS}>색상 *</label>
            <input id="vd-color" required value={color} onChange={(e) => setColor(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label htmlFor="vd-sku" className={LABEL_CLS}>SKU *</label>
            <input id="vd-sku" required value={sku} onChange={(e) => setSku(e.target.value)} className={INPUT_CLS} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="vd-length" className={LABEL_CLS}>길이 *</label>
            <input id="vd-length" required value={length} onChange={(e) => setLength(e.target.value)} className={INPUT_CLS} />
          </div>
          <div>
            <label htmlFor="vd-curl" className={LABEL_CLS}>컬 *</label>
            <input id="vd-curl" required value={curl} onChange={(e) => setCurl(e.target.value)} className={INPUT_CLS} />
          </div>
        </div>
        <div>
          <label htmlFor="vd-stock" className={LABEL_CLS}>재고</label>
          <input id="vd-stock" type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} className={INPUT_CLS} />
        </div>
        <div className="flex items-center gap-2">
          <input id="vd-active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4" />
          <label htmlFor="vd-active" className="text-sm text-gray-700">활성 (전역 노출)</label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">취소</button>
          <button type="submit" disabled={isPending}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-40">
            {isPending ? "저장 중…" : (editTarget ? "수정" : "추가")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
