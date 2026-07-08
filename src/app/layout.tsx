import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/features/Header";
import { SessionProvider } from "@/components/features/SessionProvider";
import { getSession } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Mira — 가발 가상 피팅 플랫폼",
    template: "%s — Mira",
  },
  description: "나에게 맞는 가발 스타일을 가상으로 피팅해보세요.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession();

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider session={session}>
          <Header />
          <div className="flex-1">{children}</div>
        </SessionProvider>
      </body>
    </html>
  );
}
