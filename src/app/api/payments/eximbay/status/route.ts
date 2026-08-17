import { db } from "@/lib/db";
import { handleEximbayBf4StatusRoute } from "@/lib/payment/eximbay/bf4-status-route";

export const runtime = "nodejs";

export function POST(request: Request): Promise<Response> {
  return handleEximbayBf4StatusRoute(db, request, process.env, globalThis.fetch);
}
