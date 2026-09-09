import { db } from "@/lib/db";
import { createRefundAuthorizationAdmissionHandler } from "@/lib/payment/refund/authorization/http";
import { loadRefundReentryRelease } from "@/lib/payment/refund/authorization/release";
import { googleRuntimeIdentity } from "@/lib/payment/refund/authorization/runtime";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return createRefundAuthorizationAdmissionHandler({
    database: db, loadRelease: loadRefundReentryRelease, runtime: googleRuntimeIdentity, env: process.env,
  })(request);
}
