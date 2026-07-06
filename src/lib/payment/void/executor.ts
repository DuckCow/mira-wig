import type { PaymentProvider } from "@prisma/client";

export interface VoidExecutorInput {
  provider: PaymentProvider;
  providerPaymentKey: string;
  operationKey: string;
  reason: string;
}

export type VoidExecutorResult =
  | { ok: true }
  | { retryable: true; reason: string };

export interface VoidExecutor {
  void(input: VoidExecutorInput): Promise<VoidExecutorResult>;
}

export type MockVoidExecutorMode = "success" | "retryable-fail";

export interface MockVoidExecutorOptions {
  mode?: MockVoidExecutorMode;
}

export function createMockVoidExecutor(options: MockVoidExecutorOptions = {}): VoidExecutor {
  return { void: (input) => mockVoid(input, options) };
}

function mockVoid(
  _input: VoidExecutorInput,
  options: MockVoidExecutorOptions,
): Promise<VoidExecutorResult> {
  const mode = options.mode ?? configuredMode();
  if (mode === "retryable-fail") return Promise.resolve({ retryable: true, reason: "Mock void retryable failure" });
  return Promise.resolve({ ok: true });
}

function configuredMode(): MockVoidExecutorMode {
  return process.env.PAYMENT_VOID_MOCK_MODE === "retryable-fail" ? "retryable-fail" : "success";
}

