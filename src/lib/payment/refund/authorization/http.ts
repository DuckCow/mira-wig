import { readAuthorizationJson } from "./json-body";
import type { PrismaClient } from "@prisma/client";
import { consumeRefundExecutionAuthorization } from "./admission";
import { digest, exactFields, identifier, RefundAuthorizationError, requireAuthorizationEnabled, type AuthorizationEnv } from "./contract";
import { type LoadRefundReentryRelease } from "./release";
import { VerifiedRefundExecution, type RuntimeIdentityPort } from "./runtime";

export function createRefundAuthorizationAdmissionHandler(dependencies: Readonly<{
  database: PrismaClient; loadRelease: LoadRefundReentryRelease; runtime: RuntimeIdentityPort; env: AuthorizationEnv;
}>) {
  return async (request: Request): Promise<Response> => {
    try {
      requireAuthorizationEnabled(dependencies.env);
      const input = parseAdmissionInput(await readAuthorizationJson(request));
      const bearer = request.headers.get("authorization") ?? "";
      if (!/^Bearer [A-Za-z0-9._-]{1,8192}$/u.test(bearer)) throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
      const release = await dependencies.loadRelease(configuredReleaseDigest(dependencies.env));
      const execution = await VerifiedRefundExecution.verify(bearer.slice(7), input.executionName, input.grantId, release, dependencies.runtime);
      const admitted = await consumeRefundExecutionAuthorization(dependencies.database, execution, dependencies.loadRelease, dependencies.env);
      return reply({ ok: true, ...admitted, account: {
        mid: release.mid, merchantAccountBindingId: release.merchantAccountBindingId,
        credentialGenerationBindingId: release.credentialGenerationBindingId,
        secretResource: release.secretResource, secretVersion: release.secretVersion,
      } }, 200);
    } catch (error) {
      if (!(error instanceof RefundAuthorizationError)) throw error;
      return reply({ ok: false, code: error.code }, errorStatus(error));
    }
  };
}

function parseAdmissionInput(value: unknown) {
  if (!exactFields(value, ["grantId", "executionName"])) throw new RefundAuthorizationError("INVALID_INPUT");
  if (!identifier(value.grantId)) throw new RefundAuthorizationError("INVALID_INPUT");
  if (typeof value.executionName !== "string" || value.executionName.length > 255) throw new RefundAuthorizationError("INVALID_INPUT");
  return { grantId: value.grantId, executionName: value.executionName };
}


function reply(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}

function errorStatus(error: RefundAuthorizationError): number {
  if (error.code === "FEATURE_DISABLED") return 503;
  if (error.code === "EXECUTION_UNVERIFIED") return 401;
  if (error.code === "INVALID_INPUT") return 400;
  if (error.code === "NOT_FOUND") return 404;
  return 409;
}

function configuredReleaseDigest(env: AuthorizationEnv): string {
  const value = env.MIRA_REFUND_REENTRY_RELEASE_SHA256;
  if (!digest(value)) throw new RefundAuthorizationError("CONFIG_INVALID");
  return value;
}
