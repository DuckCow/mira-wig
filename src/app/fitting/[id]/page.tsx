// ============================================================
// app/fitting/[id]/page.tsx — 개인 피팅 결과 조회 (서버 컴포넌트)
// ------------------------------------------------------------
// authz: 본인 소유 Fitting만 조회 가능. 타인/비로그인 → 404.
// presigned URL은 서버에서만 생성 (규칙 4-4·4-5).
// 퍼블릭 공유 없음 — 이번 범위에서 제외.
// ============================================================

import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";
import { fittingStorage } from "@/lib/storage";
import { getStorefrontContext } from "@/lib/market";
import { messagesFor, type StorefrontMessages } from "@/lib/market/messages";
import { loginHref } from "@/lib/market/request-context";
import { siteVariantPath } from "@/lib/market/site-variant";

type PageParams = Promise<{ id: string }>;

// ── 서브컴포넌트 ─────────────────────────────────────────────

function FittingImagePair({
  sourceUrl,
  resultUrl,
  messages,
}: {
  sourceUrl: string | null;
  resultUrl: string | null;
  messages: StorefrontMessages["savedFitting"];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {sourceUrl && (
        <figure>
          <figcaption className="text-xs text-center text-gray-500 mb-2">{messages.source}</figcaption>
          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
            <Image
              src={sourceUrl}
              alt={messages.source}
              fill
              unoptimized
              loading="eager"
              sizes="(max-width: 640px) calc(100vw - 2rem), 328px"
              className="object-cover"
            />
          </div>
        </figure>
      )}
      {resultUrl && (
        <figure>
          <figcaption className="text-xs text-center text-gray-500 mb-2">{messages.result}</figcaption>
          <div className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
            <Image
              src={resultUrl}
              alt={messages.result}
              fill
              unoptimized
              loading="eager"
              sizes="(max-width: 640px) calc(100vw - 2rem), 328px"
              className="object-cover"
            />
          </div>
        </figure>
      )}
    </div>
  );
}

function FittingStatusSection({
  status,
  sourceUrl,
  resultUrl,
  messages,
}: {
  status: string;
  sourceUrl: string | null;
  resultUrl: string | null;
  messages: StorefrontMessages["savedFitting"];
}) {
  if (status === "PENDING") return <p className="text-sm text-gray-500">{messages.pending}</p>;
  if (status === "FAILED") return <p className="text-sm text-red-500">{messages.failed}</p>;
  return <FittingImagePair sourceUrl={sourceUrl} resultUrl={resultUrl} messages={messages} />;
}

// ── 페이지 ────────────────────────────────────────────────────

export default async function FittingResultPage({ params }: { params: PageParams }) {
  const [{ id }, session, context] = await Promise.all([params, getSession(), getStorefrontContext()]);
  const variant = { marketCode: context.marketCode, locale: context.locale };
  if (!session) redirect(loginHref(context.requestTarget, variant));
  const messages = messagesFor(context.locale).savedFitting;

  const fitting = await db.fitting.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      resultImageKey: true,
      sourceImageKey: true,
      variant: {
        select: {
          color: true,
          length: true,
          curl: true,
          wigStyle: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!fitting || fitting.userId !== session.user.id) notFound();

  const [resultUrl, sourceUrl] = await Promise.all([
    fitting.resultImageKey ? fittingStorage.getViewUrl(fitting.resultImageKey) : Promise.resolve(null),
    fitting.sourceImageKey ? fittingStorage.getViewUrl(fitting.sourceImageKey) : Promise.resolve(null),
  ]);

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <nav aria-label={messages.back} className="mb-6">
        <Link href={siteVariantPath(variant, `/styles/${encodeURIComponent(fitting.variant.wigStyle.id)}`)} className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1">
          ← {fitting.variant.wigStyle.name}
        </Link>
      </nav>

      <h1 className="text-xl font-bold text-gray-900 mb-2">{messages.title}</h1>
      <p className="text-sm text-gray-500 mb-6">
        {fitting.variant.color} · {fitting.variant.length} · {fitting.variant.curl}
      </p>

      <FittingStatusSection status={fitting.status} sourceUrl={sourceUrl} resultUrl={resultUrl} messages={messages} />

      <div className="mt-8">
        <Link href={siteVariantPath(variant, `/styles/${encodeURIComponent(fitting.variant.wigStyle.id)}`)} className="inline-block px-6 py-2.5 bg-gray-900 text-white rounded-xl text-sm hover:bg-gray-700 transition-colors">
          {messages.returnToProduct}
        </Link>
      </div>
    </main>
  );
}
