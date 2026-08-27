export type TransactionalEmailDeliveryDisposition = "TRANSIENT" | "PERMANENT";

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;

export class TransactionalEmailDeliveryError extends Error {
  readonly disposition: TransactionalEmailDeliveryDisposition;
  readonly safeCode: string;

  constructor(disposition: TransactionalEmailDeliveryDisposition, safeCode: string) {
    if (!SAFE_CODE_PATTERN.test(safeCode)) {
      throw new Error("TRANSACTIONAL_EMAIL_SAFE_CODE_INVALID");
    }
    super(safeCode);
    this.name = "TransactionalEmailDeliveryError";
    this.disposition = disposition;
    this.safeCode = safeCode;
  }
}
