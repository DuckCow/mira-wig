import { PaymentProvider as ProviderCode } from "@prisma/client";
import { ProviderCapability } from "./capabilities";
import { TOSS_SANDBOX_SECRET_KEY, type ProviderEnv } from "./credentials";
import type { ProviderFactoryContext } from "./contract";
import {
  TOSS_SANDBOX_EXTERNAL_ENABLED,
  createProviderAdapter,
  ProviderResolveException,
  type CreateProviderAdapterOptions,
  type ProviderResolveErrorCode,
} from "./factory";
import { PaymentMode } from "./routing";
import { createTossConfirmFetchClient, createTossSandboxPaymentProvider } from "./toss/adapter";
import type { PaymentProvider } from "./types";

export type ResolveProviderInput = ProviderFactoryContext;
export { ProviderResolveException };
export type { CreateProviderAdapterOptions, ProviderResolveErrorCode };

export function resolveProvider(
  input: ResolveProviderInput,
  options?: CreateProviderAdapterOptions,
): PaymentProvider {
  return createProviderAdapter(input, options ?? defaultProviderAdapterOptions());
}

function defaultProviderAdapterOptions(env: ProviderEnv = process.env): CreateProviderAdapterOptions {
  if (!hasSandboxExternalIntent(env)) return { env };
  return {
    env,
    sandboxExternalCodeRegistry: [
      {
        provider: ProviderCode.TOSS,
        mode: PaymentMode.SANDBOX,
        capability: ProviderCapability.ACTION_ADAPTER,
      },
    ],
    sandboxExternalAdapters: {
      [ProviderCode.TOSS]: (context) => createTossSandboxPaymentProvider({
        httpClient: createTossConfirmFetchClient({ secretKey: requiredTossSandboxSecret(context, env) }),
      }),
    },
  };
}

function hasSandboxExternalIntent(env: ProviderEnv): boolean {
  return (env[TOSS_SANDBOX_EXTERNAL_ENABLED]?.trim() ?? "").length > 0;
}

function requiredTossSandboxSecret(context: ProviderFactoryContext, env: ProviderEnv): string {
  const secretKey = env[TOSS_SANDBOX_SECRET_KEY]?.trim();
  if (secretKey) return secretKey;
  throw new ProviderResolveException(
    "SANDBOX_EXTERNAL_CREDENTIALS_MISSING",
    context.provider,
    context.mode,
    "Sandbox external provider credentials are missing.",
  );
}
