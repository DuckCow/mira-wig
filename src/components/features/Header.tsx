import Link from "next/link";
import { getSession } from "@/lib/session";
import { getCartItemCount } from "@/lib/cart";
import { SignOutButton } from "./SignOutButton";

async function CartLink({ userId }: { userId: string }) {
  const count = await getCartItemCount(userId);
  return (
    <Link
      href="/cart"
      aria-label={`장바구니 (${count}개)`}
      className="relative text-sm text-gray-700 hover:text-gray-900"
    >
      장바구니
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
  userId,
}: {
  name: string;
  image: string | null;
  userId: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <CartLink userId={userId} />
      <span
        className="flex items-center gap-2 text-sm text-gray-700"
        aria-live="polite"
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={`${name} 프로필`}
            width={28}
            height={28}
            className="rounded-full"
            referrerPolicy="no-referrer"
          />
        )}
        <span>{name}</span>
      </span>
      <SignOutButton />
    </div>
  );
}

export async function Header() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link
          href="/styles"
          className="text-lg font-bold text-gray-900 tracking-tight"
          aria-label="Mira 홈으로"
        >
          Mira
        </Link>

        <nav aria-label="사용자 메뉴">
          {session ? (
            <UserMenu
              name={session.user.name ?? "사용자"}
              image={session.user.image ?? null}
              userId={session.user.id}
            />
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg px-4 py-1.5"
            >
              로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
