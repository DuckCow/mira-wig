import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/features/SessionProvider";
import { getSession } from "@/lib/session";
import { getAuthenticationLocale, getStorefrontContext } from "@/lib/market";
import { siteBaseUrl } from "@/lib/market/seo";
import { headers } from "next/headers";
import { NoActiveMarketException } from "@/lib/market/active-market";
import type { StorefrontContext } from "@/lib/market/resolve";
import { messagesFor } from "@/lib/market/messages";
import { getActiveMarketCodes } from "@/lib/market/active-market";
import { getCartItemCount } from "@/lib/cart";
import { StorefrontShell } from "@/components/features/StorefrontShell";
import type { Session } from "next-auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const context = await optionalStorefrontContext();
  const messages = messagesFor(context?.locale ?? "en");
  return {
    metadataBase: siteBaseUrl(),
    title: {
      default: `Mira — ${messages.home.eyebrow}`,
      template: "%s — Mira",
    },
    description: messages.home.description,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [requestHeaders, session, context, activeMarketCodes, authenticationLocale] = await Promise.all([
    headers(),
    getSession(),
    optionalStorefrontContext(),
    getActiveMarketCodes(),
    getAuthenticationLocale(),
  ]);
  const globalSelector = requestHeaders.get("x-mira-pathname") === "/global";
  const initialLocale = globalSelector ? "en" : context?.locale ?? authenticationLocale;
  const shellSession = await storefrontShellSession(session);
  const initialVariant = context
    ? { marketCode: context.marketCode, locale: context.locale }
    : null;

  return (
    <html
      lang={initialLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider session={session}>
          <StorefrontShell
            initialVariant={initialVariant}
            initialLocale={initialLocale}
            user={shellSession.user}
            cartItemCount={shellSession.cartItemCount}
            activeMarketCodes={activeMarketCodes}
          >
            {children}
          </StorefrontShell>
        </SessionProvider>
      </body>
    </html>
  );
}

async function storefrontShellSession(session: Session | null): Promise<{
  user: { id: string; name: string | null; image: string | null } | null;
  cartItemCount: number;
}> {
  if (!session?.user.id) return { user: null, cartItemCount: 0 };
  return {
    user: {
      id: session.user.id,
      name: session.user.name ?? null,
      image: session.user.image ?? null,
    },
    cartItemCount: await getCartItemCount(session.user.id),
  };
}

async function optionalStorefrontContext(): Promise<StorefrontContext | null> {
  try {
    return await getStorefrontContext();
  } catch (error) {
    if (error instanceof NoActiveMarketException) return null;
    throw error;
  }
}
