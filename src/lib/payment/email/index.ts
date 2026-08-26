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
