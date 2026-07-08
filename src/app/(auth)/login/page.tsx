import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GoogleSignInButton } from "./GoogleSignInButton";

export const metadata = { title: "로그인" };

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/styles");

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-6">
        <header className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Mira</h1>
          <p className="text-sm text-gray-500">가발 가상 피팅 플랫폼</p>
        </header>

        <div className="space-y-3">
          <GoogleSignInButton />
        </div>

        <p className="text-xs text-center text-gray-400">
          로그인하면 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </div>
    </main>
  );
}
