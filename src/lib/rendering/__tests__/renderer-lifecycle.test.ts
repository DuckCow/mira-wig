import { describe, expect, it } from "vitest";
import { createViewportLifecycle } from "@/components/rendering/RenderLabViewport";
import {
  createRendererFailureGate,
  type RendererFrameScheduler,
} from "../renderer-backend";

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

class DisposableBackendProbe {
  disposeCount = 0;

  dispose(): void {
    this.disposeCount += 1;
  }
}

describe("renderer terminal failure gate", () => {
  it("contains a deferred render exception and reports terminal failure once", () => {
    const scheduler = new ControlledFrameScheduler();
    const failures: Error[] = [];
    const gate = createRendererFailureGate((error) => failures.push(error), scheduler);
    let renderCount = 0;

    gate.requestRender(() => {
      renderCount += 1;
      throw new Error("deferred render failed");
    });

    expect(scheduler.pendingCount()).toBe(1);
    expect(() => scheduler.flushNext()).not.toThrow();
    expect(renderCount).toBe(1);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toBeInstanceOf(Error);
    expect(failures[0]?.message).toBe("deferred render failed");

    gate.reportFailure(new Error("duplicate backend signal"));
    gate.requestRender(() => {
      renderCount += 1;
    });
    expect(failures).toHaveLength(1);
    expect(scheduler.requestCount).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
  });

  it("cancels a pending frame and remains harmless across repeated disposal", () => {
    const scheduler = new ControlledFrameScheduler();
    const gate = createRendererFailureGate(() => undefined, scheduler);
    let renderCount = 0;

    gate.requestRender(() => {
      renderCount += 1;
    });
    gate.dispose();
    gate.dispose();
    gate.requestRender(() => {
      renderCount += 1;
    });

    expect(scheduler.canceledHandles).toEqual([1]);
    expect(scheduler.requestCount).toBe(1);
    expect(scheduler.pendingCount()).toBe(0);
    expect(scheduler.flushNext()).toBe(false);
    expect(renderCount).toBe(0);
  });

  it("routes owned visual-state failure through the same terminal boundary", () => {
    const scheduler = new ControlledFrameScheduler();
    const failures: Error[] = [];
    const gate = createRendererFailureGate((error) => failures.push(error), scheduler);
    let laterUpdateCount = 0;

    gate.runOwnedUpdate(() => {
      throw new Error("visual state failed");
    });
    gate.runOwnedUpdate(() => {
      laterUpdateCount += 1;
    });
    gate.requestRender(() => undefined);

    expect(failures.map((error) => error.message)).toEqual(["visual state failed"]);
    expect(laterUpdateCount).toBe(0);
    expect(scheduler.requestCount).toBe(0);
  });
});

describe("viewport generation lifecycle", () => {
  it("disconnects, clears, disposes, resets pointer state, and reports failure in order", () => {
    const events: string[] = [];
    const backend = new DisposableBackendProbe();
    let activeBackend: DisposableBackendProbe | null = backend;
    let pointerActive = true;
    const lifecycle = createViewportLifecycle({
      isCurrentGeneration: () => true,
      clearActiveBackend: (candidate) => {
        if (activeBackend === candidate) {
          events.push("backend.clear");
          activeBackend = null;
        }
      },
      clearPointer: () => {
        events.push("pointer.clear");
        pointerActive = false;
      },
      onFailure: (message) => events.push(`status.failed:${message}`),
    });
    const observer = {
      disconnect: () => events.push("observer.disconnect"),
    };

    expect(lifecycle.attachBackend(backend)).toBe(true);
    expect(lifecycle.attachObserver(observer)).toBe(true);
    lifecycle.fail(new Error("scheduled render failed"));
    lifecycle.fail(new Error("duplicate failure"));
    lifecycle.deactivate();

    expect(events).toEqual([
      "observer.disconnect",
      "backend.clear",
      "pointer.clear",
      "status.failed:scheduled render failed",
    ]);
    expect(activeBackend).toBeNull();
    expect(backend.disposeCount).toBe(1);
    expect(pointerActive).toBe(false);
    expect(lifecycle.isActive()).toBe(false);
  });

  it("tears down a stale generation without clearing or failing its replacement", () => {
    let generation = 1;
    const staleBackend = new DisposableBackendProbe();
    const replacementBackend = new DisposableBackendProbe();
    let activeBackend: DisposableBackendProbe | null = staleBackend;
    let observerDisconnectCount = 0;
    let failureCount = 0;
    const lifecycle = createViewportLifecycle({
      isCurrentGeneration: () => generation === 1,
      clearActiveBackend: (candidate) => {
        if (activeBackend === candidate) activeBackend = null;
      },
      clearPointer: () => undefined,
      onFailure: () => {
        failureCount += 1;
      },
    });

    expect(lifecycle.attachBackend(staleBackend)).toBe(true);
    expect(lifecycle.attachObserver({
      disconnect: () => {
        observerDisconnectCount += 1;
      },
    })).toBe(true);
    generation = 2;
    activeBackend = replacementBackend;
    lifecycle.fail(new Error("stale asynchronous callback"));

    expect(observerDisconnectCount).toBe(1);
    expect(staleBackend.disposeCount).toBe(1);
    expect(activeBackend).toBe(replacementBackend);
    expect(replacementBackend.disposeCount).toBe(0);
    expect(failureCount).toBe(0);
  });
});
