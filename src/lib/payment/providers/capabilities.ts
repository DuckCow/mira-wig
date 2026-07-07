export const ProviderCapability = {
  ACTION_ADAPTER: "ACTION_ADAPTER",
  WEBHOOK_VERIFIER: "WEBHOOK_VERIFIER",
  VOID_EXECUTOR: "VOID_EXECUTOR",
} as const;

export type ProviderCapability = (typeof ProviderCapability)[keyof typeof ProviderCapability];
