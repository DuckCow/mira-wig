import { type PrismaClient } from "@prisma/client";
import {
  createTossRefundExecutionAuthorizer,
} from "./refund-authorization-orchestrator";
import type { TossAuthorizationEnv } from "./refund-authorization-config";
import type {
  AuthorizeTossRefundExecutionDispatchInput,
  AuthorizeTossRefundExecutionDispatchResult,
} from "./refund-authorization-contract";
import { createTossRefundLookupPort } from "./refund-lookup-http";

export async function authorizeTossRefundExecutionDispatch(
  client: PrismaClient,
  input: AuthorizeTossRefundExecutionDispatchInput,
  env: TossAuthorizationEnv = process.env,
): Promise<AuthorizeTossRefundExecutionDispatchResult> {
  return createTossRefundExecutionAuthorizer({
    lookup: createTossRefundLookupPort({ fetchFn: fetch }),
  })(client, input, env);
}

export type {
  AuthorizeTossRefundExecutionDispatchInput,
  AuthorizeTossRefundExecutionDispatchResult,
  TossRefundAuthorizationFailureCode,
} from "./refund-authorization-contract";
