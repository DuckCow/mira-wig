export type ToastVariant = "success" | "warning" | "error";

export interface ToastInput { message: string; variant?: ToastVariant; duration?: number }

export interface ToastItem {
  readonly id: string; readonly message: string; readonly variant: ToastVariant;
}

export type ToastSnapshot = readonly ToastItem[];
export type ToastChannel = "shop" | "admin";

export interface ToastStore {
  enqueue(channel: ToastChannel, input: ToastInput): string;
  remove(channel: ToastChannel, id: string): void; acknowledge(channel: ToastChannel, id: string): void;
  mountPresenter(channel: ToastChannel): () => void;
  subscribe(channel: ToastChannel, listener: () => void): () => void;
  getSnapshot(channel: ToastChannel): ToastSnapshot; getServerSnapshot(): ToastSnapshot;
  dispose(): void;
}

interface ToastStoreOptions { isBrowser?: boolean; now?: () => number }

type TimerHandle = ReturnType<typeof setTimeout>;

interface ToastRecord {
  item: ToastItem; unacknowledgedDeadline: number; acknowledged: boolean;
  remainingMs: number; runningSince: number | null;
  visibleTimer: TimerHandle | null; unacknowledgedTimer: TimerHandle | null;
}

interface ChannelState {
  records: Map<string, ToastRecord>;
  listeners: Set<() => void>;
  snapshot: ToastSnapshot;
  presenterCount: number;
  absenceStartedAt: number | null;
  absenceTimer: TimerHandle | null;
}

const DEFAULT_DURATION_MS = 3_000;
const ORPHAN_EXPIRY_MS = 30_000;
const MAX_DURATION_MS = 600_000;
const EMPTY_SNAPSHOT: ToastSnapshot = Object.freeze([]);
const NOOP = () => {};

function defaultNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function createChannelState(): ChannelState {
  return {
    records: new Map(), listeners: new Set(), snapshot: EMPTY_SNAPSHOT,
    presenterCount: 0, absenceStartedAt: null, absenceTimer: null,
  };
}

function validateDuration(duration: number | undefined): number {
  if (duration === undefined) return DEFAULT_DURATION_MS;
  if (!Number.isInteger(duration) || duration < 0 || duration > MAX_DURATION_MS) {
    throw new TypeError(`Toast duration must be an integer from 0 to ${MAX_DURATION_MS}.`);
  }
  return duration;
}

class ExternalToastStore implements ToastStore {
  private readonly channels: Record<ToastChannel, ChannelState> = {
    shop: createChannelState(),
    admin: createChannelState(),
  };
  private nextId = 0;

  constructor(
    private readonly isBrowser: boolean,
    private readonly now: () => number,
  ) {}

  enqueue(channel: ToastChannel, input: ToastInput): string {
    if (!this.isBrowser) return "";
    const durationMs = validateDuration(input.duration);
    const id = `toast-${++this.nextId}`;
    const enqueuedAt = this.now();
    const record: ToastRecord = {
      item: Object.freeze({
        id, message: input.message, variant: input.variant ?? "success",
      }),
      unacknowledgedDeadline: enqueuedAt + ORPHAN_EXPIRY_MS,
      acknowledged: false,
      remainingMs: durationMs,
      runningSince: null,
      visibleTimer: null,
      unacknowledgedTimer: null,
    };
    const state = this.channels[channel];
    state.records.set(id, record);
    this.publish(state);
    this.scheduleUnacknowledgedExpiry(channel, record);
    return id;
  }

  remove(channel: ToastChannel, id: string): void {
    if (this.isBrowser) this.removeMany(this.channels[channel], [id]);
  }

  acknowledge(channel: ToastChannel, id: string): void {
    if (!this.isBrowser) return;
    const state = this.channels[channel];
    const record = state.records.get(id);
    if (!record || record.acknowledged) return;
    record.acknowledged = true;
    if (record.unacknowledgedTimer !== null) clearTimeout(record.unacknowledgedTimer);
    record.unacknowledgedTimer = null;
    if (state.presenterCount > 0) this.startVisibleTimer(channel, record);
    else this.startAbsenceTimer(channel);
  }

  mountPresenter(channel: ToastChannel): () => void {
    if (!this.isBrowser) return NOOP;
    const state = this.channels[channel];
    const wasAbsent = state.presenterCount === 0;
    if (wasAbsent) {
      this.expireDueAbsenceBeforeResume(channel);
      this.clearAbsenceTimer(state);
    }
    state.presenterCount += 1;
    if (wasAbsent) {
      for (const record of state.records.values()) this.startVisibleTimer(channel, record);
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (state.presenterCount === 0) return;
      state.presenterCount -= 1;
      if (state.presenterCount !== 0) return;
      this.pauseVisibleTimers(channel);
      this.startAbsenceTimer(channel);
    };
  }

  subscribe(channel: ToastChannel, listener: () => void): () => void {
    if (!this.isBrowser) return NOOP;
    const listeners = this.channels[channel].listeners;
    listeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
    };
  }

  getSnapshot(channel: ToastChannel): ToastSnapshot {
    return this.isBrowser ? this.channels[channel].snapshot : EMPTY_SNAPSHOT;
  }

  getServerSnapshot(): ToastSnapshot {
    return EMPTY_SNAPSHOT;
  }

  dispose(): void {
    if (!this.isBrowser) return;
    for (const state of Object.values(this.channels)) {
      this.clearAbsenceTimer(state);
      for (const record of state.records.values()) this.clearRecordTimers(record);
      state.records.clear();
      state.listeners.clear();
      state.snapshot = EMPTY_SNAPSHOT;
      state.presenterCount = 0;
    }
    this.nextId = 0;
  }

  private publish(state: ChannelState): void {
    state.snapshot = Object.freeze(
      Array.from(state.records.values(), (record) => record.item),
    );
    for (const listener of Array.from(state.listeners)) listener();
  }

  private clearRecordTimers(record: ToastRecord): void {
    if (record.visibleTimer !== null) clearTimeout(record.visibleTimer);
    if (record.unacknowledgedTimer !== null) clearTimeout(record.unacknowledgedTimer);
    record.visibleTimer = null;
    record.unacknowledgedTimer = null;
    record.runningSince = null;
  }

  private removeMany(state: ChannelState, ids: readonly string[]): void {
    let changed = false;
    for (const id of ids) {
      const record = state.records.get(id);
      if (!record) continue;
      this.clearRecordTimers(record);
      state.records.delete(id);
      changed = true;
    }
    if (changed) this.publish(state);
  }

  private scheduleUnacknowledgedExpiry(channel: ToastChannel, record: ToastRecord): void {
    const delay = Math.max(0, record.unacknowledgedDeadline - this.now());
    const handle = setTimeout(() => {
      const state = this.channels[channel];
      const current = state.records.get(record.item.id);
      if (!current || current.acknowledged || current.unacknowledgedTimer !== handle) return;
      if (current.unacknowledgedDeadline > this.now()) {
        current.unacknowledgedTimer = null;
        this.scheduleUnacknowledgedExpiry(channel, current);
        return;
      }
      current.unacknowledgedTimer = null;
      this.removeMany(state, [current.item.id]);
    }, delay);
    record.unacknowledgedTimer = handle;
  }

  private startVisibleTimer(channel: ToastChannel, record: ToastRecord): void {
    const state = this.channels[channel];
    if (!record.acknowledged || state.presenterCount === 0
      || record.runningSince !== null || record.visibleTimer !== null) return;
    const startedAt = this.now();
    record.runningSince = startedAt;
    const handle = setTimeout(
      () => this.finishVisibleTimer(channel, record.item.id, startedAt, handle),
      Math.max(0, record.remainingMs),
    );
    record.visibleTimer = handle;
  }

  private finishVisibleTimer(
    channel: ToastChannel,
    id: string,
    startedAt: number,
    handle: TimerHandle,
  ): void {
    const state = this.channels[channel];
    const record = state.records.get(id);
    if (!record || record.visibleTimer !== handle || record.runningSince !== startedAt) return;
    record.visibleTimer = null;
    const elapsed = Math.max(0, this.now() - startedAt);
    if (elapsed < record.remainingMs) {
      record.remainingMs -= elapsed;
      record.runningSince = null;
      this.startVisibleTimer(channel, record);
      return;
    }
    record.remainingMs = 0;
    record.runningSince = null;
    this.removeMany(state, [id]);
  }

  private clearAbsenceTimer(state: ChannelState): void {
    if (state.absenceTimer !== null) clearTimeout(state.absenceTimer);
    state.absenceTimer = null;
    state.absenceStartedAt = null;
  }

  private startAbsenceTimer(channel: ToastChannel): void {
    const state = this.channels[channel];
    if (state.presenterCount !== 0 || state.absenceStartedAt !== null) return;
    const startedAt = this.now();
    state.absenceStartedAt = startedAt;
    this.scheduleAbsenceExpiry(channel, startedAt, ORPHAN_EXPIRY_MS);
  }

  private scheduleAbsenceExpiry(
    channel: ToastChannel,
    startedAt: number,
    delay: number,
  ): void {
    const state = this.channels[channel];
    const handle = setTimeout(
      () => this.finishAbsenceExpiry(channel, startedAt, handle),
      delay,
    );
    state.absenceTimer = handle;
  }

  private finishAbsenceExpiry(
    channel: ToastChannel,
    startedAt: number,
    handle: TimerHandle,
  ): void {
    const state = this.channels[channel];
    if (state.presenterCount !== 0 || state.absenceStartedAt !== startedAt
      || state.absenceTimer !== handle) return;
    const remaining = ORPHAN_EXPIRY_MS - Math.max(0, this.now() - startedAt);
    if (remaining > 0) {
      this.scheduleAbsenceExpiry(channel, startedAt, remaining);
      return;
    }
    state.absenceTimer = null;
    state.absenceStartedAt = null;
    this.removeMany(state, this.acknowledgedIds(state));
  }

  private expireDueAbsenceBeforeResume(channel: ToastChannel): void {
    const state = this.channels[channel];
    const startedAt = state.absenceStartedAt;
    if (startedAt === null || this.now() - startedAt < ORPHAN_EXPIRY_MS) return;
    this.clearAbsenceTimer(state);
    this.removeMany(state, this.acknowledgedIds(state));
  }

  private acknowledgedIds(state: ChannelState): string[] {
    return Array.from(state.records.values())
      .filter((record) => record.acknowledged)
      .map((record) => record.item.id);
  }

  private pauseVisibleTimers(channel: ToastChannel): void {
    const state = this.channels[channel];
    const pausedAt = this.now();
    const completedIds: string[] = [];
    for (const record of state.records.values()) {
      if (record.runningSince === null || record.visibleTimer === null) continue;
      clearTimeout(record.visibleTimer);
      record.visibleTimer = null;
      const elapsed = Math.max(0, pausedAt - record.runningSince);
      record.remainingMs = Math.max(0, record.remainingMs - elapsed);
      record.runningSince = null;
      if (record.remainingMs === 0) completedIds.push(record.item.id);
    }
    this.removeMany(state, completedIds);
  }
}

export function createToastStore(options: ToastStoreOptions = {}): ToastStore {
  return new ExternalToastStore(
    options.isBrowser ?? typeof window !== "undefined",
    options.now ?? defaultNow,
  );
}

export const toastStore = createToastStore();
