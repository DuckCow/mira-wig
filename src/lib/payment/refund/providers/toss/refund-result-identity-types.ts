import type {
  OrderStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptStatus,
  RefundExecutionCommandStatus,
  RefundExecutionDispatchAttemptState,
  RefundExecutionEvidenceApplication,
  RefundExecutionEvidenceOutcome,
  RefundExecutionEvidenceSource,
} from "@prisma/client";
import type {
  TossRefundResultAcquisitionEvent,
  TossRefundResultEvidenceProvenance,
} from "./refund-result-provenance";

export const TOSS_RESULT_IDENTITY_FAILURE_CODE = "TOSS_RESULT_IDENTITY_MISMATCH";

export type EligibilityProofSnapshot = Readonly<{
  paymentKey: string;
  method: string;
  easyPayPresent: boolean;
  currency: string;
  providerStatus: string;
  totalAmount: number;
  balanceAmount: number;
  taxFreeAmount: number;
  taxExemptionAmount: number;
  cancelsCount: number;
  localReceivedAt: number;
  eligibilityFingerprint: string;
}>;

type CancellationSuccessSnapshot = Readonly<{
  paymentKey: string;
  currency: string;
  paymentStatus: string;
  totalAmount: number;
  balanceAmount: number;
  transactionKey: string;
  cancelStatus: string;
  cancelAmount: number;
  cancelReason: string;
}>;

export type TossRefundResultIdentitySnapshot = Readonly<{
  commandId: string;
  refundAttempt: Readonly<{
    id: string;
    paymentId: string;
    provider: PaymentProvider;
    mode: PaymentMode;
    amount: number;
    currency: string;
    idempotencyKey: string;
  }>;
  payment: Readonly<{
    id: string;
    provider: PaymentProvider;
    mode: PaymentMode;
    amount: number;
    currency: string;
    paymentKey: string;
  }>;
  binding: Readonly<{
    id: string;
    refundAttemptId: string;
    provider: PaymentProvider;
    mode: PaymentMode;
    providerOperationFamilyKey: string;
    operationFamilyKeyAlgorithmVersion: string;
    wireContractVersion: string;
    operationFamilyFingerprint: string;
    merchantAccountBindingId: string;
    credentialGenerationBindingId: string;
  }>;
  expectedCredential: Readonly<{
    merchantAccountBindingId: string;
    credentialGenerationBindingId: string;
  }>;
  authorizationProof: EligibilityProofSnapshot & Readonly<{ bindingId: string }>;
  contactProof: EligibilityProofSnapshot & Readonly<{ dispatchAttemptId: string }>;
  dispatch: Readonly<{
    id: string;
    commandId: string;
    ordinal: number;
    leaseGeneration: number;
    provider: PaymentProvider;
    mode: PaymentMode;
    providerOperationKey: string;
    requestFingerprint: string;
    state: RefundExecutionDispatchAttemptState;
    contactMarkedAt: number | null;
  }>;
  evidenceProvenance: TossRefundResultEvidenceProvenance;
  acquisitionEvent: TossRefundResultAcquisitionEvent;
  success: CancellationSuccessSnapshot;
}>;

export type TossRefundResultProjectionPlan = Readonly<{
  sourceDedupKey: string;
  evidenceSource: RefundExecutionEvidenceSource;
  evidenceOutcome: RefundExecutionEvidenceOutcome;
  evidenceApplication: RefundExecutionEvidenceApplication;
  observedProviderRefundId: string;
  reportedAmount: number;
  reportedCurrency: "KRW";
  refundAttemptStatus: RefundAttemptStatus;
  orderStatus: OrderStatus;
  commandStatus: RefundExecutionCommandStatus;
  dispatchAttemptId: string;
  authorizingLeaseGeneration: number;
}>;

export type PlanTossRefundResultIdentity =
  | Readonly<{ ok: true; plan: TossRefundResultProjectionPlan }>
  | Readonly<{ ok: false; code: typeof TOSS_RESULT_IDENTITY_FAILURE_CODE }>;
