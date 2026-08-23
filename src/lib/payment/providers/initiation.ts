import {
  PaymentAdapterExecutionKind,
  PaymentProvider as ProviderCode,
} from "@prisma/client";
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
  const sandboxExternalCodeRegistry = [{
    provider: ProviderCode.EXIMBAY,
    mode: PaymentMode.SANDBOX,
    capability: ProviderCapability.ACTION_ADAPTER,
  }];
  const sandboxExternalInitiationAdapters: NonNullable<
    CreateInitiationProviderOptions["sandboxExternalInitiationAdapters"]
  > = {
    [ProviderCode.EXIMBAY]: () => eximbaySpecialReadyInitiationCarrier(),
  };
  if (!hasTossSandboxExternalIntent(env)) {
    return { env, sandboxExternalCodeRegistry, sandboxExternalInitiationAdapters };
  }
  return {
    env,
    sandboxExternalCodeRegistry: [...sandboxExternalCodeRegistry, {
      provider: ProviderCode.TOSS,
      mode: PaymentMode.SANDBOX,
      capability: ProviderCapability.ACTION_ADAPTER,
    }],
    sandboxExternalInitiationAdapters: {
      ...sandboxExternalInitiationAdapters,
      [ProviderCode.TOSS]: () => tossBrowserInitiationProvider(),
    },
  };
}

function eximbaySpecialReadyInitiationCarrier(): PaymentInitiationProvider {
  return {
    code: ProviderCode.EXIMBAY,
    adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    initiate: () => Promise.reject(new Error(
      "Eximbay initiation is owned by the special READY attempt path.",
    )),
  };
}

function tossBrowserInitiationProvider(): PaymentInitiationProvider {
  return {
    code: ProviderCode.TOSS,
    adapterExecutionKind: PaymentAdapterExecutionKind.EXTERNAL,
    initiate: () => Promise.resolve<PaymentInitiateResult>({ kind: "ready" }),
  };
}

function hasTossSandboxExternalIntent(env: ProviderEnv): boolean {
  return (env[TOSS_SANDBOX_EXTERNAL_ENABLED]?.trim() ?? "").length > 0;
}
