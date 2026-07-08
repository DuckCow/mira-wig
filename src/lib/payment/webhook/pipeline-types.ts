import type { PaymentProvider, PrismaClient } from "@prisma/client";
import type {
  ProviderVerifiedWebhookInput,
  ProviderWebhookParser,
  ProviderWebhookVerifier,
} from "@/lib/payment/providers/contract";
import type { ProviderEnv } from "@/lib/payment/providers/credentials";
import type { SandboxExternalCodeRegistryEntry } from "@/lib/payment/providers/factory";
import type { TossLookupFetch } from "@/lib/payment/providers/toss/lookup-http";
import type { RecordedEvent } from "./record";

export interface WebhookHandleResult {
  kind: "processed" | "duplicate" | "ignored" | "retryable" | "verifyFailed" | "failed";
  status: number;
  eventId?: string;
}

export interface WebhookHandleOptions {
  env?: ProviderEnv;
  fetchFn?: TossLookupFetch;
  tossLookupBaseUrl?: string;
  tossLookupTimeoutMs?: number;
  now?: () => Date;
  sandboxExternalCodeRegistry?: readonly SandboxExternalCodeRegistryEntry[];
}

export interface WebhookProviderPipeline {
  kind: "mock" | "verified";
  verifier: ProviderWebhookVerifier;
  parser: ProviderWebhookParser;
  resolveDuplicate(input: DuplicateReplayInput): Promise<DuplicateReplayDecision>;
}

export interface DuplicateReplayInput {
  client: PrismaClient;
  provider: PaymentProvider;
  event: RecordedEvent | null;
  incomingRawBody: string;
  receivedAt: Date;
}

export type DuplicateReplayDecision =
  | { kind: "handled"; result: WebhookHandleResult }
  | { kind: "reprocess"; input: ProviderVerifiedWebhookInput; eventId: string };

export class WebhookParseError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WebhookParseError";
  }
}
