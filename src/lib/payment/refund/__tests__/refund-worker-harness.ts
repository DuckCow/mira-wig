import type { PrismaClient } from "@prisma/client";
import {
  authorizeRefundDispatch,
  type AuthorizedRefundDispatch,
  type AuthorizeRefundDispatchInput,
  type AuthorizeRefundDispatchResult,
} from "../authorize-dispatch";
import type { RefundProviderObservation, RefundProviderPort } from "../provider-port";
import { resolveRefundAdapterResponse, type ResolveRefundAdapterResponseResult } from "../resolve-execution";

export function authorizeWorkerDispatch(
  client: PrismaClient,
  input: AuthorizeRefundDispatchInput,
): Promise<AuthorizeRefundDispatchResult> {
  return authorizeRefundDispatch(client, input);
}

export function callRefundPort(
  port: RefundProviderPort,
  context: AuthorizedRefundDispatch,
): Promise<RefundProviderObservation> {
  return port.refund(context.providerRequest);
}

export function resolveWorkerObservation(
  client: PrismaClient,
  context: AuthorizedRefundDispatch,
  observation: RefundProviderObservation,
  now: Date,
): Promise<ResolveRefundAdapterResponseResult> {
  return resolveRefundAdapterResponse(client, {
    commandId: context.commandId,
    dispatchAttempt: context.dispatchAttempt,
    outcome: observation.outcome,
    observedProviderRefundId: observation.observedProviderRefundId,
    reportedAmount: observation.reportedAmount,
    reportedCurrency: observation.reportedCurrency,
    safeCode: observation.safeCode,
    safeMessage: observation.safeMessage,
    observedAt: observation.observedAt,
    now,
  });
}

export async function runRefundWorkerHarness(
  client: PrismaClient,
  input: AuthorizeRefundDispatchInput,
  port: RefundProviderPort,
  resolverNow: Date,
): Promise<AuthorizeRefundDispatchResult | ResolveRefundAdapterResponseResult> {
  const authorization = await authorizeWorkerDispatch(client, input);
  if (!authorization.ok) return authorization;
  const observation = await callRefundPort(port, authorization.dispatch);
  return resolveWorkerObservation(client, authorization.dispatch, observation, resolverNow);
}
