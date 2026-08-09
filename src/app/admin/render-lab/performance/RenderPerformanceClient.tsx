"use client";

import dynamic from "next/dynamic";

const RenderPerformanceLab = dynamic(
  () => import("@/components/rendering/RenderPerformanceLab").then(
    (module) => module.RenderPerformanceLab,
  ),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="grid h-72 place-items-center rounded-2xl border border-slate-300 bg-slate-950 p-6 text-sm text-slate-100"
      >
        성능 특성화 모듈을 불러오는 중…
      </div>
    ),
  },
);

export function RenderPerformanceClient() {
  return <RenderPerformanceLab />;
}
