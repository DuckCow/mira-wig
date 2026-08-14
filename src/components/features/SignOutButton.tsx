"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ label = "Sign out", callbackUrl = "/login" }: { label?: string; callbackUrl?: string }) {
  return (
    <button
      type="button"
      onClick={() => { void signOut({ callbackUrl }); }}
      className="text-sm text-gray-500 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5"
    >
      {label}
    </button>
  );
}
