import { PaymentProvider as ProviderCode } from "@prisma/client";
import { ProviderCapability } from "./capabilities";
import { TOSS_SANDBOX_SECRET_KEY, type ProviderEnv } from "./credentials";
import type { ProviderFactoryContext } from "./contract";
import {
  TOSS_SANDBOX_EXTERNAL_ENABLED,
  createConfirmationProvider,
  ProviderResolveException,
  type CreateConfirmationProviderOptions,
  type ProviderResolveErrorCode,
} from "./factory";
import { PaymentMode } from "./routing";
import { createTossConfirmAdapter, createTossConfirmFetchClient } from "./toss/adapter";
import type {
  PaymentConfirmationProvider,
} from "./types";

export type ResolveProviderInput = ProviderFactoryContext;
export { ProviderResolveException };
export type { CreateConfirmationProviderOptions, ProviderResolveErrorCode };

export function resolveConfirmationProvider(
  input: ResolveProviderInput,
  options?: CreateConfirmationProviderOptions,
): PaymentConfirmationProvider {
  return createConfirmationProvider(input, options ?? defaultProviderAdapterOptions());
}

export function defaultProviderAdapterOptions(env: ProviderEnv = process.env): CreateConfirmationProviderOptions {
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
    sandboxExternalConfirmationAdapters: {
      [ProviderCode.TOSS]: (context) => createTossConfirmAdapter({
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
