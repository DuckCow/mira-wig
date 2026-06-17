// ============================================================
// components/ui/Card.tsx — 섹션 그루핑 컨테이너
// 도메인 지식 없음. 어드민 섹션 레이아웃용.
// ============================================================

interface CardProps {
  /** 카드 제목 (선택) */
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        </div>
      )}
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}
