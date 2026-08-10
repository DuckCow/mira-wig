import { EximbayProtocolError } from "./errors";

export type EximbayInquiryStatus = "SALE" | "AUTH" | "REGISTERED" | "NONE";

export interface EximbayInquiryClassification {
  readonly status: EximbayInquiryStatus;
  readonly potentialCompletedSale: boolean;
}

export const EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS: Readonly<
  Record<EximbayInquiryStatus, EximbayInquiryClassification>
> = Object.freeze({
  SALE: Object.freeze({ status: "SALE", potentialCompletedSale: true }),
  AUTH: Object.freeze({ status: "AUTH", potentialCompletedSale: false }),
  REGISTERED: Object.freeze({ status: "REGISTERED", potentialCompletedSale: false }),
  NONE: Object.freeze({ status: "NONE", potentialCompletedSale: false }),
});

export function classifyEximbayInquiryStatus(input: unknown): EximbayInquiryClassification {
  switch (input) {
    case "SALE":
      return EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS.SALE;
    case "AUTH":
      return EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS.AUTH;
    case "REGISTERED":
      return EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS.REGISTERED;
    case "NONE":
      return EXIMBAY_INQUIRY_STATUS_CLASSIFICATIONS.NONE;
    default:
      throw new EximbayProtocolError("UNKNOWN_INQUIRY_STATUS");
  }
}
