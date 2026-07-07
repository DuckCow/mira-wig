import type { ProviderFactoryContext } from "./contract";
import {
  createProviderAdapter,
  ProviderResolveException,
  type CreateProviderAdapterOptions,
  type ProviderResolveErrorCode,
} from "./factory";
import type { PaymentProvider } from "./types";

export type ResolveProviderInput = ProviderFactoryContext;
export { ProviderResolveException };
export type { CreateProviderAdapterOptions, ProviderResolveErrorCode };

export function resolveProvider(
  input: ResolveProviderInput,
  options: CreateProviderAdapterOptions = {},
): PaymentProvider {
  return createProviderAdapter(input, options);
}
