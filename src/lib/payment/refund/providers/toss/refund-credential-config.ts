export const TOSS_REFUND_SANDBOX_SECRET_KEY = "TOSS_SANDBOX_SECRET_KEY";
export const TOSS_REFUND_SANDBOX_MERCHANT_BINDING =
  "TOSS_SANDBOX_MERCHANT_ACCOUNT_BINDING";
export const TOSS_REFUND_SANDBOX_CREDENTIAL_GENERATION_BINDING =
  "TOSS_SANDBOX_CREDENTIAL_GENERATION_BINDING";

const BINDING_LABEL = /^[A-Za-z0-9._-]{1,64}$/;

export type TossRefundCredentialRawValues = Readonly<{
  secretKey: string | undefined;
  merchantAccountBinding: string | undefined;
  credentialGenerationBinding: string | undefined;
}>;

export class ConfiguredTossRefundCredential {
  readonly merchantAccountBinding: string;
  readonly credentialGenerationBinding: string;
  readonly #secretKey: string;

  constructor(secretKey: string, merchantBinding: string, generationBinding: string) {
    this.#secretKey = secretKey;
    this.merchantAccountBinding = merchantBinding;
    this.credentialGenerationBinding = generationBinding;
    Object.freeze(this);
  }

  readSecretKey(): string {
    return this.#secretKey;
  }
}

export type TossRefundCredentialConfigState =
  | Readonly<{ status: "ABSENT" }>
  | Readonly<{ status: "CONFIG_INVALID" }>
  | Readonly<{
    status: "CONFIGURED";
    configuration: ConfiguredTossRefundCredential;
  }>;

export function parseTossRefundCredentialConfig(
  raw: TossRefundCredentialRawValues,
): TossRefundCredentialConfigState {
  const presence = [raw.secretKey, raw.merchantAccountBinding, raw.credentialGenerationBinding]
    .map(isPresent);
  if (presence.every((present) => !present)) return Object.freeze({ status: "ABSENT" });
  if (!presence.every(Boolean)) return Object.freeze({ status: "CONFIG_INVALID" });

  const merchant = normalizeBindingLabel(raw.merchantAccountBinding);
  const generation = normalizeBindingLabel(raw.credentialGenerationBinding);
  if (!merchant || !generation || typeof raw.secretKey !== "string") {
    return Object.freeze({ status: "CONFIG_INVALID" });
  }
  const configuration = new ConfiguredTossRefundCredential(raw.secretKey, merchant, generation);
  return Object.freeze({ status: "CONFIGURED", configuration });
}

function isPresent(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeBindingLabel(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return BINDING_LABEL.test(normalized) ? normalized : null;
}
