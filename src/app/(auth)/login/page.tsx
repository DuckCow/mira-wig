import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { resolveLoginCallbackUrl } from "./login-callback";
import { getAuthenticationLocale, getStorefrontContext } from "@/lib/market";
import { messagesFor } from "@/lib/market/messages";
import { siteVariantPath } from "@/lib/market/site-variant";
import type { Metadata } from "next";
import { NoActiveMarketException } from "@/lib/market/active-market";
import type { StorefrontContext } from "@/lib/market/resolve";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string | string[];
  }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getAuthenticationLocale();
  return { title: messagesFor(locale).login.title };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getSession();
  const query = await searchParams;
  const callbackCandidate = typeof query.callbackUrl === "string" ? query.callbackUrl : undefined;
  const [context, locale] = await Promise.all([
    optionalStorefrontContext(),
    getAuthenticationLocale(callbackCandidate),
  ]);
  const messages = messagesFor(locale).login;
  const fallback = context
    ? siteVariantPath({ marketCode: context.marketCode, locale: context.locale }, "/styles")
    : "/global";
  const callbackUrl = resolveLoginCallbackUrl(query.callbackUrl, fallback);
  if (session) redirect(callbackUrl);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Mira</h1>
          <p className="text-sm text-gray-500">{messages.subtitle}</p>
        </header>

        <div className="space-y-3">
          <GoogleSignInButton callbackUrl={callbackUrl} locale={locale} />
        </div>

        <p className="text-xs text-center text-gray-400">
          {messages.consent}
        </p>
      </div>
    </main>
  );
}

async function optionalStorefrontContext(): Promise<StorefrontContext | null> {
  try {
    return await getStorefrontContext();
  } catch (error) {
    if (error instanceof NoActiveMarketException) return null;
    throw error;
  }
}
