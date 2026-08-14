"use client";

import Link from "next/link";
import { messagesFor } from "@/lib/market/messages";
import { siteVariantPath, type SiteVariant } from "@/lib/market/site-variant";
import { loginHref, withStorefrontHandoff } from "@/lib/market/request-context";
import { SignOutButton } from "./SignOutButton";
import { MarketSelector } from "./MarketSelector";
import type { MarketCode } from "@/lib/market/types";

export interface HeaderUser {
  id: string;
  name: string | null;
  image: string | null;
}

export interface HeaderProps {
  user: HeaderUser | null;
  cartItemCount: number;
  variant: SiteVariant;
  requestTarget: string;
  activeMarketCodes: readonly MarketCode[];
}

function CartLink({ count, label, variant }: { count: number; label: string; variant: SiteVariant }) {
  return (
    <Link
      href={withStorefrontHandoff("/cart", variant)}
      aria-label={`${label} (${count})`}
      className="relative text-sm text-gray-700 hover:text-gray-900"
    >
      {label}
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-3 bg-gray-900 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

function UserMenu({
  name,
  image,
  cartItemCount,
  variant,
}: {
  name: string;
  image: string | null;
  cartItemCount: number;
  variant: SiteVariant;
}) {
  const messages = messagesFor(variant.locale);
  return (
    <div className="flex items-center gap-4">
      <Link href={withStorefrontHandoff("/orders", variant)} className="text-sm text-gray-700 hover:text-gray-900">
        {messages.nav.orders}
      </Link>
      <CartLink count={cartItemCount} label={messages.nav.cart} variant={variant} />
      <span
        className="flex items-center gap-2 text-sm text-gray-700"
        aria-live="polite"
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={`${name} ${messages.nav.profile}`}
            width={28}
            height={28}
            className="rounded-full"
            referrerPolicy="no-referrer"
          />
        )}
        <span>{name}</span>
      </span>
      <SignOutButton label={messages.nav.signOut} callbackUrl={withStorefrontHandoff("/login", variant)} />
    </div>
  );
}

export function Header({ user, cartItemCount, variant, requestTarget, activeMarketCodes }: HeaderProps) {
  const messages = messagesFor(variant.locale);

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href={siteVariantPath(variant)}
          className="text-lg font-bold text-gray-900 tracking-tight"
          aria-label={messages.nav.home}
        >
          Mira
        </Link>

        <nav aria-label={messages.selector.label} className="flex items-center gap-3">
          <MarketSelector currentMarket={variant.marketCode} currentLocale={variant.locale} activeMarketCodes={activeMarketCodes} />

          {user ? (
            <UserMenu
              name={user.name ?? messages.nav.defaultUser}
              image={user.image}
              cartItemCount={cartItemCount}
              variant={variant}
            />
          ) : (
            <Link
              href={loginHref(requestTarget, variant)}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-1.5"
            >
              {messages.nav.login}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
