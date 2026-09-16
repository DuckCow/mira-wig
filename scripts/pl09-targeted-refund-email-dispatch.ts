import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createPrismaPl09OutboxStore,
  createPrismaTransactionalEmailProjectionSource,
  requirePl09SandboxRecipient,
  runPl09TargetedRefundDispatchOnce,
} from "../src/lib/payment/email";
import { createSesTransactionalEmailPort } from
  "../src/lib/payment/email/providers/ses/adapter";

async function main(): Promise<void> {
  const environment = {
    TRANSACTIONAL_EMAIL_RECIPIENT_MODE:
      process.env.TRANSACTIONAL_EMAIL_RECIPIENT_MODE,
    TRANSACTIONAL_EMAIL_SANDBOX_RECIPIENT:
      process.env.TRANSACTIONAL_EMAIL_SANDBOX_RECIPIENT,
  };
  const sandboxRecipient = requirePl09SandboxRecipient(environment);
  const connectionString = required("DATABASE_URL");
  const publicOrigin = required("PUBLIC_MIRA_ORIGIN");
  const adapter = new PrismaPg({ connectionString });
  const db = new PrismaClient({ adapter });

  try {
    const result = await runPl09TargetedRefundDispatchOnce({
      store: createPrismaPl09OutboxStore(db),
      source: createPrismaTransactionalEmailProjectionSource(db),
      environment,
      publicOrigin,
      createPort: () => createSesTransactionalEmailPort({
        region: required("TRANSACTIONAL_EMAIL_SES_REGION"),
        fromAddress: required("TRANSACTIONAL_EMAIL_FROM_ADDRESS"),
        fromDisplayName: required("TRANSACTIONAL_EMAIL_FROM_DISPLAY_NAME"),
        ...(process.env.TRANSACTIONAL_EMAIL_REPLY_TO_ADDRESS
          ? { replyToAddress: process.env.TRANSACTIONAL_EMAIL_REPLY_TO_ADDRESS }
          : {}),
        configurationSetName: required("TRANSACTIONAL_EMAIL_CONFIGURATION_SET_NAME"),
        requestTimeoutMs: requiredPositiveInteger("TRANSACTIONAL_EMAIL_REQUEST_TIMEOUT_MS"),
        recipientRouting: {
          mode: "SANDBOX_PRELAUNCH",
          safeRecipient: sandboxRecipient,
        },
      }),
    });
    console.log(JSON.stringify(result));
    if (result.outcome === "terminal_failed") throw new Error("PL09_DISPATCH_TERMINAL_FAILED");
  } finally {
    await db.$disconnect();
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function requiredPositiveInteger(name: string): number {
  const raw = required(name);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name}_INVALID`);
  return value;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
