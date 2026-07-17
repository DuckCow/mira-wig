export const TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS = 13 * 24 * 60 * 60 * 1000;
export const TOSS_REFUND_RECOVERY_MAX_PHYSICAL_CONTACTS = 2;
export const TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS = 15 * 60 * 1000;

export type RecoveryContactTime = Readonly<{ ordinal: number; contactMarkedAt: number }>;

export type TossRefundRecoveryWindow = Readonly<{
  earliestContactMarkedAt: number;
  latestContactMarkedAt: number;
  contactedCount: number;
  deadlineAt: number;
}>;

export type PlanTossRefundRecoveryWindow =
  | Readonly<{ ok: true; window: TossRefundRecoveryWindow }>
  | Readonly<{
    ok: false;
    code: "REFUND_LEDGER_INCONSISTENT" | "RECOVERY_DEADLINE_EXPIRED"
      | "RECOVERY_ORDINAL_LIMIT_REACHED" | "RECOVERY_INTERVAL_NOT_ELAPSED";
  }>;

export function planTossRefundRecoveryWindow(
  contacts: readonly RecoveryContactTime[],
  databaseNow: number,
): PlanTossRefundRecoveryWindow {
  const contactWindow = contactWindowFacts(contacts, databaseNow);
  if (!contactWindow) return ledgerFailure();
  const { earliestContactMarkedAt, latestContactMarkedAt } = contactWindow;
  const deadlineAt = earliestContactMarkedAt + TOSS_REFUND_RECOVERY_RECONTACT_DEADLINE_MS;
  if (!Number.isSafeInteger(deadlineAt)) return ledgerFailure();
  if (contacts.length > TOSS_REFUND_RECOVERY_MAX_PHYSICAL_CONTACTS) return ledgerFailure();
  if (databaseNow >= deadlineAt) return failure("RECOVERY_DEADLINE_EXPIRED");
  if (contacts.length === TOSS_REFUND_RECOVERY_MAX_PHYSICAL_CONTACTS) {
    return failure("RECOVERY_ORDINAL_LIMIT_REACHED");
  }
  if (databaseNow - latestContactMarkedAt
    < TOSS_REFUND_RECOVERY_MIN_RECONTACT_INTERVAL_MS) {
    return failure("RECOVERY_INTERVAL_NOT_ELAPSED");
  }
  return Object.freeze({
    ok: true,
    window: Object.freeze({
      earliestContactMarkedAt,
      latestContactMarkedAt,
      contactedCount: contacts.length,
      deadlineAt,
    }),
  });
}

function contactWindowFacts(contacts: readonly RecoveryContactTime[], databaseNow: number) {
  if (!isSafeTimestamp(databaseNow) || contacts.length === 0) return null;
  const times = contacts.map((contact) => contact.contactMarkedAt);
  if (!contacts.every(validContact) || times.some((time) => time > databaseNow)) return null;
  return {
    earliestContactMarkedAt: Math.min(...times),
    latestContactMarkedAt: Math.max(...times),
  };
}

function validContact(value: RecoveryContactTime): boolean {
  return Number.isSafeInteger(value.ordinal) && value.ordinal >= 1
    && isSafeTimestamp(value.contactMarkedAt);
}

function isSafeTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && Number.isFinite(value);
}

function ledgerFailure(): PlanTossRefundRecoveryWindow {
  return failure("REFUND_LEDGER_INCONSISTENT");
}

function failure(code: Extract<PlanTossRefundRecoveryWindow, { ok: false }>["code"]): PlanTossRefundRecoveryWindow {
  return Object.freeze({ ok: false, code });
}
