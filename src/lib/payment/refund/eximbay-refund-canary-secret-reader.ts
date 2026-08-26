import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import {
  exactEximbayRefundCanarySecretName,
  type EximbayRefundCanarySecretAuthority,
} from "./eximbay-refund-canary-secret-contract";

export type EximbayRefundCanarySecretClient = Readonly<{
  accessSecretVersion(input: Readonly<{ name: string }>): Promise<readonly [Readonly<{
    payload?: Readonly<{ data?: Uint8Array | string | null }> | null;
  }>, ...unknown[]] >;
}>;

export async function readExactEximbayRefundCanarySecret(
  authority: EximbayRefundCanarySecretAuthority,
  client: EximbayRefundCanarySecretClient = new SecretManagerServiceClient(),
): Promise<string> {
  const name = exactEximbayRefundCanarySecretName(authority);
  if (!name) throw new Error("EXIMBAY_CANARY_SECRET_AUTHORITY_INVALID");
  const [response] = await client.accessSecretVersion({ name });
  const value = secretPayloadText(response.payload?.data);
  if (!secretValueIsUsable(value)) {
    throw new Error("EXIMBAY_CANARY_SECRET_UNAVAILABLE");
  }
  return value;
}

function secretPayloadText(data: Uint8Array | string | null | undefined): string {
  if (typeof data === "string") return data;
  return data ? Buffer.from(data).toString("utf8") : "";
}

function secretValueIsUsable(value: string): boolean {
  return value.length > 0 && value.length <= 16_384 && value.trim().length > 0;
}
