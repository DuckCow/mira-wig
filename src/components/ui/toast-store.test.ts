import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createToastStore,
  type ToastInput,
  type ToastStore,
} from "./toast-store";

describe("toast store", () => {
  let currentTime: number;
  let stores: ToastStore[];

  beforeEach(() => {
    vi.useFakeTimers();
    currentTime = 0;
    stores = [];
  });

  afterEach(() => {
    for (const store of stores) store.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function createBrowserStore(): ToastStore {
    const store = createToastStore({
      isBrowser: true,
      now: () => currentTime,
    });
    stores.push(store);
    return store;
  }

  function advance(ms: number): void {
    currentTime += ms;
    vi.advanceTimersByTime(ms);
  }

  it("creates isolated factory instances", () => {
    const first = createBrowserStore();
    const second = createBrowserStore();

    first.enqueue("shop", { message: "first" });

    expect(first.getSnapshot("shop")).toHaveLength(1);
    expect(second.getSnapshot("shop")).toHaveLength(0);
  });

  it("isolates shop and admin channels", () => {
    const store = createBrowserStore();
    const shopListener = vi.fn();
    const adminListener = vi.fn();
    store.subscribe("shop", shopListener);
    store.subscribe("admin", adminListener);

    store.enqueue("shop", { message: "shop" });
    expect(shopListener).toHaveBeenCalledTimes(1);
    expect(adminListener).not.toHaveBeenCalled();
    store.enqueue("admin", { message: "admin", variant: "warning" });

    expect(shopListener).toHaveBeenCalledTimes(1);
    expect(adminListener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot("shop").map((item) => item.message)).toEqual(["shop"]);
    expect(store.getSnapshot("admin").map((item) => item.message)).toEqual(["admin"]);
  });

  it("keeps a stale channel-bound action closure attached to its original channel", () => {
    const store = createBrowserStore();
    const staleShopShowToast = (input: ToastInput) => {
      store.enqueue("shop", input);
    };
    const unmountOldProvider = store.mountPresenter("shop");
    unmountOldProvider();
    const unmountReplacementProvider = store.mountPresenter("shop");

    staleShopShowToast({ message: "survives replacement" });

    expect(store.getSnapshot("shop").map((item) => item.message)).toEqual([
      "survives replacement",
    ]);
    expect(store.getSnapshot("admin")).toHaveLength(0);
    unmountReplacementProvider();
  });

  it("keeps every server mutator inert before validation or timer creation", () => {
    const now = vi.fn(() => 0);
    const listener = vi.fn();
    const store = createToastStore({ isBrowser: false, now });
    stores.push(store);
    const serverSnapshot = store.getServerSnapshot();
    const unsubscribe = store.subscribe("shop", listener);
    const unmount = store.mountPresenter("shop");

    expect(() => store.enqueue("shop", { message: "ignored", duration: Number.NaN }))
      .not.toThrow();
    expect(store.enqueue("admin", { message: "ignored", duration: -1 })).toBe("");
    store.acknowledge("shop", "missing");
    store.remove("shop", "missing");
    unsubscribe();
    unmount();
    store.dispose();

    expect(store.getSnapshot("shop")).toBe(serverSnapshot);
    expect(store.getSnapshot("admin")).toBe(serverSnapshot);
    expect(listener).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns one stable frozen empty server snapshot", () => {
    const store = createBrowserStore();
    const first = store.getServerSnapshot();

    expect(first).toBe(store.getServerSnapshot());
    expect(Object.isFrozen(first)).toBe(true);
    expect(first).toEqual([]);
  });

  it("keeps snapshots referentially stable and freezes the array and items", () => {
    const store = createBrowserStore();
    const empty = store.getSnapshot("shop");
    const id = store.enqueue("shop", { message: "immutable", variant: "error" });
    const populated = store.getSnapshot("shop");

    expect(store.getSnapshot("shop")).toBe(populated);
    expect(populated).not.toBe(empty);
    expect(Object.isFrozen(populated)).toBe(true);
    expect(Object.isFrozen(populated[0])).toBe(true);
    expect(populated[0]).toEqual({ id, message: "immutable", variant: "error" });
  });

  it("publishes the new snapshot before notifying listeners", () => {
    const store = createBrowserStore();
    let observedSnapshot = store.getSnapshot("shop");
    store.subscribe("shop", () => {
      observedSnapshot = store.getSnapshot("shop");
    });

    store.enqueue("shop", { message: "published first" });

    expect(observedSnapshot).toBe(store.getSnapshot("shop"));
    expect(observedSnapshot.map((item) => item.message)).toEqual(["published first"]);
  });

  it("makes unsubscribe idempotent and tolerates Strict Mode-like subscribe cycles", () => {
    const store = createBrowserStore();
    const listener = vi.fn();
    const firstUnsubscribe = store.subscribe("shop", listener);
    firstUnsubscribe();
    firstUnsubscribe();

    store.enqueue("shop", { message: "not observed" });
    expect(listener).not.toHaveBeenCalled();

    const secondUnsubscribe = store.subscribe("shop", listener);
    store.enqueue("shop", { message: "observed" });
    expect(listener).toHaveBeenCalledTimes(1);
    secondUnsubscribe();
    secondUnsubscribe();
  });

  it("does not publish private acknowledgement or presenter timing changes", () => {
    const store = createBrowserStore();
    const listener = vi.fn();
    store.subscribe("shop", listener);
    const unmount = store.mountPresenter("shop");
    const id = store.enqueue("shop", { message: "private timing" });
    const snapshot = store.getSnapshot("shop");
    listener.mockClear();

    store.acknowledge("shop", id);
    store.acknowledge("shop", id);
    unmount();

    expect(store.getSnapshot("shop")).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it("pauses and resumes exact remaining time across presenter replacement", () => {
    const store = createBrowserStore();
    const unmountFirst = store.mountPresenter("shop");
    const id = store.enqueue("shop", { message: "replace me" });
    store.acknowledge("shop", id);
    advance(1_250);

    unmountFirst();
    advance(20_000);
    expect(store.getSnapshot("shop")).toHaveLength(1);

    const unmountReplacement = store.mountPresenter("shop");
    advance(1_749);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmountReplacement();
  });

  it("does not pause while another presenter for the channel remains mounted", () => {
    const store = createBrowserStore();
    const unmountFirst = store.mountPresenter("admin");
    const unmountSecond = store.mountPresenter("admin");
    const id = store.enqueue("admin", { message: "two presenters" });
    store.acknowledge("admin", id);
    advance(1_000);

    unmountFirst();
    unmountFirst();
    advance(1_999);
    expect(store.getSnapshot("admin")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("admin")).toHaveLength(0);
    unmountSecond();
  });

  it("never resets duration on repeated acknowledgement", () => {
    const store = createBrowserStore();
    const unmount = store.mountPresenter("shop");
    const id = store.enqueue("shop", { message: "ack once" });
    store.acknowledge("shop", id);
    advance(1_000);

    store.acknowledge("shop", id);
    advance(1_999);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmount();
  });

  it("acknowledges while absent and starts the full duration when a presenter arrives", () => {
    const store = createBrowserStore();
    const id = store.enqueue("shop", { message: "await presenter" });
    store.acknowledge("shop", id);
    advance(20_000);
    expect(store.getSnapshot("shop")).toHaveLength(1);

    const unmount = store.mountPresenter("shop");
    advance(2_999);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmount();
  });

  it("does not start visible duration before acknowledgement", () => {
    const store = createBrowserStore();
    const unmount = store.mountPresenter("shop");
    const id = store.enqueue("shop", { message: "not committed yet" });

    advance(29_999);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    store.acknowledge("shop", id);
    advance(2_999);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmount();
  });

  it("uses the 3000 ms default for every variant", () => {
    const store = createBrowserStore();
    const unmount = store.mountPresenter("shop");
    const ids = [
      store.enqueue("shop", { message: "success", variant: "success" }),
      store.enqueue("shop", { message: "warning", variant: "warning" }),
      store.enqueue("shop", { message: "error", variant: "error" }),
    ];
    for (const id of ids) store.acknowledge("shop", id);

    advance(2_999);
    expect(store.getSnapshot("shop")).toHaveLength(3);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmount();
  });

  it("keeps an explicit 6000 ms duration authoritative", () => {
    const store = createBrowserStore();
    const unmount = store.mountPresenter("admin");
    const id = store.enqueue("admin", { message: "long warning", duration: 6_000 });
    store.acknowledge("admin", id);

    advance(5_999);
    expect(store.getSnapshot("admin")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("admin")).toHaveLength(0);
    unmount();
  });

  it("removes duration zero on the next timer task instead of synchronously", () => {
    const store = createBrowserStore();
    const unmount = store.mountPresenter("shop");
    const id = store.enqueue("shop", { message: "one commit", duration: 0 });

    store.acknowledge("shop", id);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    vi.advanceTimersByTime(0);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmount();
  });

  it.each([[-1], [Number.NaN], [Number.POSITIVE_INFINITY], [1.5], [600_001]])(
    "rejects invalid browser duration %s with TypeError",
    (duration) => {
      const store = createBrowserStore();

      expect(() => store.enqueue("shop", { message: "invalid", duration }))
        .toThrow(TypeError);
      expect(store.getSnapshot("shop")).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("expires an unacknowledged Toast 30 seconds after enqueue", () => {
    const store = createBrowserStore();
    store.enqueue("shop", { message: "never committed" });

    advance(29_999);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
  });

  it("publishes one removal snapshot after 30 continuous seconds without a presenter", () => {
    const store = createBrowserStore();
    const listener = vi.fn();
    store.subscribe("shop", listener);
    const unmount = store.mountPresenter("shop");
    const first = store.enqueue("shop", { message: "first", duration: 600_000 });
    const second = store.enqueue("shop", { message: "second", duration: 600_000 });
    store.acknowledge("shop", first);
    store.acknowledge("shop", second);
    listener.mockClear();
    unmount();

    advance(29_999);
    expect(store.getSnapshot("shop")).toHaveLength(2);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("returns after 29 seconds and resumes rather than expiring", () => {
    const store = createBrowserStore();
    const unmountFirst = store.mountPresenter("shop");
    const id = store.enqueue("shop", { message: "return in time" });
    store.acknowledge("shop", id);
    advance(1_000);
    unmountFirst();

    advance(29_000);
    const unmountSecond = store.mountPresenter("shop");
    advance(1_999);
    expect(store.getSnapshot("shop")).toHaveLength(1);
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmountSecond();
  });

  it("lets unacknowledged items keep their own enqueue expiry during channel absence", () => {
    const store = createBrowserStore();
    const unmount = store.mountPresenter("shop");
    const acknowledged = store.enqueue("shop", { message: "acknowledged", duration: 600_000 });
    store.acknowledge("shop", acknowledged);
    unmount();
    advance(1_000);
    store.enqueue("shop", { message: "unacknowledged" });

    advance(29_000);
    expect(store.getSnapshot("shop").map((item) => item.message)).toEqual([
      "unacknowledged",
    ]);
    advance(1_000);
    expect(store.getSnapshot("shop")).toHaveLength(0);
  });

  it("makes a visible timeout callback harmless after explicit removal", () => {
    const store = createBrowserStore();
    const listener = vi.fn();
    store.subscribe("admin", listener);
    const unmount = store.mountPresenter("admin");
    const id = store.enqueue("admin", { message: "removed", duration: 100 });
    store.acknowledge("admin", id);
    store.remove("admin", id);
    const notificationsAfterRemove = listener.mock.calls.length;

    advance(100);
    expect(store.getSnapshot("admin")).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(notificationsAfterRemove);
    unmount();
  });

  it("preserves insertion order without a cap or drop at fifty enqueues", () => {
    const store = createBrowserStore();
    const messages = Array.from({ length: 50 }, (_, index) => `toast ${index}`);

    for (const message of messages) store.enqueue("shop", { message });

    expect(store.getSnapshot("shop").map((item) => item.message)).toEqual(messages);
  });

  it("dispose clears timers, listeners, records, and snapshots", () => {
    const store = createBrowserStore();
    const listener = vi.fn();
    store.subscribe("shop", listener);
    const unmount = store.mountPresenter("shop");
    const id = store.enqueue("shop", { message: "dispose me" });
    store.acknowledge("shop", id);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    listener.mockClear();

    store.dispose();
    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(store.getSnapshot("shop")).toEqual([]);
    expect(store.getSnapshot("admin")).toEqual([]);
    const unmountFresh = store.mountPresenter("shop");
    const freshId = store.enqueue("shop", { message: "fresh after dispose", duration: 1 });
    store.acknowledge("shop", freshId);
    expect(listener).not.toHaveBeenCalled();
    advance(1);
    expect(store.getSnapshot("shop")).toHaveLength(0);
    unmountFresh();
  });
});
