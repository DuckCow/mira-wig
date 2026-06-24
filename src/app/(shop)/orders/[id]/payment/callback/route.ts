import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { confirmPayment } from "@/lib/payment/process";

type RouteParams = { params: Promise<{ id: string }> };

function redirectTo(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

function paymentUrl(request: NextRequest, id: string): URL {
  return new URL(`/orders/${id}/payment`, request.url);
}

function parseAmount(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function paymentRedirect(request: NextRequest, id: string, key: "error" | "status", value: string): NextResponse {
  const url = paymentUrl(request, id);
  url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const session = await getSession();
  const { id } = await params;
  if (!session) return redirectTo(request, `/login?callbackUrl=${encodeURIComponent(request.nextUrl.pathname)}`);

  const query = request.nextUrl.searchParams;
  const orderId = query.get("orderId");
  const paymentKey = query.get("paymentKey");
  const redirectAmount = parseAmount(query.get("amount"));
  if (orderId !== id || !paymentKey || redirectAmount === null) {
    return paymentRedirect(request, id, "error", "결제 승인 정보가 올바르지 않습니다.");
  }

  const result = await confirmPayment({ orderId, userId: session.user.id, paymentKey, redirectAmount });
  if (result.status === "success") return redirectTo(request, `/orders/${id}`);
  if (result.status === "unconfirmed") return paymentRedirect(request, id, "status", "processing");
  if (result.status === "pending") return paymentRedirect(request, id, "status", "processing");
  return paymentRedirect(request, id, "error", result.error);
}
