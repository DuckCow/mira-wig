import Link from "next/link";
import { getStorefrontContext } from "@/lib/market";
import { messagesFor } from "@/lib/market/messages";
import { siteVariantPath } from "@/lib/market/site-variant";

export default async function StyleNotFound() {
  const context = await getStorefrontContext();
  const messages = messagesFor(context.locale);
  const stylesHref = siteVariantPath(
    { marketCode: context.marketCode, locale: context.locale },
    "/styles",
  );
  return (
    <main className="max-w-5xl mx-auto px-4 py-20 flex flex-col items-center text-center">
      <p className="text-gray-900 font-semibold text-lg mb-2">
        {messages.detail.notFoundTitle}
      </p>
      <p className="text-gray-400 text-sm mb-6">
        {messages.detail.notFoundDescription}
      </p>
      <Link
        href={stylesHref}
        className="px-6 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700"
      >
        {messages.detail.back}
      </Link>
    </main>
  );
}
