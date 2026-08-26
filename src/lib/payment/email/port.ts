export interface TransactionalEmailSendInput {
  idempotencyKey: string;
  to: string;
  subject: string;
  text: string;
}

export interface TransactionalEmailPort {
  send(input: TransactionalEmailSendInput): Promise<void>;
}
