import type { Metadata } from "next";
import { RenderLabClient } from "./RenderLabClient";

export const metadata: Metadata = {
  title: "Render Lab | 어드민",
  robots: { index: false, follow: false },
};

export default function RenderLabPage() {
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <p className="text-xs font-bold tracking-[0.18em] text-amber-800">INTERNAL RENDER LAB</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">시각 실험 전용</h1>
        <p className="mt-1 font-semibold text-amber-950">
          제품·주문·피팅·제작 사양이 아닙니다.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-900">
          브라우저 그래픽 백엔드와 결정적 인메모리 스트랜드 fixture를 확인하는
          일시적 엔지니어링 진단입니다. 표시 결과와 조작 값은 저장되거나 다른 흐름에
          전달되지 않습니다.
        </p>
      </header>

      <RenderLabClient />
    </div>
  );
}
