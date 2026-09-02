import "server-only";

import {
  PaymentMode,
  PaymentProvider,
  type PrismaClient,
} from "@prisma/client";
import {
  initiateSyntheticSalePaymentAttemptWithTransientAuthority,
  PaymentInitiateException,
} from "@/lib/payment/attempt/initiate";
import { materializeFreshEximbayReadyHandoffWithClient } from "@/lib/payment/eximbay/sdk-handoff";
import type { EximbayReadyHandoffV1 } from "@/lib/payment/eximbay/sdk-handoff-contract";
import type { EximbayReadyFetch } from "@/lib/payment/eximbay/ready-http";
import { ProviderCapability } from "@/lib/payment/providers/capabilities";
import type { ProviderFactoryContext } from "@/lib/payment/providers/contract";
import { credentialChecksForProvider, type ProviderEnv } from "@/lib/payment/providers/credentials";
import {
  liveGuardForProviderContext,
  NoEligibleProviderError,
  PaymentMethod,
  resolveProviderForPayment,
  type ProviderResolution,
} from "@/lib/payment/providers/routing";
import {
  SYNTHETIC_SALE_AMOUNT_MINOR,
  SYNTHETIC_SALE_CURRENCY,
  SYNTHETIC_SALE_MARKET,
  SYNTHETIC_SALE_MID,
  SYNTHETIC_SALE_ROUTING_RULE,
  syntheticSaleRunIdentity,
  type SyntheticSaleRuntimeConfiguration,
} from "./contract";
import { materializeSyntheticSaleFixture, type SyntheticSaleFixture } from "./fixture";
import { SessionException } from "@/lib/payment/session/types";
import {
  readSyntheticSaleStatus,
  type SyntheticSaleStatusResult,
} from "./status-readback";

type RuntimePhase = "READY" | "STARTING" | "CONTACTED";

export type SyntheticSaleStartFailureStage =
  | "START_GUARD"
  | "DURABLE_PREFLIGHT"
  | "FIXTURE_MATERIALIZATION"
  | "CHECKOUT_SESSION"
  | "PAYMENT_PREPARATION"
  | "READY_CONTACT"
  | "HANDOFF_MATERIALIZATION";

export type SyntheticSaleStartFailureEvidence = Readonly<{
  ok: false;
  code: "SYNTHETIC_SALE_START_FAILURE";
  runId: string;
  stage: SyntheticSaleStartFailureStage;
  failureCode: string;
}>;

export type SyntheticSaleStartFailureWriter = (evidence: SyntheticSaleStartFailureEvidence) => void;

const SYNTHETIC_SALE_SAFE_ERROR_CODES = new Set([
  "SYNTHETIC_SALE_ALREADY_STARTED",
  "SYNTHETIC_SALE_RUN_IDENTITY_INVALID",
  "SYNTHETIC_SALE_MARKET_INVALID",
  "SYNTHETIC_SALE_FIXTURE_DRIFT",
  "SYNTHETIC_SALE_SESSION_AMBIGUOUS",
  "SYNTHETIC_SALE_ROUTING_DRIFT",
  "SYNTHETIC_SALE_FRESH_READY_REQUIRED",
  "SYNTHETIC_SALE_HANDOFF_DRIFT",
]);

export interface SyntheticSaleRunOwner {
  readonly capability: string;
  readonly runIdentity: string;
  start(): Promise<EximbayReadyHandoffV1>;
  status(sessionId?: string): Promise<SyntheticSaleStatusResult>;
}

export function createSyntheticSaleRunOwner(
  client: PrismaClient,
  configuration: SyntheticSaleRuntimeConfiguration,
  fetchImpl: EximbayReadyFetch = fetch,
  writeStartFailure: SyntheticSaleStartFailureWriter = () => undefined,
): SyntheticSaleRunOwner {
  const runIdentity = syntheticSaleRunIdentity(configuration.capability);
  let phase: RuntimePhase = "READY";
  let startFlight: Promise<EximbayReadyHandoffV1> | null = null;
  let fixture: SyntheticSaleFixture | null = null;

  const start = (): Promise<EximbayReadyHandoffV1> => {
    if (phase !== "READY" || startFlight) {
      const error = new Error("SYNTHETIC_SALE_ALREADY_STARTED");
      writeFailure(writeStartFailure, startFailureEvidence(runIdentity, "START_GUARD", error));
      return Promise.reject(error);
    }
    let failureStage: SyntheticSaleStartFailureStage = "DURABLE_PREFLIGHT";
    phase = "STARTING";
    startFlight = executeStart(client, configuration, runIdentity, fetchImpl, (stage) => {
      failureStage = stage;
    }).then((result) => {
      fixture = result.fixture;
      phase = "CONTACTED";
      return result.handoff;
    }, (error: unknown) => {
      phase = "CONTACTED";
      writeFailure(writeStartFailure, startFailureEvidence(runIdentity, failureStage, error));
      throw error;
    });
    return startFlight;
  };
  return Object.freeze({
    capability: configuration.capability,
    runIdentity,
    start,
    status: (sessionId?: string) => readSyntheticSaleStatus(
      client,
      runIdentity,
      fixture?.sessionId,
      sessionId,
    ),
  });
}

async function executeStart(
  client: PrismaClient,
  configuration: SyntheticSaleRuntimeConfiguration,
  runIdentity: string,
  fetchImpl: EximbayReadyFetch,
  onStage: (stage: SyntheticSaleStartFailureStage) => void,
): Promise<Readonly<{ fixture: SyntheticSaleFixture; handoff: EximbayReadyHandoffV1 }>> {
  onStage("DURABLE_PREFLIGHT");
  const existing = await readSyntheticSaleStatus(client, runIdentity);
  if (existing.state !== "WAITING" || existing.sessionId) {
    throw new Error("SYNTHETIC_SALE_ALREADY_STARTED");
  }
  onStage("FIXTURE_MATERIALIZATION");
  const fixture = await materializeSyntheticSaleFixture(client, runIdentity, {
    onCheckoutSessionStart: () => onStage("CHECKOUT_SESSION"),
  });
  onStage("PAYMENT_PREPARATION");
  const resolution = resolveProviderForPayment({
    market: SYNTHETIC_SALE_MARKET,
    method: PaymentMethod.CARD,
    currency: SYNTHETIC_SALE_CURRENCY,
    amountMinor: SYNTHETIC_SALE_AMOUNT_MINOR,
    mode: PaymentMode.SANDBOX,
  });
  if (!isExactRouting(resolution)) {
    throw new Error("SYNTHETIC_SALE_ROUTING_DRIFT");
  }
  const providerEnv: ProviderEnv = {
    ...configuration.providerEnv,
    PAYMENT_PUBLIC_ORIGIN: configuration.publicOrigin,
  };
  const readyFetch: EximbayReadyFetch = (input, init) => {
    onStage("READY_CONTACT");
    return fetchImpl(input, init);
  };
  const execution = await initiateSyntheticSalePaymentAttemptWithTransientAuthority(client, {
    sessionId: fixture.sessionId,
    userId: fixture.userId,
    adapterContext: syntheticProviderContext(resolution, providerEnv),
    eximbayReady: { env: providerEnv, fetchImpl: readyFetch },
  });
  if (execution.channel !== "FRESH_EXIMBAY_READY") throw new Error("SYNTHETIC_SALE_FRESH_READY_REQUIRED");
  onStage("HANDOFF_MATERIALIZATION");
  const handoff = await materializeFreshEximbayReadyHandoffWithClient(
    client,
    execution.durable.paymentId,
    execution.freshAuthority,
  );
  if (handoff.mode !== PaymentMode.SANDBOX || handoff.payload.merchant.mid !== SYNTHETIC_SALE_MID) {
    throw new Error("SYNTHETIC_SALE_HANDOFF_DRIFT");
  }
  return Object.freeze({ fixture, handoff });
}

export function startFailureEvidence(
  runId: string,
  stage: SyntheticSaleStartFailureStage,
  error: unknown,
): SyntheticSaleStartFailureEvidence {
  return Object.freeze({
    ok: false,
    code: "SYNTHETIC_SALE_START_FAILURE",
    runId,
    stage,
    failureCode: safeFailureCode(error),
  });
}

function safeFailureCode(error: unknown): string {
  if (error instanceof SessionException || error instanceof PaymentInitiateException
    || error instanceof NoEligibleProviderError) return error.code;
  if (error instanceof Error && SYNTHETIC_SALE_SAFE_ERROR_CODES.has(error.message)) {
    return error.message;
  }
  return "SYNTHETIC_SALE_UNCLASSIFIED_FAILURE";
}

function writeFailure(
  writer: SyntheticSaleStartFailureWriter,
  evidence: SyntheticSaleStartFailureEvidence,
): void {
  try {
    writer(evidence);
  } catch {
    // Evidence transport must not replace the original payment-path failure.
  }
}

function syntheticProviderContext(
  resolution: ProviderResolution,
  env: ProviderEnv,
): ProviderFactoryContext {
  return Object.freeze({
    provider: resolution.selectedProvider,
    mode: resolution.mode,
    market: SYNTHETIC_SALE_MARKET,
    method: PaymentMethod.CARD,
    currency: SYNTHETIC_SALE_CURRENCY,
    ruleId: resolution.ruleId,
    credentials: credentialChecksForProvider({
      provider: resolution.selectedProvider,
      mode: resolution.mode,
      capability: ProviderCapability.ACTION_ADAPTER,
    }, env),
    liveGuard: liveGuardForProviderContext({
      provider: resolution.selectedProvider,
      market: SYNTHETIC_SALE_MARKET,
      method: PaymentMethod.CARD,
      currency: SYNTHETIC_SALE_CURRENCY,
      ruleId: resolution.ruleId,
    }),
  });
}

function isExactRouting(resolution: Readonly<{
  selectedProvider: PaymentProvider;
  ruleId: string;
  mode: string;
}>): boolean {
  return resolution.selectedProvider === PaymentProvider.EXIMBAY
    && resolution.ruleId === SYNTHETIC_SALE_ROUTING_RULE
    && resolution.mode === PaymentMode.SANDBOX;
}
