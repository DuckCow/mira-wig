import type {
  FulfillmentType,
  MrStatus,
  OrderStatus,
  PaymentAttemptStatus,
  PaymentMode,
  PaymentProvider,
  RefundAttemptActorType,
  ShippingCountry,
} from "@prisma/client";
import type { RefundAmountStateInput } from "@/lib/payment/refund/invariants";

type NullableDate = Date | null;

export interface AdminOrderDetailSource {
  id: string;
  status: OrderStatus;
  disputeStatus: string | null;
  paidAt: Date;
  createdAt: Date;
  updatedAt: Date;
  marketCode: string;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  totalAmount: number;
  user: { id: string; email: string; name: string | null };
  shipping: ShippingSource | null;
  items: ItemSource[];
  payment: PaymentSource;
  refundAttempts: RefundAttemptSource[];
}

interface ShippingSource {
  recipientName: string;
  phone: string;
  country: ShippingCountry;
  postalCode: string;
  administrativeArea: string;
  city: string;
  addressLine1: string;
  addressLine2: string | null;
  memo: string | null;
  updatedAt: Date;
}

interface ItemSource {
  id: string;
  quantity: number;
  unitAmount: number;
  fulfillmentType: FulfillmentType;
  snapshotData: unknown;
  mr: { status: MrStatus; startedAt: NullableDate; createdAt: Date; updatedAt: Date } | null;
}

interface PaymentSource {
  id: string;
  status: PaymentAttemptStatus;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  mode: PaymentMode;
  createdAt: Date;
  updatedAt: Date;
  providerPaymentKeyPresent: boolean;
}

interface RefundAttemptSource extends RefundAmountStateInput {
  id: string;
  reason: string;
  actorType: RefundAttemptActorType;
  actorUserId: string | null;
  provider: PaymentProvider;
  mode: PaymentMode;
  requestedAt: Date;
  processedAt: NullableDate;
  failedAt: NullableDate;
  safeFailureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminOrderDetailViewModel {
  id: string;
  statusLabel: string;
  paidAt: string;
  createdAt: string;
  updatedAt: string;
  marketCode: string;
  currency: string;
  customer: { id: string; name: string; email: string };
  amounts: { subtotal: string; shipping: string; total: string };
  shipping: null | ShippingViewModel;
  items: ItemViewModel[];
  payment: PaymentViewModel;
  refundReview: RefundReviewViewModel;
  refundAttempts: RefundAttemptViewModel[];
}

interface ShippingViewModel extends Omit<ShippingSource, "country" | "updatedAt"> {
  country: string;
  updatedAt: string;
}

interface ItemViewModel {
  id: string;
  name: string;
  options: string;
  fulfillment: string;
  quantity: number;
  unitAmount: string;
  lineTotal: string;
  mrStatus: string;
  mrCreatedAt: string;
  mrStartedAt: string;
  mrUpdatedAt: string;
}

interface PaymentViewModel {
  id: string;
  status: string;
  amount: string;
  providerContext: string;
  createdAt: string;
  updatedAt: string;
}

interface RefundReviewViewModel {
  orderTotal: string;
  paymentAmount: string;
  succeededAmount: string;
  guardedAmount: string;
  remainingRefundableAmount: string;
  remainingRequestableAmount: string;
  openAttempt: string;
  guardedAttempt: string;
  paymentStatus: string;
  executionReference: string;
  paymentIdentityMatch: string;
  orderStatusRefundable: string;
  disputeReview: string;
}

interface RefundAttemptViewModel {
  shortId: string;
  status: string;
  amount: string;
  reason: string;
  actor: string;
  requestedAt: string;
  processedAt: string | null;
  failedAt: string | null;
  providerContext: string;
  safeFailureMessage: string | null;
}
