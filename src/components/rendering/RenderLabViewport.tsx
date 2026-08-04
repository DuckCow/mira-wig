"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  isStrandBundleAbortError,
  loadDiagnosticStrandBundle,
  type LoadedStrandBundle,
} from "@/lib/rendering/strand-bundle-loader";
import {
  DEFAULT_VISUAL_STATE,
  canonicalizeVisualState,
  type VisualDensityTier,
  type VisualState,
} from "@/lib/rendering/visual-state";
import type {
  RendererBackend,
  RendererBackendCallbacks,
  RendererDiagnostics,
} from "@/lib/rendering/renderer-backend";

type ViewportStatus =
  | { readonly kind: "INITIALIZING" }
  | { readonly kind: "UNSUPPORTED"; readonly message: string }
  | { readonly kind: "FAILED"; readonly message: string }
  | { readonly kind: "READY" };

const DENSITY_OPTIONS: readonly VisualDensityTier[] = ["LOW", "MEDIUM", "HIGH"];
const DENSITY_LABELS: Readonly<Record<VisualDensityTier, string>> = {
  LOW: "낮음",
  MEDIUM: "중간",
  HIGH: "높음",
};
const PREVIEW_COLOR_OPTIONS: readonly { readonly label: string; readonly value: string }[] = [
  { label: "샘플 색상 A", value: "#34251F" },
  { label: "샘플 색상 B", value: "#7A1F4D" },
  { label: "샘플 색상 C", value: "#B98555" },
];

function releaseProbeContext(context: WebGL2RenderingContext | null): void {
  context?.getExtension("WEBGL_lose_context")?.loseContext();
}

function hasLocalRendererCapability(): boolean {
  if (Reflect.get(navigator, "gpu") !== undefined) return true;
  const probe = document.createElement("canvas");
  const context = probe.getContext("webgl2");
  const supported = context !== null;
  releaseProbeContext(context);
  return supported;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "렌더러를 초기화하지 못했습니다.";
}

export interface ViewportRenderHost {
  reveal(): void;
  remove(): void;
}

interface DomViewportRenderHost extends ViewportRenderHost {
  readonly element: HTMLElement;
}

interface ViewportObserver {
  disconnect(): void;
}

type ViewportBackend = RendererBackend;

interface RenderEntry {
  readonly bundle: LoadedStrandBundle;
  readonly backend: ViewportBackend;
  readonly host: ViewportRenderHost;
  readonly forceWebGL: boolean;
  readonly generation: number;
  failure: Error | null;
}

interface LoadOperation {
  readonly initial: boolean;
  readonly generation: number;
  readonly intentGeneration: number;
  readonly activeEntryAtStart: RenderEntry | null;
  readonly controller: AbortController;
}

export interface ViewportCoordinatorOptions {
  readonly loadBundle: (signal: AbortSignal) => Promise<LoadedStrandBundle>;
  readonly createHost: () => ViewportRenderHost;
  readonly createBackend: (
    host: ViewportRenderHost,
    forceWebGL: boolean,
    callbacks: RendererBackendCallbacks,
  ) => ViewportBackend;
  readonly getVisualState: () => VisualState;
  readonly isAbortError: (error: unknown) => boolean;
  readonly clearPointer: () => void;
  readonly onInitialLoading: () => void;
  readonly onReplacementLoading: (loading: boolean) => void;
  readonly onModeCommitted: (forceWebGL: boolean) => void;
  readonly onReady: (diagnostics: RendererDiagnostics) => void;
  readonly onDiagnostics: (diagnostics: RendererDiagnostics) => void;
  readonly onInitialFailure: (message: string) => void;
  readonly onReplacementFailure: (message: string) => void;
  readonly onTerminalFailure: (message: string) => void;
}

export interface ViewportCoordinator {
  startInitial(forceWebGL: boolean): Promise<void>;
  reload(): Promise<void>;
  changeMode(forceWebGL: boolean): Promise<void>;
  updateVisualState(state: VisualState): void;
  resize(width: number, height: number): void;
  attachObserver(observer: ViewportObserver): boolean;
  deactivate(): void;
}

type ViewportBackendFactory = ViewportCoordinatorOptions["createBackend"];

export interface ViewportRuntimeSetupObserver {
  readonly observer: ViewportObserver;
  observe(): void;
}

export interface ViewportRuntimeSetupOptions {
  readonly isMounted: () => boolean;
  readonly loadBackendFactory: () => Promise<ViewportBackendFactory>;
  readonly createCoordinator: (backendFactory: ViewportBackendFactory) => ViewportCoordinator;
  readonly createObserver: (coordinator: ViewportCoordinator) => ViewportRuntimeSetupObserver;
  readonly onCoordinatorChange: (coordinator: ViewportCoordinator | null) => void;
  readonly onSetupFailure: (message: string) => void;
}

/** Contains all asynchronous and observer setup before the coordinator owns normal runtime flow. */
export async function initializeViewportRuntime(
  options: ViewportRuntimeSetupOptions,
): Promise<void> {
  let coordinator: ViewportCoordinator | null = null;
  let setupObserver: ViewportRuntimeSetupObserver | null = null;
  let observerOwnedByCoordinator = false;
  try {
    const backendFactory = await options.loadBackendFactory();
    if (!options.isMounted()) return;
    coordinator = options.createCoordinator(backendFactory);
    options.onCoordinatorChange(coordinator);
    setupObserver = options.createObserver(coordinator);
    observerOwnedByCoordinator = coordinator.attachObserver(setupObserver.observer);
    if (!observerOwnedByCoordinator) {
      setupObserver = null;
      throw new Error("Viewport coordinator became inactive during setup.");
    }
    setupObserver.observe();
    await coordinator.startInitial(false);
  } catch (error) {
    if (setupObserver !== null && !observerOwnedByCoordinator) {
      setupObserver.observer.disconnect();
    }
    coordinator?.deactivate();
    if (coordinator !== null) options.onCoordinatorChange(null);
    if (options.isMounted()) options.onSetupFailure(failureMessage(error));
  }
}

/** Owns load generations and hidden renderer candidates without requiring a GPU in tests. */
export function createViewportCoordinator(
  options: ViewportCoordinatorOptions,
): ViewportCoordinator {
  let active = true;
  let intentGeneration = 0;
  let loadGeneration = 0;
  let rendererGeneration = 0;
  let replacementLoading = false;
  let loadController: AbortController | null = null;
  let activeEntry: RenderEntry | null = null;
  let candidateEntry: RenderEntry | null = null;
  let observer: ViewportObserver | null = null;

  function disposeEntry(entry: RenderEntry | null): void {
    if (entry === null) return;
    entry.backend.dispose();
    entry.host.remove();
  }

  function disposeCandidate(entry: RenderEntry): void {
    if (candidateEntry === entry) candidateEntry = null;
    disposeEntry(entry);
  }

  function invalidateCandidate(): void {
    rendererGeneration += 1;
    const previousCandidate = candidateEntry;
    candidateEntry = null;
    disposeEntry(previousCandidate);
  }

  /** Latest user-started load or mode intent wins across both operation kinds. */
  function beginIntent(cancelPendingLoad: boolean): number {
    intentGeneration += 1;
    invalidateCandidate();
    if (cancelPendingLoad) {
      if (loadController !== null) {
        loadGeneration += 1;
        loadController.abort();
        loadController = null;
      }
      if (replacementLoading) {
        replacementLoading = false;
        options.onReplacementLoading(false);
      }
    }
    return intentGeneration;
  }

  function enterTerminal(
    failure: { readonly kind: "INITIAL" | "TERMINAL"; readonly message: string } | null,
  ): void {
    if (!active) return;
    active = false;
    intentGeneration += 1;
    loadGeneration += 1;
    loadController?.abort();
    loadController = null;
    invalidateCandidate();
    const currentActive = activeEntry;
    activeEntry = null;
    disposeEntry(currentActive);
    observer?.disconnect();
    observer = null;
    options.clearPointer();
    if (replacementLoading) {
      replacementLoading = false;
      options.onReplacementLoading(false);
    }
    if (failure?.kind === "INITIAL") options.onInitialFailure(failure.message);
    if (failure?.kind === "TERMINAL") options.onTerminalFailure(failure.message);
  }

  function failActive(entry: RenderEntry, error: unknown): void {
    if (!active || activeEntry !== entry) return;
    enterTerminal({ kind: "TERMINAL", message: failureMessage(error) });
  }

  function normalizedFailure(error: unknown): Error {
    if (error instanceof Error) return error;
    return new Error(failureMessage(error), { cause: error });
  }

  async function buildAndPromote(
    bundle: LoadedStrandBundle,
    candidateForceWebGL: boolean,
    mayCommit: () => boolean,
  ): Promise<boolean> {
    invalidateCandidate();
    const generation = rendererGeneration;

    const host = options.createHost();
    let entry: RenderEntry | null = null;
    let creationFailure: Error | null = null;
    let backend: ViewportBackend;
    try {
      backend = options.createBackend(host, candidateForceWebGL, {
        onDiagnostics: (diagnostics) => {
          if (entry !== null && activeEntry === entry) options.onDiagnostics(diagnostics);
        },
        onFailure: (error) => {
          creationFailure = error;
          if (entry !== null) entry.failure = error;
          if (entry !== null) failActive(entry, error);
        },
      });
    } catch (error) {
      host.remove();
      throw error;
    }
    entry = {
      bundle,
      backend,
      host,
      forceWebGL: candidateForceWebGL,
      generation,
      failure: creationFailure,
    };
    candidateEntry = entry;

    let diagnostics: RendererDiagnostics;
    try {
      diagnostics = await backend.initialize(bundle.asset, options.getVisualState());
      if (entry.failure !== null) throw entry.failure;
    } catch (error) {
      disposeCandidate(entry);
      throw error;
    }
    if (
      !active ||
      generation !== rendererGeneration ||
      candidateEntry !== entry ||
      !mayCommit()
    ) {
      disposeCandidate(entry);
      return false;
    }

    const previousActive = activeEntry;
    host.reveal();
    activeEntry = entry;
    candidateEntry = null;
    options.onModeCommitted(entry.forceWebGL);
    options.onReady(diagnostics);
    disposeEntry(previousActive);
    return true;
  }

  function beginLoad(
    initial: boolean,
    operationIntentGeneration: number,
    activeEntryAtStart: RenderEntry | null,
  ): LoadOperation {
    loadGeneration += 1;
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    if (initial) options.onInitialLoading();
    else {
      replacementLoading = true;
      options.onReplacementLoading(true);
    }
    return {
      initial,
      generation: loadGeneration,
      intentGeneration: operationIntentGeneration,
      activeEntryAtStart,
      controller,
    };
  }

  function loadCannotCommit(operation: LoadOperation): boolean {
    return (
      !active ||
      operation.controller.signal.aborted ||
      operation.generation !== loadGeneration ||
      operation.intentGeneration !== intentGeneration ||
      operation.activeEntryAtStart !== activeEntry
    );
  }

  function reportLoadFailure(operation: LoadOperation, error: unknown): void {
    if (loadCannotCommit(operation) || options.isAbortError(error)) return;
    if (activeEntry !== null) {
      options.onReplacementFailure(failureMessage(error));
      return;
    }
    enterTerminal({ kind: "INITIAL", message: failureMessage(error) });
  }

  function finishLoad(operation: LoadOperation): void {
    if (loadController === operation.controller) loadController = null;
    if (
      !operation.initial &&
      active &&
      operation.generation === loadGeneration &&
      operation.intentGeneration === intentGeneration
    ) {
      replacementLoading = false;
      options.onReplacementLoading(false);
    }
  }

  async function runLoad(
    initial: boolean,
    candidateForceWebGL: boolean,
    operationIntentGeneration: number,
    activeEntryAtStart: RenderEntry | null,
  ): Promise<void> {
    if (!active) return;
    const operation = beginLoad(
      initial,
      operationIntentGeneration,
      activeEntryAtStart,
    );

    try {
      const bundle = await options.loadBundle(operation.controller.signal);
      if (loadCannotCommit(operation)) return;
      await buildAndPromote(
        bundle,
        candidateForceWebGL,
        () => !loadCannotCommit(operation),
      );
    } catch (error) {
      reportLoadFailure(operation, error);
    } finally {
      finishLoad(operation);
    }
  }

  return {
    startInitial(nextForceWebGL) {
      if (!active) return Promise.resolve();
      const operationIntentGeneration = beginIntent(false);
      return runLoad(true, nextForceWebGL, operationIntentGeneration, null);
    },
    reload() {
      if (!active) return Promise.resolve();
      const current = activeEntry;
      const operationIntentGeneration = beginIntent(false);
      return runLoad(
        current === null,
        current?.forceWebGL ?? false,
        operationIntentGeneration,
        current,
      );
    },
    async changeMode(nextForceWebGL) {
      if (!active) return;
      const current = activeEntry;
      if (current === null) return;
      const operationIntentGeneration = beginIntent(true);
      if (current.forceWebGL === nextForceWebGL) {
        return;
      }
      try {
        await buildAndPromote(
          current.bundle,
          nextForceWebGL,
          () =>
            active &&
            intentGeneration === operationIntentGeneration &&
            activeEntry === current,
        );
      } catch (error) {
        if (
          active &&
          intentGeneration === operationIntentGeneration &&
          activeEntry === current
        ) {
          options.onReplacementFailure(failureMessage(error));
        }
      }
    },
    updateVisualState(state) {
      if (!active) return;
      const currentActive = activeEntry;
      if (currentActive !== null) {
        try {
          currentActive.backend.updateVisualState(state);
        } catch (error) {
          failActive(currentActive, error);
        }
      }
      const currentCandidate = candidateEntry;
      if (currentCandidate !== null) {
        try {
          currentCandidate.backend.updateVisualState(state);
        } catch (error) {
          currentCandidate.failure = normalizedFailure(error);
          disposeCandidate(currentCandidate);
        }
      }
    },
    resize(width, height) {
      if (!active) return;
      activeEntry?.backend.resize(width, height);
      candidateEntry?.backend.resize(width, height);
    },
    attachObserver(nextObserver) {
      if (!active) {
        nextObserver.disconnect();
        return false;
      }
      observer?.disconnect();
      observer = nextObserver;
      return true;
    },
    deactivate() {
      enterTerminal(null);
    },
  };
}

function createRenderHost(container: HTMLElement): DomViewportRenderHost {
  const element = document.createElement("div");
  element.className = "absolute inset-0";
  element.style.visibility = "hidden";
  element.style.pointerEvents = "none";
  element.setAttribute("aria-hidden", "true");
  container.appendChild(element);
  let removed = false;
  return {
    element,
    reveal() {
      if (removed) return;
      element.style.visibility = "visible";
      element.removeAttribute("aria-hidden");
    },
    remove() {
      if (removed) return;
      removed = true;
      element.remove();
    },
  };
}

function StatusOverlay({ status }: { status: ViewportStatus }) {
  if (status.kind === "READY") return null;
  const failed = status.kind === "FAILED" || status.kind === "UNSUPPORTED";
  const message =
    status.kind === "INITIALIZING"
      ? "진단 번들과 그래픽 백엔드를 초기화하는 중…"
      : status.message;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-slate-900/75 p-6 text-center">
      <p
        role="status"
        aria-live="polite"
        className={failed ? "text-sm text-rose-100" : "text-sm text-slate-100"}
      >
        {message}
      </p>
    </div>
  );
}

function Diagnostics({ diagnostics }: { diagnostics: RendererDiagnostics | null }) {
  if (diagnostics === null) return null;
  return (
    <dl className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-white p-3 text-center text-xs">
      <div>
        <dt className="text-slate-500">백엔드</dt>
        <dd className="mt-1 font-semibold text-slate-900">{diagnostics.backend}</dd>
      </div>
      <div>
        <dt className="text-slate-500">표시 스트랜드</dt>
        <dd className="mt-1 font-semibold text-slate-900">{diagnostics.visibleStrandCount}</dd>
      </div>
      <div>
        <dt className="text-slate-500">최근 CPU 제출</dt>
        <dd className="mt-1 font-semibold text-slate-900">
          {diagnostics.frameDurationMs.toFixed(2)} ms
        </dd>
      </div>
    </dl>
  );
}

export function RenderLabViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef<ViewportCoordinator | null>(null);
  const visualStateRef = useRef<VisualState>(DEFAULT_VISUAL_STATE);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [visualState, setVisualState] = useState<VisualState>(DEFAULT_VISUAL_STATE);
  const [forceWebGL, setForceWebGL] = useState(false);
  const [status, setStatus] = useState<ViewportStatus>({ kind: "INITIALIZING" });
  const [diagnostics, setDiagnostics] = useState<RendererDiagnostics | null>(null);
  const [replacementWarning, setReplacementWarning] = useState<string | null>(null);
  const [replacementLoading, setReplacementLoading] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const target = container;
    if (!hasLocalRendererCapability()) {
      setStatus({
        kind: "UNSUPPORTED",
        message: "이 브라우저에는 WebGPU 또는 WebGL2 그래픽 백엔드가 없습니다.",
      });
      return;
    }
    let mounted = true;
    let coordinator: ViewportCoordinator | null = null;

    void initializeViewportRuntime({
      isMounted: () => mounted,
      async loadBackendFactory() {
        const { createRendererBackend } = await import("@/lib/rendering/renderer-backend");
        return (host, candidateForceWebGL, callbacks) => {
          if (!("element" in host) || !(host.element instanceof HTMLElement)) {
            throw new Error("Renderer host element is unavailable.");
          }
          return createRendererBackend(
            host.element,
            { forceWebGL: candidateForceWebGL },
            callbacks,
          );
        };
      },
      createCoordinator: (backendFactory) => createViewportCoordinator({
        loadBundle: (signal) => loadDiagnosticStrandBundle(signal),
        createHost: () => createRenderHost(target),
        createBackend: backendFactory,
        getVisualState: () => visualStateRef.current,
        isAbortError: isStrandBundleAbortError,
        clearPointer: () => {
          pointerRef.current = null;
        },
        onInitialLoading: () => {
          setStatus({ kind: "INITIALIZING" });
          setDiagnostics(null);
          setReplacementWarning(null);
        },
        onReplacementLoading: setReplacementLoading,
        onModeCommitted: setForceWebGL,
        onReady: (nextDiagnostics) => {
          setDiagnostics(nextDiagnostics);
          setStatus({ kind: "READY" });
          setReplacementWarning(null);
        },
        onDiagnostics: setDiagnostics,
        onInitialFailure: (message) => {
          setStatus({ kind: "FAILED", message });
          setDiagnostics(null);
        },
        onReplacementFailure: setReplacementWarning,
        onTerminalFailure: (message) => {
          setStatus({ kind: "FAILED", message });
          setDiagnostics(null);
        },
      }),
      createObserver: (nextCoordinator) => {
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry !== undefined) {
            nextCoordinator.resize(entry.contentRect.width, entry.contentRect.height);
          }
        });
        return {
          observer,
          observe: () => observer.observe(target),
        };
      },
      onCoordinatorChange(nextCoordinator) {
        const previousCoordinator = coordinator;
        coordinator = nextCoordinator;
        if (nextCoordinator !== null) {
          coordinatorRef.current = nextCoordinator;
        } else if (coordinatorRef.current === previousCoordinator) {
          coordinatorRef.current = null;
        }
      },
      onSetupFailure(message) {
        pointerRef.current = null;
        setDiagnostics(null);
        setReplacementLoading(false);
        setReplacementWarning(null);
        setStatus({ kind: "FAILED", message });
      },
    });
    return () => {
      mounted = false;
      if (coordinatorRef.current === coordinator) coordinatorRef.current = null;
      coordinator?.deactivate();
    };
  }, []);

  useEffect(() => {
    visualStateRef.current = visualState;
    coordinatorRef.current?.updateVisualState(visualState);
  }, [visualState]);

  function updateDensity(tier: VisualDensityTier): void {
    setVisualState((current) =>
      canonicalizeVisualState({ ...current, visualDensityTier: tier }),
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (status.kind !== "READY") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const previous = pointerRef.current;
    if (previous === null) return;
    const deltaX = event.clientX - previous.x;
    const deltaY = event.clientY - previous.y;
    pointerRef.current = { x: event.clientX, y: event.clientY };
    setVisualState((current) =>
      canonicalizeVisualState({
        ...current,
        viewRotation: {
          yaw: current.viewRotation.yaw + deltaX * 0.008,
          pitch: current.viewRotation.pitch + deltaY * 0.008,
        },
      }),
    );
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>): void {
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function changeMode(nextForceWebGL: boolean): void {
    setReplacementWarning(null);
    void coordinatorRef.current?.changeMode(nextForceWebGL);
  }

  function reset(): void {
    pointerRef.current = null;
    setVisualState(DEFAULT_VISUAL_STATE);
    changeMode(false);
  }

  return (
    <section className="space-y-4" aria-label="내부 렌더링 진단">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div
          ref={containerRef}
          className="relative h-96 touch-none cursor-grab overflow-hidden rounded-2xl border border-slate-300 bg-slate-200 active:cursor-grabbing sm:h-[30rem]"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={(event) => {
            if (event.buttons === 0) handlePointerEnd(event);
          }}
        >
          <StatusOverlay status={status} />
          <span className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full bg-slate-950/70 px-3 py-1 text-xs text-white">
            드래그하여 보기 회전
          </span>
        </div>

        <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">미리보기 색상</legend>
            <label className="mt-2 flex items-center gap-3 text-sm text-slate-600">
              <input
                type="color"
                value={visualState.previewColor}
                onChange={(event) => {
                  setVisualState((current) =>
                    canonicalizeVisualState({
                      ...current,
                      previewColor: event.target.value,
                    }),
                  );
                }}
                className="h-10 w-14 cursor-pointer rounded border border-slate-300 bg-white p-1"
              />
              <code>{visualState.previewColor}</code>
            </label>
            <div className="mt-2 flex gap-2" aria-label="미리보기 샘플 색상">
              {PREVIEW_COLOR_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={visualState.previewColor === option.value}
                  onClick={() => {
                    setVisualState((current) =>
                      canonicalizeVisualState({
                        ...current,
                        previewColor: option.value,
                      }),
                    );
                  }}
                  className="h-7 w-7 rounded-full border-2 border-white shadow ring-1 ring-slate-300"
                  style={{ backgroundColor: option.value }}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">SHADER_PARAMETER</p>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">시각 밀도 단계</legend>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {DENSITY_OPTIONS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  aria-pressed={visualState.visualDensityTier === tier}
                  onClick={() => updateDensity(tier)}
                  className={
                    visualState.visualDensityTier === tier
                      ? "rounded-lg bg-slate-900 px-2 py-2 text-xs font-semibold text-white"
                      : "rounded-lg border border-slate-300 px-2 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  }
                >
                  {DENSITY_LABELS[tier]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">STRAND_SELECTION · 실제 수치 아님</p>
          </fieldset>

          <label className="block text-sm font-semibold text-slate-900">
            백엔드 진단 모드
            <select
              value={forceWebGL ? "WEBGL2" : "AUTO"}
              onChange={(event) => changeMode(event.target.value === "WEBGL2")}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"
            >
              <option value="AUTO">자동 (WebGPU 우선)</option>
              <option value="WEBGL2">WebGL2 강제</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => {
              setReplacementWarning(null);
              void coordinatorRef.current?.reload();
            }}
            className="w-full rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Reload diagnostic bundle
          </button>
          {replacementLoading ? (
            <p role="status" className="text-xs text-slate-500">교체 번들을 검증하는 중…</p>
          ) : null}
          {replacementWarning !== null ? (
            <p role="status" className="text-xs text-amber-700">
              기존 READY 렌더를 유지했습니다: {replacementWarning}
            </p>
          ) : null}

          <button
            type="button"
            onClick={reset}
            className="w-full rounded-lg border border-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            초기화
          </button>
        </div>
      </div>

      <Diagnostics diagnostics={diagnostics} />
    </section>
  );
}
