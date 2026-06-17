// ============================================================
// components/ui/Toast.tsx — 토스트 알림 (Context 기반)
// ------------------------------------------------------------
// 사용법:
//   1. 레이아웃 루트에 <ToastProvider> 배치.
//   2. 컴포넌트에서 useToast() → { showToast } 호출.
//      showToast({ message: "저장됨", variant: "success" })
// ============================================================
"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// ── 타입 ─────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "warning";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ShowToastOptions {
  message: string;
  variant?: ToastVariant;
  /** 자동 닫힘 ms (기본 3000) */
  duration?: number;
}

interface ToastContextValue {
  showToast: (options: ShowToastOptions) => void;
}

// ── Context ───────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  warning: "bg-yellow-500 text-white",
};

/** 특정 id의 토스트를 제거하는 순수 함수 — callback 중첩 방지. */
function removeById(id: number, list: ToastItem[]): ToastItem[] {
  return list.filter((t) => t.id !== id);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const showToast = useCallback(({ message, variant = "success", duration = 3000 }: ShowToastOptions) => {
    nextIdRef.current += 1;
    const id = nextIdRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => removeById(id, prev)), duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 flex flex-col gap-2 z-50"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`px-4 py-3 rounded shadow-md text-sm font-medium max-w-xs ${VARIANT_CLASSES[t.variant]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast는 ToastProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}
