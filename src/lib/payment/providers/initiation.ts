import { PaymentProvider as ProviderCode } from "@prisma/client";
import { ProviderCapability } from "./capabilities";
import type { ProviderEnv } from "./credentials";
import type { ProviderFactoryContext } from "./contract";
import {
  createInitiationProvider,
  ProviderResolveException,
  TOSS_SANDBOX_EXTERNAL_ENABLED,
  type CreateInitiationProviderOptions,
} from "./factory";
import { PaymentMode } from "./routing";
import type { PaymentInitiationProvider, PaymentInitiateResult } from "./types";

export { ProviderResolveException };

export function resolveInitiationProvider(
  input: ProviderFactoryContext,
  options?: CreateInitiationProviderOptions,
): PaymentInitiationProvider {
  return createInitiationProvider(input, options ?? defaultInitiationProviderOptions());
}

function defaultInitiationProviderOptions(env: ProviderEnv = process.env): CreateInitiationProviderOptions {
  if (!hasSandboxExternalIntent(env)) return { env };
  return {
    env,
    sandboxExternalCodeRegistry: [{
      provider: ProviderCode.TOSS,
      mode: PaymentMode.SANDBOX,
      capability: ProviderCapability.ACTION_ADAPTER,
    }],
    sandboxExternalInitiationAdapters: {
      [ProviderCode.TOSS]: () => tossBrowserInitiationProvider(),
    },
  };
}

function tossBrowserInitiationProvider(): PaymentInitiationProvider {
  return {
    code: ProviderCode.TOSS,
    initiate: () => Promise.resolve<PaymentInitiateResult>({ kind: "ready" }),
  };
}

function hasSandboxExternalIntent(env: ProviderEnv): boolean {
  return (env[TOSS_SANDBOX_EXTERNAL_ENABLED]?.trim() ?? "").length > 0;
}
