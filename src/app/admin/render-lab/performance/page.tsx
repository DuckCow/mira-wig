import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { RenderPerformanceClient } from "./RenderPerformanceClient";

export const metadata: Metadata = {
  title: "Render Performance Characterization | 어드민",
  robots: { index: false, follow: false },
};

export default async function RenderPerformancePage() {
  const guard = await requireAdmin();
  if (!guard.success) redirect("/");

  return <RenderPerformanceClient />;
}
