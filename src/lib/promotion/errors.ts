export type PromotionErrorCode =
  | "BIRTHDAY_CHANGE_REQUIRES_SUPPORT"
  | "BIRTHDAY_DATE_INVALID"
  | "BIRTHDAY_NOT_SET"
  | "BIRTHDAY_OUTSIDE_WINDOW"
  | "MARKET_RULE_NOT_FOUND"
  | "NO_EFFECTIVE_POLICY"
  | "POLICY_ACTIVATION_INVALID"
  | "POLICY_NOT_DRAFT"
  | "PROMOTION_GRANT_IDENTITY_CONFLICT"
  | "QUALIFYING_PURCHASE_REQUIRED"
  | "SIGNUP_EMAIL_NOT_VERIFIED"
  | "SIGNUP_PRIOR_PURCHASE_EXISTS"
  | "USER_NOT_FOUND";

export class PromotionError extends Error {
  constructor(
    readonly code: PromotionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PromotionError";
  }
}
