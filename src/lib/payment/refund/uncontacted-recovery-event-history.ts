import {
  RefundExecutionCommandEventType,
  type RefundExecutionCommandEvent,
} from "@prisma/client";

const POSTGRES_INT_MAX = 2_147_483_647;

export function hasCoherentUncontactedLeaseEventHistory(
  commandId: string,
  generation: number,
  events: readonly RefundExecutionCommandEvent[],
  currentReleased: boolean,
): boolean {
  const generationValid = [
    Number.isInteger(generation),
    generation >= 0,
    generation < POSTGRES_INT_MAX,
  ].every(Boolean);
  if (!generationValid) return false;
  if (generation === 0) return events.length === 0;
  if (!hasCoherentEventEnvelope(commandId, generation, events)) return false;
  const acquisitions = events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.LEASE_ACQUIRED
  ));
  const releases = events.filter((event) => (
    event.eventType === RefundExecutionCommandEventType.PRE_CONTACT_RELEASED
  ));
  const currentReleaseCount = releases.filter((event) => (
    event.leaseGeneration === generation
  )).length;
  return [
    acquisitions.length === generation,
    acquisitions.every((event, index) => exactAcquisition(event, acquisitions, index)),
    new Set(releases.map((event) => event.leaseGeneration)).size === releases.length,
    releases.every((event) => coherentRelease(event, acquisitions)),
    currentReleaseCount === (currentReleased ? 1 : 0),
  ].every(Boolean);
}

function hasCoherentEventEnvelope(
  commandId: string,
  generation: number,
  events: readonly RefundExecutionCommandEvent[],
): boolean {
  return events.every((event) => [
    event.commandId === commandId,
    event.leaseGeneration >= 1,
    event.leaseGeneration <= generation,
    event.dispatchAttempt === 0,
    event.eventType !== RefundExecutionCommandEventType.RECOVERY_LEASE_ACQUIRED,
  ].every(Boolean));
}

function exactAcquisition(
  event: RefundExecutionCommandEvent,
  acquisitions: readonly RefundExecutionCommandEvent[],
  index: number,
): boolean {
  const prior = acquisitions[index - 1];
  return [
    event.leaseGeneration === index + 1,
    event.occurredAt instanceof Date,
    prior === undefined || prior.occurredAt.getTime() <= event.occurredAt.getTime(),
  ].every(Boolean);
}

function coherentRelease(
  event: RefundExecutionCommandEvent,
  acquisitions: readonly RefundExecutionCommandEvent[],
): boolean {
  const acquisition = acquisitions[event.leaseGeneration - 1];
  const next = acquisitions[event.leaseGeneration];
  return [
    acquisition !== undefined,
    acquisition !== undefined && event.occurredAt.getTime() >= acquisition.occurredAt.getTime(),
    next === undefined || event.occurredAt.getTime() <= next.occurredAt.getTime(),
  ].every(Boolean);
}
