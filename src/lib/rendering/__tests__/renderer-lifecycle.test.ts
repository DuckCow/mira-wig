import { describe, expect, it, vi } from "vitest";
import {
  createViewportCoordinator,
  initializeViewportRuntime,
  type ViewportCoordinator,
  type ViewportCoordinatorOptions,
  type ViewportRenderHost,
} from "@/components/rendering/RenderLabViewport";
import { createProceduralStrandSource } from "../procedural-strand-source";
import { StrandBundleAbortError, type LoadedStrandBundle } from "../strand-bundle-loader";
import {
  createRendererFailureGate,
  type RendererBackend,
  type RendererBackendCallbacks,
  type RendererDiagnostics,
  type RendererFrameScheduler,
} from "../renderer-backend";
import { DEFAULT_VISUAL_STATE, type VisualState } from "../visual-state";

class ControlledFrameScheduler implements RendererFrameScheduler {
  private nextHandle = 1;
  private readonly callbacks = new Map<number, () => void>();
  readonly canceledHandles: number[] = [];
  requestCount = 0;

  request(callback: () => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.requestCount += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.canceledHandles.push(handle);
    this.callbacks.delete(handle);
  }

  flushNext(): boolean {
    const entry = this.callbacks.entries().next().value;
    if (entry === undefined) return false;
    const [handle, callback] = entry;
    this.callbacks.delete(handle);
    callback();
    return true;
  }

  pendingCount(): number {
    return this.callbacks.size;
  }
}

describe("renderer terminal failure gate", () => {
  it("contains deferred failures once and cancels owned frames idempotently", () => {
    const scheduler = new ControlledFrameScheduler();
    const failures: Error[] = [];
    const gate = createRendererFailureGate((error) => failures.push(error), scheduler);

    gate.requestRender(() => {
      throw new Error("deferred render failed");
    });
    expect(() => scheduler.flushNext()).not.toThrow();
    gate.reportFailure(new Error("duplicate"));
    gate.requestRender(() => undefined);
    gate.dispose();
    gate.dispose();

    expect(failures.map((error) => error.message)).toEqual(["deferred render failed"]);
    expect(scheduler.requestCount).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("routes owned visual-state failure through the terminal boundary", () => {
    const failures: Error[] = [];
    const gate = createRendererFailureGate((error) => failures.push(error));
    let laterUpdateCount = 0;

    gate.runOwnedUpdate(() => {
      throw new Error("visual state failed");
    });
    gate.runOwnedUpdate(() => {
      laterUpdateCount += 1;
    });

    expect(failures.map((error) => error.message)).toEqual(["visual state failed"]);
    expect(laterUpdateCount).toBe(0);
  });
});

const asset = createProceduralStrandSource({
  seed: 20_260_804,
  columns: 9,
  rows: 8,
  controlPointCount: 6,
  defaultWidth: 0.028,
}).createAsset();

function bundle(assetId: string): LoadedStrandBundle {
  return {
    asset,
    assetId,
    assetVersion: "1",
    verifiedDigest: "0".repeat(64),
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((error: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) {
      if (resolvePromise === null) throw new Error("Deferred resolve is unavailable.");
      resolvePromise(value);
    },
    reject(error) {
      if (rejectPromise === null) throw new Error("Deferred reject is unavailable.");
      rejectPromise(error);
    },
  };
}

interface BackendPlan {
  readonly initialize: () => Promise<RendererDiagnostics>;
}

class HostProbe implements ViewportRenderHost {
  private removed = false;

  constructor(
    readonly id: number,
    private readonly events: string[],
  ) {}

  reveal(): void {
    this.events.push(`host.${this.id}.reveal`);
  }

  remove(): void {
    if (this.removed) return;
    this.removed = true;
    this.events.push(`host.${this.id}.remove`);
  }
}

class BackendProbe implements RendererBackend {
  readonly states: VisualState[] = [];
  readonly sizes: [number, number][] = [];
  private disposed = false;

  constructor(
    readonly id: number,
    private readonly plan: BackendPlan,
    readonly callbacks: RendererBackendCallbacks,
    private readonly events: string[],
  ) {}

  async initialize(_asset: typeof asset, initialState: VisualState): Promise<RendererDiagnostics> {
    this.events.push(`backend.${this.id}.initialize`);
    this.states.push(initialState);
    return this.plan.initialize();
  }

  updateVisualState(state: VisualState): void {
    this.states.push(state);
  }

  resize(width: number, height: number): void {
    this.sizes.push([width, height]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.push(`backend.${this.id}.dispose`);
  }
}

interface Harness {
  readonly coordinator: ViewportCoordinator;
  readonly events: string[];
  readonly warnings: string[];
  readonly failures: string[];
  readonly loadSignals: AbortSignal[];
  readonly backends: BackendProbe[];
  readonly backendModes: boolean[];
  readonly committedModes: boolean[];
  enqueueLoad(load: () => Promise<LoadedStrandBundle>): void;
  enqueueBackend(plan: BackendPlan): void;
}

function successDiagnostics(id: number): RendererDiagnostics {
  return { backend: "WEBGL2", visibleStrandCount: id, frameDurationMs: 1 };
}

function createHarness(): Harness {
  const events: string[] = [];
  const warnings: string[] = [];
  const failures: string[] = [];
  const loadSignals: AbortSignal[] = [];
  const loads: Array<() => Promise<LoadedStrandBundle>> = [];
  const plans: BackendPlan[] = [];
  const backends: BackendProbe[] = [];
  const backendModes: boolean[] = [];
  const committedModes: boolean[] = [];
  let hostId = 0;
  let backendId = 0;

  const coordinator = createViewportCoordinator({
    loadBundle(signal) {
      loadSignals.push(signal);
      const load = loads.shift();
      if (load === undefined) throw new Error("Missing loader plan.");
      return load();
    },
    createHost() {
      hostId += 1;
      return new HostProbe(hostId, events);
    },
    createBackend(_host, forceWebGL, callbacks) {
      const plan = plans.shift();
      if (plan === undefined) throw new Error("Missing backend plan.");
      backendModes.push(forceWebGL);
      backendId += 1;
      const backend = new BackendProbe(backendId, plan, callbacks, events);
      backends.push(backend);
      return backend;
    },
    getVisualState: () => DEFAULT_VISUAL_STATE,
    isAbortError: (error) => error instanceof StrandBundleAbortError,
    clearPointer: () => events.push("pointer.clear"),
    onInitialLoading: () => events.push("status.initializing"),
    onReplacementLoading: (loading) => events.push(`replacement.loading:${loading}`),
    onModeCommitted: (forceWebGL) => committedModes.push(forceWebGL),
    onReady: (diagnostics) => events.push(`status.ready:${diagnostics.visibleStrandCount}`),
    onDiagnostics: (diagnostics) => events.push(`diagnostics:${diagnostics.visibleStrandCount}`),
    onInitialFailure: (message) => failures.push(`initial:${message}`),
    onReplacementFailure: (message) => warnings.push(message),
    onTerminalFailure: (message) => failures.push(`terminal:${message}`),
  });

  return {
    coordinator,
    events,
    warnings,
    failures,
    loadSignals,
    backends,
    backendModes,
    committedModes,
    enqueueLoad(load) {
      loads.push(load);
    },
    enqueueBackend(plan) {
      plans.push(plan);
    },
  };
}

function unusedBackendFactory(): RendererBackend {
  throw new Error("The setup test backend factory must not run.");
}

describe("viewport runtime setup containment", () => {
  it("contains dynamic import and coordinator construction failures exactly once", async () => {
    const importFailure = vi.fn();
    const createAfterImportFailure = vi.fn();
    await initializeViewportRuntime({
      isMounted: () => true,
      loadBackendFactory: () => Promise.reject(new Error("dynamic import failed")),
      createCoordinator: createAfterImportFailure,
      createObserver: () => {
        throw new Error("observer must not be created");
      },
      onCoordinatorChange: vi.fn(),
      onSetupFailure: importFailure,
    });

    expect(importFailure).toHaveBeenCalledOnce();
    expect(importFailure).toHaveBeenCalledWith("dynamic import failed");
    expect(createAfterImportFailure).not.toHaveBeenCalled();

    const constructionFailure = vi.fn();
    await initializeViewportRuntime({
      isMounted: () => true,
      loadBackendFactory: () => Promise.resolve(unusedBackendFactory),
      createCoordinator: () => {
        throw new Error("coordinator construction failed");
      },
      createObserver: () => {
        throw new Error("observer must not be created");
      },
      onCoordinatorChange: vi.fn(),
      onSetupFailure: constructionFailure,
    });

    expect(constructionFailure).toHaveBeenCalledOnce();
    expect(constructionFailure).toHaveBeenCalledWith("coordinator construction failed");
  });

  it("deactivates the coordinator and disconnects an observer when observe throws", async () => {
    const harness = createHarness();
    const observer = { disconnect: vi.fn() };
    const coordinatorChanges: Array<ViewportCoordinator | null> = [];
    const setupFailure = vi.fn();

    await initializeViewportRuntime({
      isMounted: () => true,
      loadBackendFactory: () => Promise.resolve(unusedBackendFactory),
      createCoordinator: () => harness.coordinator,
      createObserver: () => ({
        observer,
        observe() {
          throw new Error("observer setup failed");
        },
      }),
      onCoordinatorChange: (coordinator) => coordinatorChanges.push(coordinator),
      onSetupFailure: setupFailure,
    });

    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(harness.events.filter((event) => event === "pointer.clear")).toHaveLength(1);
    expect(coordinatorChanges).toEqual([harness.coordinator, null]);
    expect(setupFailure).toHaveBeenCalledOnce();
    expect(setupFailure).toHaveBeenCalledWith("observer setup failed");
    await expect(harness.coordinator.reload()).resolves.toBeUndefined();
    expect(harness.loadSignals).toEqual([]);
  });

  it("deactivates the coordinator when observer construction throws", async () => {
    const harness = createHarness();
    const setupFailure = vi.fn();

    await initializeViewportRuntime({
      isMounted: () => true,
      loadBackendFactory: () => Promise.resolve(unusedBackendFactory),
      createCoordinator: () => harness.coordinator,
      createObserver: () => {
        throw new Error("observer construction failed");
      },
      onCoordinatorChange: vi.fn(),
      onSetupFailure: setupFailure,
    });

    expect(harness.events.filter((event) => event === "pointer.clear")).toHaveLength(1);
    expect(setupFailure).toHaveBeenCalledOnce();
    expect(setupFailure).toHaveBeenCalledWith("observer construction failed");
    await expect(harness.coordinator.reload()).resolves.toBeUndefined();
    expect(harness.loadSignals).toEqual([]);
  });

  it("does not construct or report after unmount wins the dynamic import race", async () => {
    const backendFactory = deferred<ViewportCoordinatorOptions["createBackend"]>();
    let mounted = true;
    const createCoordinator = vi.fn();
    const setupFailure = vi.fn();
    const setup = initializeViewportRuntime({
      isMounted: () => mounted,
      loadBackendFactory: () => backendFactory.promise,
      createCoordinator,
      createObserver: () => {
        throw new Error("observer must not be created");
      },
      onCoordinatorChange: vi.fn(),
      onSetupFailure: setupFailure,
    });

    mounted = false;
    backendFactory.resolve(unusedBackendFactory);
    await setup;

    expect(createCoordinator).not.toHaveBeenCalled();
    expect(setupFailure).not.toHaveBeenCalled();
  });
});

describe("atomic viewport coordinator", () => {
  it("commits an initial asset only after candidate initialization and first-render success", async () => {
    const harness = createHarness();
    const firstRender = deferred<RendererDiagnostics>();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => firstRender.promise });

    const pending = harness.coordinator.startInitial(false);
    await vi.waitFor(() => expect(harness.events).toContain("backend.1.initialize"));
    expect(harness.events).not.toContain("host.1.reveal");
    firstRender.resolve(successDiagnostics(72));
    await pending;

    expect(harness.events).toEqual([
      "status.initializing",
      "backend.1.initialize",
      "host.1.reveal",
      "status.ready:72",
    ]);
    expect(harness.failures).toEqual([]);
  });

  it("cleans a complete initial candidate failure without fallback resources", async () => {
    const harness = createHarness();
    const disconnect = vi.fn();
    harness.coordinator.attachObserver({ disconnect });
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({
      initialize: () => Promise.reject(new Error("first render failed")),
    });

    await harness.coordinator.startInitial(false);

    expect(harness.events).toContain("backend.1.dispose");
    expect(harness.events).toContain("host.1.remove");
    expect(harness.events).not.toContain("host.1.reveal");
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(harness.events).toContain("pointer.clear");
    expect(harness.failures).toEqual(["initial:first render failed"]);
    await expect(harness.coordinator.reload()).resolves.toBeUndefined();
    expect(harness.loadSignals).toHaveLength(1);
  });

  it("keeps the READY backend active through pending and failed replacement loads", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);

    const replacement = deferred<LoadedStrandBundle>();
    harness.enqueueLoad(() => replacement.promise);
    const pending = harness.coordinator.reload();
    harness.coordinator.updateVisualState({ ...DEFAULT_VISUAL_STATE, previewColor: "#7A1F4D" });
    expect(harness.backends[0]?.states.at(-1)?.previewColor).toBe("#7A1F4D");
    expect(harness.events).not.toContain("backend.1.dispose");
    replacement.reject(new Error("bundle validation failed"));
    await pending;

    expect(harness.events).not.toContain("backend.1.dispose");
    expect(harness.warnings).toEqual(["bundle validation failed"]);
    expect(harness.failures).toEqual([]);
  });

  it("preserves the old backend when a replacement candidate render fails", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    harness.enqueueLoad(() => Promise.resolve(bundle("replacement")));
    harness.enqueueBackend({
      initialize: () => Promise.reject(new Error("candidate render failed")),
    });

    await harness.coordinator.reload();

    expect(harness.events).not.toContain("backend.1.dispose");
    expect(harness.events).toContain("backend.2.dispose");
    expect(harness.warnings).toEqual(["candidate render failed"]);
  });

  it("promotes and updates active references before disposing the previous backend", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    harness.enqueueLoad(() => Promise.resolve(bundle("replacement")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(54)) });

    await harness.coordinator.reload();

    const reveal = harness.events.indexOf("host.2.reveal");
    const ready = harness.events.indexOf("status.ready:54");
    const dispose = harness.events.indexOf("backend.1.dispose");
    expect(reveal).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(reveal);
    expect(dispose).toBeGreaterThan(ready);
  });

  it("changes backend mode from the active asset without another fetch", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(54)) });

    await harness.coordinator.changeMode(true);

    expect(harness.loadSignals).toHaveLength(1);
    expect(harness.backends).toHaveLength(2);
    expect(harness.events).toContain("backend.1.dispose");
    expect(harness.backendModes).toEqual([false, true]);
    expect(harness.committedModes).toEqual([false, true]);
  });

  it("keeps mode provisional on failure and commits the same-mode retry only on promotion", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    harness.enqueueBackend({
      initialize: () => Promise.reject(new Error("webgl candidate failed")),
    });

    await harness.coordinator.changeMode(true);

    expect(harness.backendModes).toEqual([false, true]);
    expect(harness.committedModes).toEqual([false]);
    expect(harness.warnings).toEqual(["webgl candidate failed"]);
    expect(harness.events).not.toContain("backend.1.dispose");

    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(54)) });
    await harness.coordinator.changeMode(true);

    expect(harness.backendModes).toEqual([false, true, true]);
    expect(harness.committedModes).toEqual([false, true]);
    expect(harness.events).toContain("backend.1.dispose");
  });

  it("uses the retained active mode for reload after a failed mode candidate", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    harness.enqueueBackend({
      initialize: () => Promise.reject(new Error("webgl candidate failed")),
    });
    await harness.coordinator.changeMode(true);
    harness.enqueueLoad(() => Promise.resolve(bundle("replacement")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(54)) });

    await harness.coordinator.reload();

    expect(harness.backendModes).toEqual([false, true, false]);
    expect(harness.committedModes).toEqual([false, false]);
  });

  it("prevents a stale mode candidate from overwriting the retained committed mode", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    const staleMode = deferred<RendererDiagnostics>();
    harness.enqueueBackend({ initialize: () => staleMode.promise });

    const stalePending = harness.coordinator.changeMode(true);
    await vi.waitFor(() => expect(harness.events).toContain("backend.2.initialize"));
    await harness.coordinator.changeMode(false);
    staleMode.resolve(successDiagnostics(54));
    await stalePending;

    expect(harness.committedModes).toEqual([false]);
    expect(harness.events.filter((event) => event.startsWith("status.ready:"))).toHaveLength(1);
    expect(harness.events).toContain("backend.2.dispose");
    expect(harness.events).toContain("host.2.remove");
  });

  it("prevents an older pending reload from reverting a newer committed mode", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    const olderReload = deferred<LoadedStrandBundle>();
    harness.enqueueLoad(() => olderReload.promise);
    const reloadPending = harness.coordinator.reload();
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(54)) });

    await harness.coordinator.changeMode(true);

    expect(harness.loadSignals[1]?.aborted).toBe(true);
    expect(harness.committedModes).toEqual([false, true]);
    olderReload.resolve(bundle("older reload"));
    await reloadPending;

    expect(harness.backends).toHaveLength(2);
    expect(harness.events.filter((event) => event.startsWith("status.ready:"))).toEqual([
      "status.ready:72",
      "status.ready:54",
    ]);
    expect(harness.events.filter((event) => event === "backend.1.dispose")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "host.1.remove")).toHaveLength(1);
    expect(harness.events).not.toContain("backend.2.dispose");
    expect(harness.events).not.toContain("host.2.remove");
    expect(harness.warnings).toEqual([]);
  });

  it("disposes a stale reload candidate without touching the newer mode backend", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    const staleReloadRender = deferred<RendererDiagnostics>();
    harness.enqueueLoad(() => Promise.resolve(bundle("older reload")));
    harness.enqueueBackend({ initialize: () => staleReloadRender.promise });
    const reloadPending = harness.coordinator.reload();
    await vi.waitFor(() => expect(harness.events).toContain("backend.2.initialize"));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(54)) });

    await harness.coordinator.changeMode(true);

    expect(harness.committedModes).toEqual([false, true]);
    staleReloadRender.resolve(successDiagnostics(24));
    await reloadPending;

    expect(harness.events.filter((event) => event.startsWith("status.ready:"))).toEqual([
      "status.ready:72",
      "status.ready:54",
    ]);
    expect(harness.events.filter((event) => event === "backend.2.dispose")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "host.2.remove")).toHaveLength(1);
    expect(harness.events).not.toContain("backend.3.dispose");
    expect(harness.events).not.toContain("host.3.remove");
    expect(harness.warnings).toEqual([]);
  });

  it("lets a newer reload invalidate a pending mode candidate under latest intent", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    const staleModeRender = deferred<RendererDiagnostics>();
    harness.enqueueBackend({ initialize: () => staleModeRender.promise });
    const modePending = harness.coordinator.changeMode(true);
    await vi.waitFor(() => expect(harness.events).toContain("backend.2.initialize"));
    harness.enqueueLoad(() => Promise.resolve(bundle("newer reload")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(24)) });

    await harness.coordinator.reload();

    expect(harness.committedModes).toEqual([false, false]);
    staleModeRender.resolve(successDiagnostics(54));
    await modePending;

    expect(harness.backendModes).toEqual([false, true, false]);
    expect(harness.events.filter((event) => event.startsWith("status.ready:"))).toEqual([
      "status.ready:72",
      "status.ready:24",
    ]);
    expect(harness.events.filter((event) => event === "backend.1.dispose")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "host.1.remove")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "backend.2.dispose")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "host.2.remove")).toHaveLength(1);
    expect(harness.events).not.toContain("backend.3.dispose");
    expect(harness.events).not.toContain("host.3.remove");
    expect(harness.warnings).toEqual([]);
  });

  it("aborts the prior load and suppresses stale completion without a warning", async () => {
    const harness = createHarness();
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    const stale = deferred<LoadedStrandBundle>();
    const latest = deferred<LoadedStrandBundle>();
    harness.enqueueLoad(() => stale.promise);
    harness.enqueueLoad(() => latest.promise);
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(24)) });

    const stalePending = harness.coordinator.reload();
    const latestPending = harness.coordinator.reload();
    expect(harness.loadSignals[1]?.aborted).toBe(true);
    stale.resolve(bundle("stale"));
    latest.resolve(bundle("latest"));
    await Promise.all([stalePending, latestPending]);

    expect(harness.warnings).toEqual([]);
    expect(harness.events).toContain("status.ready:24");
    expect(harness.backends).toHaveLength(2);
  });

  it("aborts loads, disconnects observers, clears pointers, and disposes idempotently", async () => {
    const harness = createHarness();
    const load = deferred<LoadedStrandBundle>();
    harness.enqueueLoad(() => load.promise);
    const disconnect = vi.fn();
    harness.coordinator.attachObserver({ disconnect });
    const pending = harness.coordinator.startInitial(false);

    harness.coordinator.deactivate();
    harness.coordinator.deactivate();
    expect(harness.loadSignals[0]?.aborted).toBe(true);
    load.resolve(bundle("stale"));
    await pending;

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(harness.events.filter((event) => event === "pointer.clear")).toHaveLength(1);
    expect(harness.backends).toHaveLength(0);
    expect(harness.failures).toEqual([]);
  });

  it("terminally tears down an active backend during a pending replacement load", async () => {
    const harness = createHarness();
    const disconnect = vi.fn();
    harness.coordinator.attachObserver({ disconnect });
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    const replacement = deferred<LoadedStrandBundle>();
    harness.enqueueLoad(() => replacement.promise);
    const pending = harness.coordinator.reload();

    harness.backends[0]?.callbacks.onFailure(new Error("active backend failed"));

    expect(harness.loadSignals[1]?.aborted).toBe(true);
    expect(harness.events).toContain("backend.1.dispose");
    expect(harness.events).toContain("host.1.remove");
    expect(harness.events).toContain("replacement.loading:false");
    expect(disconnect).toHaveBeenCalledOnce();
    expect(harness.failures).toEqual(["terminal:active backend failed"]);
    replacement.resolve(bundle("stale replacement"));
    await pending;
    await harness.coordinator.reload();
    await harness.coordinator.changeMode(true);

    expect(harness.events.filter((event) => event.startsWith("status.ready:"))).toHaveLength(1);
    expect(harness.loadSignals).toHaveLength(2);
    expect(harness.failures).toEqual(["terminal:active backend failed"]);
  });

  it("disposes an existing candidate and makes terminal teardown idempotent", async () => {
    const harness = createHarness();
    const disconnect = vi.fn();
    harness.coordinator.attachObserver({ disconnect });
    harness.enqueueLoad(() => Promise.resolve(bundle("initial")));
    harness.enqueueBackend({ initialize: () => Promise.resolve(successDiagnostics(72)) });
    await harness.coordinator.startInitial(false);
    const candidateRender = deferred<RendererDiagnostics>();
    harness.enqueueLoad(() => Promise.resolve(bundle("candidate")));
    harness.enqueueBackend({ initialize: () => candidateRender.promise });
    const pending = harness.coordinator.reload();
    await vi.waitFor(() => expect(harness.events).toContain("backend.2.initialize"));

    harness.backends[0]?.callbacks.onFailure(new Error("active backend failed"));
    harness.backends[0]?.callbacks.onFailure(new Error("duplicate terminal failure"));
    harness.coordinator.deactivate();

    expect(harness.events).toContain("backend.1.dispose");
    expect(harness.events).toContain("backend.2.dispose");
    expect(harness.events).toContain("host.1.remove");
    expect(harness.events).toContain("host.2.remove");
    expect(disconnect).toHaveBeenCalledOnce();
    expect(harness.events.filter((event) => event === "pointer.clear")).toHaveLength(1);
    expect(harness.failures).toEqual(["terminal:active backend failed"]);

    candidateRender.resolve(successDiagnostics(54));
    await pending;

    expect(harness.events.filter((event) => event.startsWith("status.ready:"))).toHaveLength(1);
    expect(harness.events.filter((event) => event === "backend.2.dispose")).toHaveLength(1);
    expect(harness.events.filter((event) => event === "host.2.remove")).toHaveLength(1);
  });
});
