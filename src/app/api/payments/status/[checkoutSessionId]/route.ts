import { db } from "@/lib/db";
import { readPaymentReturnStatus } from "@/lib/payment/return-status";
import type { PaymentReturnStatus } from "@/lib/payment/return-status-contract";
import { getSession } from "@/lib/session";

type RouteParams = Promise<{ checkoutSessionId: string }>;

const UNAVAILABLE: PaymentReturnStatus = { kind: "UNAVAILABLE" };
const RESPONSE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(
  _request: Request,
  { params }: { params: RouteParams },
): Promise<Response> {
  const session = await getSession();
  if (!session?.user.id) return statusResponse(UNAVAILABLE, 401);

  const { checkoutSessionId } = await params;
  const status = await readPaymentReturnStatus(db, {
    checkoutSessionId,
    userId: session.user.id,
  });
  if (!status) return statusResponse(UNAVAILABLE, 404);
  return statusResponse(status, 200);
}

function statusResponse(status: PaymentReturnStatus, httpStatus: number): Response {
  return Response.json(status, { status: httpStatus, headers: RESPONSE_HEADERS });
}
