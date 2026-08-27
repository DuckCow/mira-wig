import { createHash } from "node:crypto";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionalEmailDeliveryError } from "../../../delivery-error";
import type { TransactionalEmailSendInput } from "../../../port";
import {
  createProductionSesClient,
  createSesTransactionalEmailPort,
  miraIntentSha256,
  type SesSendClient,
} from "../adapter";
import type { SesTransactionalEmailConfig } from "../config";

const RAW_KEY = "customer-order-paid:v1:order_private_123";
const RECIPIENT = "customer-private@example.test";
const SUBJECT = "Private customer subject";
const BODY = "Private customer body";
const RAW_PROVIDER_ERROR = "AWS raw request secret AccessKeyId=TEST_CREDENTIAL";

afterEach(() => {
  vi.useRealTimers();
});

describe("AWS SES v2 transactional email adapter", () => {
  it("builds the exact text-only SendEmail request with hashed non-PII tags", async () => {
    const commands: SendEmailCommand[] = [];
    const client: SesSendClient = {
      send: (command) => {
        commands.push(command);
        return Promise.resolve(successOutput());
      },
    };
    const port = createSesTransactionalEmailPort(validConfig(), () => client);

    await port.send(validInput());

    expect(commands).toHaveLength(1);
    const command = commands[0];
    if (!command) throw new Error("EXPECTED_SEND_EMAIL_COMMAND");
    const request = command.input;
    expect(request).toEqual({
      FromEmailAddress: "Mira <orders@example.test>",
      Destination: { ToAddresses: [RECIPIENT] },
      ReplyToAddresses: ["support@example.test"],
      Content: {
        Simple: {
          Subject: { Data: SUBJECT, Charset: "UTF-8" },
          Body: { Text: { Data: BODY, Charset: "UTF-8" } },
        },
      },
      ConfigurationSetName: "mira-transactional-v1",
      EmailTags: [
        { Name: "mira_channel", Value: "transactional" },
        { Name: "mira_intent_sha256", Value: createHash("sha256").update(RAW_KEY).digest("hex") },
      ],
    });
    expect(JSON.stringify(request.EmailTags)).not.toContain(RAW_KEY);
    expect(JSON.stringify(request.EmailTags)).not.toContain("order_private_123");
    expect(miraIntentSha256(RAW_KEY)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("constructs the production client with explicit region and one SDK attempt", async () => {
    const client = createProductionSesClient({ region: "ap-northeast-2", maxAttempts: 1 });

    expect(client).toBeInstanceOf(SESv2Client);
    await expect(client.config.region()).resolves.toBe("ap-northeast-2");
    await expect(client.config.maxAttempts()).resolves.toBe(1);
  });

  it("injects a fake client without credentials or network and passes one AbortSignal", async () => {
    const configs: Readonly<{ region: string; maxAttempts: 1 }>[] = [];
    const signals: AbortSignal[] = [];
    const client: SesSendClient = {
      send: (_command, options) => {
        signals.push(options.abortSignal);
        return Promise.resolve(successOutput());
      },
    };
    const port = createSesTransactionalEmailPort(validConfig(), (config) => {
      configs.push(config);
      return client;
    });

    await port.send(validInput());

    expect(configs).toEqual([{ region: "ap-northeast-2", maxAttempts: 1 }]);
    expect(signals).toHaveLength(1);
    expect(signals[0]?.aborted).toBe(false);
  });

  it.each([
    undefined,
    "",
    "   ",
    "x".repeat(1025),
  ])("rejects invalid successful MessageId %# as transient", async (MessageId) => {
    const port = portFor(() => Promise.resolve({ MessageId, $metadata: {} }));
    await expect(port.send(validInput())).rejects.toMatchObject({
      disposition: "TRANSIENT",
      safeCode: "SES_SUCCESS_RESPONSE_INVALID",
      message: "SES_SUCCESS_RESPONSE_INVALID",
    });
  });

  it.each([
    ["TooManyRequestsException", 429, "SES_THROTTLED"],
    ["InternalServiceErrorException", 500, "SES_SERVICE_UNAVAILABLE"],
    ["ECONNRESET", undefined, "SES_NETWORK_AMBIGUOUS"],
  ])("sanitizes transient %s without retaining provider data", async (name, status, safeCode) => {
    const port = portFor(() => Promise.reject(providerError(name, status)));
    const error = await deliveryError(port.send(validInput()));

    expect(error).toMatchObject({ disposition: "TRANSIENT", safeCode, message: safeCode });
    expect(sanitizedErrorEvidence(error)).not.toContain(RAW_PROVIDER_ERROR);
    expect(sanitizedErrorEvidence(error)).not.toContain(RECIPIENT);
    expect(sanitizedErrorEvidence(error)).not.toContain(SUBJECT);
    expect(sanitizedErrorEvidence(error)).not.toContain(BODY);
    expect(sanitizedErrorEvidence(error)).not.toContain(RAW_KEY);
    expect("cause" in error).toBe(false);
  });

  it.each([
    ["BadRequestException", 400, "SES_REQUEST_INVALID"],
    ["MailFromDomainNotVerifiedException", 400, "SES_IDENTITY_NOT_VERIFIED"],
    ["MessageRejected", 400, "SES_MESSAGE_REJECTED"],
    ["NotFoundException", 404, "SES_CONFIGURATION_NOT_FOUND"],
    ["SendingPausedException", 400, "SES_SENDING_PAUSED"],
    ["AccountSuspendedException", 400, "SES_ACCOUNT_SUSPENDED"],
    ["AccessDeniedException", 403, "SES_AUTHORIZATION_FAILED"],
    ["LimitExceededException", 400, "SES_QUOTA_EXCEEDED"],
    ["UnknownSesClientException", 422, "SES_CLIENT_ERROR"],
  ])("classifies permanent %s with bounded code", async (name, status, safeCode) => {
    const port = portFor(() => Promise.reject(providerError(name, status)));
    await expect(port.send(validInput())).rejects.toMatchObject({
      disposition: "PERMANENT",
      safeCode,
      message: safeCode,
    });
  });

  it("aborts at the configured allowance, classifies ambiguity, and clears its timer", async () => {
    vi.useFakeTimers();
    const client: SesSendClient = {
      send: (_command, options) => new Promise((_resolve, reject) => {
        options.abortSignal.addEventListener("abort", () => {
          reject(providerError("AbortError", undefined));
        });
      }),
    };
    const port = createSesTransactionalEmailPort(validConfig(), () => client);
    const sending = port.send(validInput());
    const rejected = expect(sending).rejects.toMatchObject({
      disposition: "TRANSIENT",
      safeCode: "SES_TIMEOUT_AMBIGUOUS",
    });

    await vi.advanceTimersByTimeAsync(10_000);

    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { to: ` ${RECIPIENT}` },
    { to: "first@example.test,second@example.test" },
    { to: "attacker@example.test\r\nBcc: victim@example.test" },
    { subject: "" },
    { subject: "bad\nsubject" },
    { subject: "가".repeat(342) },
    { text: "" },
    { text: "x".repeat(100 * 1024 + 1) },
    { idempotencyKey: "" },
    { idempotencyKey: "x".repeat(1025) },
  ])("rejects unsafe send input before provider contact %#", async (change) => {
    const send = vi.fn<SesSendClient["send"]>();
    const port = createSesTransactionalEmailPort(validConfig(), () => ({ send }));

    await expect(port.send({ ...validInput(), ...change })).rejects.toMatchObject({
      disposition: "PERMANENT",
      safeCode: "SES_REQUEST_INVALID",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("has no provider contact merely by importing the module", async () => {
    vi.resetModules();
    await expect(import("../adapter")).resolves.toHaveProperty("createSesTransactionalEmailPort");
  });
});

function portFor(send: SesSendClient["send"]) {
  return createSesTransactionalEmailPort(validConfig(), () => ({ send }));
}

function successOutput() {
  return { MessageId: "ses-message-id", $metadata: { httpStatusCode: 200 } };
}

function providerError(name: string, status: number | undefined): Error {
  return new FakeProviderError(name, status);
}

class FakeProviderError extends Error {
  readonly $fault: "server" | "client";
  readonly $metadata: Readonly<{ httpStatusCode: number | undefined; requestId: string }>;

  constructor(name: string, status: number | undefined) {
    super(RAW_PROVIDER_ERROR);
    this.name = name;
    this.$fault = status !== undefined && status >= 500 ? "server" : "client";
    this.$metadata = { httpStatusCode: status, requestId: "RAW_AWS_REQUEST_ID" };
  }
}

async function deliveryError(promise: Promise<void>): Promise<TransactionalEmailDeliveryError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TransactionalEmailDeliveryError) return error;
  }
  throw new Error("EXPECTED_TRANSACTIONAL_EMAIL_DELIVERY_ERROR");
}

function sanitizedErrorEvidence(error: TransactionalEmailDeliveryError): string {
  return [error.name, error.message, error.disposition, error.safeCode].join("|");
}

function validConfig(): SesTransactionalEmailConfig {
  return {
    region: "ap-northeast-2",
    fromAddress: "orders@example.test",
    fromDisplayName: "Mira",
    replyToAddress: "support@example.test",
    configurationSetName: "mira-transactional-v1",
    requestTimeoutMs: 10_000,
  };
}

function validInput(): TransactionalEmailSendInput {
  return { idempotencyKey: RAW_KEY, to: RECIPIENT, subject: SUBJECT, text: BODY };
}
