import { readAuthorizationJson } from "./json-body";
import type { PrismaClient } from "@prisma/client";
import { consumeRefundExecutionAuthorization } from "./admission";
import { digest, exactFields, identifier, REFUND_REENTRY_ADMISSION_AUTH_HEADER, RefundAuthorizationError, requireAuthorizationEnabled, type AuthorizationEnv } from "./contract";
import { type LoadRefundReentryRelease } from "./release";
import {
  RefundExecutionVerificationError, VerifiedRefundExecution,
  type RuntimeIdentityPort, type TaskLookupDiagnosticEvent, type TaskLookupDiagnosticSink,
} from "./runtime";

const ADMISSION_ROUTE = "refund_reentry_admission";
const ADMISSION_METHOD = "POST";

export type RefundAdmissionFailureStage =
  | "SHARED_GATE"
  | "REQUEST_VALIDATION"
  | "AUTH_HEADER"
  | "RELEASE_LOAD"
  | "TOKEN_VERIFICATION"
  | "EXECUTION_LOOKUP"
  | "EXECUTION_VERIFICATION"
  | "TASK_LOOKUP"
  | "TASK_VERIFICATION"
  | "AUTHORIZATION_ADMISSION";

type RefundAdmissionContext = Readonly<{ route: typeof ADMISSION_ROUTE; method: typeof ADMISSION_METHOD; traceId?: string }>;

type RefundAdmissionLifecycleDiagnosticEvent = Readonly<{
  event: "refund_reentry_admission_entered" | "refund_reentry_admission_rejected";
  route: typeof ADMISSION_ROUTE;
  method: typeof ADMISSION_METHOD;
  traceId?: string;
  stage?: RefundAdmissionFailureStage;
  reason?: AuthorizationDiagnosticReason;
}>;

export type RefundAdmissionDiagnosticEvent = RefundAdmissionLifecycleDiagnosticEvent
  | Readonly<TaskLookupDiagnosticEvent & Pick<RefundAdmissionContext, "traceId">>;

type AuthorizationDiagnosticReason =
  | "GATE_DISABLED"
  | "INVALID_REQUEST"
  | "INVALID_BEARER"
  | "CONFIG_INVALID"
  | "RELEASE_MISMATCH"
  | "EXECUTION_UNVERIFIED"
  | "AUTHORIZATION_REJECTED";

export type RefundAdmissionDiagnosticLogger = Readonly<{
  emit(event: RefundAdmissionDiagnosticEvent): void | Promise<void>;
}>;

const cloudRunDiagnosticLogger: RefundAdmissionDiagnosticLogger = Object.freeze({
  emit(event) { console.info(JSON.stringify(event)); },
});

export function createRefundAuthorizationAdmissionHandler(dependencies: Readonly<{
  database: PrismaClient; loadRelease: LoadRefundReentryRelease; runtime: RuntimeIdentityPort; env: AuthorizationEnv;
  diagnostics?: RefundAdmissionDiagnosticLogger;
}>) {
  return async (request: Request): Promise<Response> => {
    const diagnostics = dependencies.diagnostics ?? cloudRunDiagnosticLogger;
    const context = diagnosticContext(request);
    safeEmit(diagnostics, { event: "refund_reentry_admission_entered", ...context });
    let rejectionEmitted = false;
    try {
      requireAuthorizationEnabled(dependencies.env);
      const input = parseAdmissionInput(await readAuthorizationJson(request));
      const bearer = request.headers.get(REFUND_REENTRY_ADMISSION_AUTH_HEADER) ?? "";
      if (!/^Bearer [A-Za-z0-9._-]{1,8192}$/u.test(bearer)) {
        safeEmit(diagnostics, rejectionEvent(context, "AUTH_HEADER", "INVALID_BEARER"));
        rejectionEmitted = true;
        throw new RefundAuthorizationError("EXECUTION_UNVERIFIED");
      }
      const release = await dependencies.loadRelease(configuredReleaseDigest(dependencies.env));
      const execution = await VerifiedRefundExecution.verify(
        bearer.slice(7), input.executionName, input.grantId, release, dependencies.runtime,
        taskLookupDiagnostics(diagnostics, context),
      );
      const admitted = await consumeRefundExecutionAuthorization(dependencies.database, execution, dependencies.loadRelease, dependencies.env);
      return reply({ ok: true, ...admitted, account: {
        mid: release.mid, merchantAccountBindingId: release.merchantAccountBindingId,
        credentialGenerationBindingId: release.credentialGenerationBindingId,
        secretResource: release.secretResource, secretVersion: release.secretVersion,
      } }, 200);
    } catch (error) {
      if (!(error instanceof RefundAuthorizationError)) throw error;
      if (!rejectionEmitted) safeEmit(diagnostics, rejectionForError(context, error));
      return reply({ ok: false, code: error.code }, errorStatus(error));
    }
  };
}

function diagnosticContext(request: Request): RefundAdmissionContext {
  const traceId = cloudTraceId(request.headers.get("x-cloud-trace-context"));
  return traceId ? { route: ADMISSION_ROUTE, method: ADMISSION_METHOD, traceId } : { route: ADMISSION_ROUTE, method: ADMISSION_METHOD };
}

function cloudTraceId(value: string | null): string | undefined {
  const match = /^([0-9a-f]{32})(?:\/\d+)?(?:;o=\d+)?$/iu.exec(value ?? "");
  return match?.[1].toLowerCase();
}

function rejectionForError(
  context: RefundAdmissionContext,
  error: RefundAuthorizationError,
): RefundAdmissionDiagnosticEvent {
  if (error instanceof RefundExecutionVerificationError) {
    return rejectionEvent(context, error.stage, "EXECUTION_UNVERIFIED");
  }
  const { code } = error;
  if (code === "FEATURE_DISABLED") return rejectionEvent(context, "SHARED_GATE", "GATE_DISABLED");
  if (code === "INVALID_INPUT") return rejectionEvent(context, "REQUEST_VALIDATION", "INVALID_REQUEST");
  if (code === "CONFIG_INVALID") return rejectionEvent(context, "RELEASE_LOAD", "CONFIG_INVALID");
  if (code === "RELEASE_MISMATCH") return rejectionEvent(context, "RELEASE_LOAD", "RELEASE_MISMATCH");
  if (code === "EXECUTION_UNVERIFIED") return rejectionEvent(context, "EXECUTION_VERIFICATION", "EXECUTION_UNVERIFIED");
  return rejectionEvent(context, "AUTHORIZATION_ADMISSION", "AUTHORIZATION_REJECTED");
}

function rejectionEvent(
  context: RefundAdmissionContext,
  stage: RefundAdmissionFailureStage,
  reason: AuthorizationDiagnosticReason,
): RefundAdmissionDiagnosticEvent {
  return { event: "refund_reentry_admission_rejected", ...context, stage, reason };
}

function taskLookupDiagnostics(logger: RefundAdmissionDiagnosticLogger, context: RefundAdmissionContext): TaskLookupDiagnosticSink {
  return (event) => safeEmit(logger, context.traceId ? { ...event, traceId: context.traceId } : event);
}

function safeEmit(logger: RefundAdmissionDiagnosticLogger, event: RefundAdmissionDiagnosticEvent): void {
  try {
    const emitted = logger.emit(event);
    if (emitted) void emitted.catch(() => {});
  } catch { /* Logging is never an admission dependency. */ }
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
