import Link from "next/link";
import { messagesFor } from "@/lib/market/messages";
import { presentationFor } from "@/lib/market/presentation";
import { siteVariantPath, type SiteVariant } from "@/lib/market/site-variant";

export function HomeStorefront({ variant }: { variant: SiteVariant }) {
  const messages = messagesFor(variant.locale);
  const presentation = presentationFor(variant, {
    "home.hero": messages.home.title,
    "home.primaryCta": messages.home.primaryCta,
    "home.featuredSection": messages.home.featured,
    "home.trustMessage": messages.home.trust,
    "home.deliveryMessage": messages.home.delivery,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
      <section className="max-w-2xl space-y-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {messages.home.eyebrow}
        </p>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
            {presentation.slots["home.hero"]}
          </h1>
          <p className="text-base leading-7 text-gray-600">{messages.home.description}</p>
        </div>
        <Link
          href={siteVariantPath(variant, "/styles")}
          className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-sm font-medium text-white hover:bg-gray-700"
        >
          {presentation.slots["home.primaryCta"]}
        </Link>
      </section>
      <section aria-labelledby="home-featured" className="mt-14 grid gap-4 sm:grid-cols-3">
        <h2 id="home-featured" className="sr-only">{presentation.slots["home.featuredSection"]}</h2>
        <article className="rounded-lg border border-gray-200 bg-white p-5 sm:col-span-2">
          <h3 className="text-sm font-semibold text-gray-900">{presentation.slots["home.featuredSection"]}</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">{presentation.slots["home.trustMessage"]}</p>
        </article>
        <article className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm leading-6 text-gray-600">{presentation.slots["home.deliveryMessage"]}</p>
        </article>
      </section>
    </main>
  );
}
