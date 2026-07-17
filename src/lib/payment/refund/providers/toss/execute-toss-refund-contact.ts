import type { PrismaClient } from "@prisma/client";
import { createTossRefundCancellationPort } from "./refund-cancellation-http";
import type { TossContactEnv } from "./refund-contact-config";
import type {
  ExecuteTossRefundContactInput,
  ExecuteTossRefundContactResult,
} from "./refund-contact-contract";
import { createTossRefundContactExecutor } from "./refund-contact-orchestrator";
import { createTossRefundLookupPort } from "./refund-lookup-http";

export async function executeTossRefundContact(
  client: PrismaClient,
  input: ExecuteTossRefundContactInput,
  env: TossContactEnv = process.env,
): Promise<ExecuteTossRefundContactResult> {
  return createTossRefundContactExecutor({
    lookup: createTossRefundLookupPort({ fetchFn: fetch }),
    cancellation: createTossRefundCancellationPort({ fetchFn: fetch }),
  })(client, input, env);
}

export type {
  ExecuteTossRefundContactInput,
  ExecuteTossRefundContactResult,
  TossRefundContactFailureCode,
} from "./refund-contact-contract";
