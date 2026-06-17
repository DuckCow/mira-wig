// ============================================================
// components/ui/Badge.tsx — 상태 표시 레이블
// variant: active(초록) | inactive(회색) | warning(노랑) | error(빨강)
// ============================================================

const VARIANT_CLASSES = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-600",
  warning: "bg-yellow-100 text-yellow-800",
  error: "bg-red-100 text-red-700",
} as const;

export type BadgeVariant = keyof typeof VARIANT_CLASSES;

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
}

export function Badge({ variant, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${VARIANT_CLASSES[variant]}`}
    >
      {children}
    </span>
  );
}
