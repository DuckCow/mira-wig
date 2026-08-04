"use client";

import dynamic from "next/dynamic";

const RenderLabViewport = dynamic(
  () =>
    import("@/components/rendering/RenderLabViewport").then(
      (module) => module.RenderLabViewport,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="grid min-h-96 place-items-center rounded-2xl border border-slate-300 bg-slate-900 p-6 text-sm text-slate-100"
      >
        렌더 랩 모듈을 불러오는 중…
      </div>
    ),
  },
);

export function RenderLabClient() {
  return <RenderLabViewport />;
}
