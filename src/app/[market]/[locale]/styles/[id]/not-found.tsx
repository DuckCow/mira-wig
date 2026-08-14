import Link from "next/link";
import { getStorefrontContext } from "@/lib/market";
import { messagesFor } from "@/lib/market/messages";
import { siteVariantPath } from "@/lib/market/site-variant";

export default async function PublicStyleNotFound() {
  const context = await getStorefrontContext();
  const messages = messagesFor(context.locale);
  const stylesHref = siteVariantPath(
    { marketCode: context.marketCode, locale: context.locale },
    "/styles",
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col items-center px-4 py-20 text-center">
      <p className="mb-2 text-lg font-semibold text-gray-900">
        {messages.detail.notFoundTitle}
      </p>
      <p className="mb-6 text-sm text-gray-400">
        {messages.detail.notFoundDescription}
      </p>
      <Link
        href={stylesHref}
        className="rounded-lg bg-gray-900 px-6 py-2 text-sm text-white hover:bg-gray-700"
      >
        {messages.detail.back}
      </Link>
    </main>
  );
}
