import { createHash } from "node:crypto";
import {
  SendEmailCommand,
  SESv2Client,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { TransactionalEmailDeliveryError } from "../../delivery-error";
import type { TransactionalEmailPort, TransactionalEmailSendInput } from "../../port";
import {
  isValidEmailAddress,
  validateSesTransactionalEmailConfig,
  type SesTransactionalEmailConfig,
  type ValidatedSesTransactionalEmailConfig,
} from "./config";
import {
  classifySesSendError,
  invalidSesRequest,
  invalidSesSuccessResponse,
} from "./errors";

export interface SesSendClient {
  send(
    command: SendEmailCommand,
    options: Readonly<{ abortSignal: AbortSignal }>,
  ): Promise<SendEmailCommandOutput>;
}

export type SesSendClientFactory = (
  config: Readonly<{ region: string; maxAttempts: 1 }>,
) => SesSendClient;

const SUBJECT_MAX_BYTES = 1024;
const TEXT_MAX_BYTES = 100 * 1024;
const IDEMPOTENCY_KEY_MAX_BYTES = 1024;
const MESSAGE_ID_MAX_BYTES = 1024;

export function createSesTransactionalEmailPort(
  config: SesTransactionalEmailConfig,
  clientFactory: SesSendClientFactory = createProductionSesClient,
): TransactionalEmailPort {
  const validated = validateSesTransactionalEmailConfig(config);
  const client = clientFactory({ region: validated.region, maxAttempts: 1 });
  return Object.freeze({
    send: (input: TransactionalEmailSendInput) => sendEmail(client, validated, input),
  });
}

export function createProductionSesClient(
  config: Readonly<{ region: string; maxAttempts: 1 }>,
): SESv2Client {
  return new SESv2Client({ region: config.region, maxAttempts: config.maxAttempts });
}

export function miraIntentSha256(idempotencyKey: string): string {
  return createHash("sha256").update(idempotencyKey, "utf8").digest("hex");
}

async function sendEmail(
  client: SesSendClient,
  config: ValidatedSesTransactionalEmailConfig,
  input: TransactionalEmailSendInput,
): Promise<void> {
  validateSendInput(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const output = await client.send(
      new SendEmailCommand(sendEmailRequest(config, input)),
      { abortSignal: controller.signal },
    );
    if (!isValidMessageId(output.MessageId)) throw invalidSesSuccessResponse();
  } catch (error) {
    if (error instanceof TransactionalEmailDeliveryError) throw error;
    throw classifySesSendError(error, controller.signal.aborted);
  } finally {
    clearTimeout(timeout);
  }
}

function sendEmailRequest(
  config: ValidatedSesTransactionalEmailConfig,
  input: TransactionalEmailSendInput,
) {
  return {
    FromEmailAddress: config.fromEmailAddress,
    Destination: { ToAddresses: [input.to] },
    ...(config.replyToAddress ? { ReplyToAddresses: [config.replyToAddress] } : {}),
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: "UTF-8" },
        Body: { Text: { Data: input.text, Charset: "UTF-8" } },
      },
    },
    ConfigurationSetName: config.configurationSetName,
    EmailTags: [
      { Name: "mira_channel", Value: "transactional" },
      { Name: "mira_intent_sha256", Value: miraIntentSha256(input.idempotencyKey) },
    ],
  };
}

function validateSendInput(input: TransactionalEmailSendInput): void {
  if (!isExactValidEmail(input.to)
    || !isValidTextField(input.subject, SUBJECT_MAX_BYTES, true)
    || !isValidTextField(input.text, TEXT_MAX_BYTES, false)
    || !isValidTextField(input.idempotencyKey, IDEMPOTENCY_KEY_MAX_BYTES, false)) {
    throw invalidSesRequest();
  }
}

function isExactValidEmail(value: string): boolean {
  return value === value.trim() && isValidEmailAddress(value);
}

function isValidTextField(value: string, maxBytes: number, forbidLineBreaks: boolean): boolean {
  if (!value.trim() || Buffer.byteLength(value, "utf8") > maxBytes || value.includes("\0")) {
    return false;
  }
  return !forbidLineBreaks || !/[\r\n]/u.test(value);
}

function isValidMessageId(value: string | undefined): boolean {
  return typeof value === "string"
    && value === value.trim()
    && value.length > 0
    && Buffer.byteLength(value, "utf8") <= MESSAGE_ID_MAX_BYTES;
}
