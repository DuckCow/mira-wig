import { randomUUID } from "node:crypto";

export function syntheticEximbayProviderOrderId(): string {
  return `c${randomUUID().replaceAll("-", "").slice(0, 24)}`;
}
