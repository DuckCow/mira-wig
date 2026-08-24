import "server-only";

import { LocalizedContentException, type LocalizedContentCapabilities } from "./types";

const EDITORIAL_APPROVER_ENV = "LPC_WIG_STYLE_EDITORIAL_APPROVER_USER_ID";
const PUBLISHER_ENV = "LPC_WIG_STYLE_PUBLISHER_USER_ID";

function configuredPrincipal(name: string): string | null {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return null;
  const normalized = raw.trim();
  if (normalized.includes(",")) return null;
  return normalized;
}

export function getLocalizedContentCapabilities(actorUserId: string): LocalizedContentCapabilities {
  const editorialApprover = configuredPrincipal(EDITORIAL_APPROVER_ENV);
  const publisher = configuredPrincipal(PUBLISHER_ENV);
  return {
    canApprove: editorialApprover !== null && editorialApprover === actorUserId,
    canPublish: publisher !== null && publisher === actorUserId,
    editorialApproverConfigured: editorialApprover !== null,
    publisherConfigured: publisher !== null,
  };
}

export function assertEditorialApprover(actorUserId: string): void {
  const principal = configuredPrincipal(EDITORIAL_APPROVER_ENV);
  if (principal === null) {
    throw new LocalizedContentException(
      "EDITORIAL_APPROVER_DISABLED",
      "The localized-content editorial approver is not configured.",
    );
  }
  if (principal !== actorUserId) {
    throw new LocalizedContentException(
      "EDITORIAL_APPROVER_FORBIDDEN",
      "This administrator is not the configured localized-content editorial approver.",
    );
  }
}

export function assertPublisher(actorUserId: string): void {
  const principal = configuredPrincipal(PUBLISHER_ENV);
  if (principal === null) {
    throw new LocalizedContentException(
      "PUBLISHER_DISABLED",
      "The localized-content publisher is not configured.",
    );
  }
  if (principal !== actorUserId) {
    throw new LocalizedContentException(
      "PUBLISHER_FORBIDDEN",
      "This administrator is not the configured localized-content publisher.",
    );
  }
}
