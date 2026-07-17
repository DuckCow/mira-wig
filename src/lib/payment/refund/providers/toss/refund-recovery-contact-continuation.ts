import type { PrismaClient } from "@prisma/client";
import { tossBasicAuthorization } from "@/lib/payment/providers/toss/auth";
import type { ConfiguredTossRefundCredential } from "./refund-credential-config";
import {
  normalizeTossRefundCancellationSuccess,
} from "./refund-cancellation-response";
import type {
  TossRefundCancellationPort,
  TossRefundCancellationTransportResult,
} from "./refund-cancellation-http";
import {
  recoveryFailure,
  type RecoverTossRefundExecutionResult,
} from "./refund-recovery-contract";
import type { TossRecoveryContactHandle } from "./refund-recovery-ordinal-admission";
import { applyTossRecoveryPostSuccess } from "./refund-recovery-post-result-application";
import { deriveTossRefundCancellationWireRequest } from "./refund-wire-request";

export async function continueTossRecoveryContact(
  cancellation: TossRefundCancellationPort,
  client: PrismaClient,
  handle: TossRecoveryContactHandle,
  capturedCredential: ConfiguredTossRefundCredential,
): Promise<RecoverTossRefundExecutionResult> {
  const wire = deriveTossRefundCancellationWireRequest({
    paymentKey: handle.paymentKey,
    providerOperationKey: handle.providerOperationKey,
    cancelAmount: handle.fullAmount,
  });
  let transport: TossRefundCancellationTransportResult;
  try {
    transport = await cancellation(Object.freeze({
      authorization: tossBasicAuthorization(capturedCredential.readSecretKey()),
      wire,
    }));
  } catch {
    transport = Object.freeze({ kind: "unknown" });
  }
  if (transport.kind === "rejected") return responseRejected();
  if (transport.kind === "unknown") return outcomeUnknown();
  const normalized = normalizeTossRefundCancellationSuccess(transport.body, {
    paymentKey: handle.paymentKey,
    fullAmount: handle.fullAmount,
  });
  return normalized.ok
    ? applyTossRecoveryPostSuccess(client, handle, capturedCredential, normalized.candidate)
    : outcomeUnknown();
}

const outcomeUnknown = () => recoveryFailure(
  "RECOVERY_CONTACT_OUTCOME_UNKNOWN",
  "Toss refund recovery contact outcome is unknown.",
);
const responseRejected = () => recoveryFailure(
  "RECOVERY_CONTACT_RESPONSE_REJECTED",
  "Toss refund recovery contact response was rejected.",
);
