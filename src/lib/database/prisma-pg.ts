import { PrismaPg } from "@prisma/adapter-pg";
import type { PoolConfig } from "pg";

/** Every new pooled session must use UTC: adapter-pg 7.8 discards timestamptz offsets. */
export function createPrismaPg(
  config: PoolConfig,
  adapterOptions?: ConstructorParameters<typeof PrismaPg>[1],
): PrismaPg {
  const url = config.connectionString ? new URL(config.connectionString) : undefined;
  // pg gives URL options precedence over config.options, then falls back to PGOPTIONS.
  const inherited = url?.searchParams.get("options") || config.options || process.env.PGOPTIONS || "";
  const options = `${inherited} -c timezone=UTC`.trim();
  if (url) url.searchParams.set("options", options);
  return new PrismaPg({
    ...config,
    ...(url ? { connectionString: url.toString() } : {}),
    options,
  }, adapterOptions);
}
