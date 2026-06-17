// ============================================================
// components/ui/Dialog.tsx — 모달 다이얼로그
// 생성·편집 폼 및 삭제 확인용. 외부에서 open 상태를 제어한다.
// ============================================================
"use client";

import { useEffect, useRef } from "react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  // ESC 키로 닫힐 때 부모 상태 동기화
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handle = () => onClose();
    el.addEventListener("close", handle);
    return () => el.removeEventListener("close", handle);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="rounded-lg shadow-lg p-0 max-w-lg w-full backdrop:bg-black/40"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ×
        </button>
      </div>
      <div className="px-6 py-4">{children}</div>
    </dialog>
  );
}
