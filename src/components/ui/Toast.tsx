// ============================================================
// components/ui/Toast.tsx — 토스트 알림 (Context 기반)
// ------------------------------------------------------------
// 사용법:
//   1. 레이아웃 루트에 <ToastProvider> 배치.
//   2. 컴포넌트에서 useToast() → { showToast } 호출.
//      showToast({ message: "저장됨", variant: "success" })
// ============================================================
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import {
  toastStore,
  type ToastChannel,
  type ToastInput,
  type ToastVariant,
} from "./toast-store";

export type { ToastInput, ToastVariant } from "./toast-store";

// ── 타입 ─────────────────────────────────────────────────────

interface ToastContextValue {
  showToast: (options: ToastInput) => void;
}

// ── Context ───────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  success: "bg-green-600 text-white",
  error: "bg-red-600 text-white",
  warning: "bg-yellow-500 text-white",
};

function channelForPathname(pathname: string): ToastChannel {
  // A future provider outside /admin intentionally joins the shop feedback channel.
  return pathname.startsWith("/admin") ? "admin" : "shop";
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [channel] = useState<ToastChannel>(() => channelForPathname(pathname));
  const subscribe = useCallback(
    (listener: () => void) => toastStore.subscribe(channel, listener),
    [channel],
  );
  const getSnapshot = useCallback(() => toastStore.getSnapshot(channel), [channel]);
  const getServerSnapshot = useCallback(() => toastStore.getServerSnapshot(), []);
  const toasts = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const showToast = useCallback((options: ToastInput) => {
    toastStore.enqueue(channel, options);
  }, [channel]);
  const contextValue = useMemo(() => Object.freeze({ showToast }), [showToast]);

  useEffect(() => toastStore.mountPresenter(channel), [channel]);

  useEffect(() => {
    for (const toast of toasts) toastStore.acknowledge(channel, toast.id);
  }, [channel, toasts]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        aria-relevant="additions text"
        className="fixed bottom-4 right-4 flex flex-col gap-2 z-50"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
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
