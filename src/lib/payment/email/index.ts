export {
  createTransactionalEmailHandlers,
  type TransactionalEmailHandlerDependencies,
} from "./handlers";
export {
  enqueueOrderPaidEmailIntent,
  enqueueRefundSucceededEmailIntent,
} from "./intent";
export {
  type TransactionalEmailPort,
  type TransactionalEmailSendInput,
} from "./port";
export {
  PL09_RECIPIENT_MODE,
  PL09_REFUND_ATTEMPT_ID,
  createPrismaPl09OutboxStore,
  requirePl09SandboxRecipient,
  runPl09TargetedRefundDispatchOnce,
  type Pl09DispatchResult,
  type Pl09OutboxIntent,
  type Pl09OutboxStore,
  type Pl09RecipientEnvironment,
  type RunPl09TargetedRefundDispatchInput,
} from "./pl09-targeted-refund-dispatch";
export {
  createPrismaTransactionalEmailProjectionSource,
  type EmailProjectionResult,
  type OrderPaidEmailProjection,
  type RefundSucceededEmailProjection,
  type TransactionalEmailProjectionSource,
} from "./projection";
export { buildOrderPaidEmail, buildRefundSucceededEmail } from "./templates";
export {
  CUSTOMER_ORDER_PAID_EMAIL_V1,
  CUSTOMER_REFUND_SUCCEEDED_EMAIL_V1,
  orderPaidEmailDedupKey,
  parseOrderPaidEmailPayload,
  parseRefundSucceededEmailPayload,
  refundSucceededEmailDedupKey,
} from "./topics";
