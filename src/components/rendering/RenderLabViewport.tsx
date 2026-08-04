"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createProceduralStrandSource } from "@/lib/rendering/procedural-strand-source";
import {
  DEFAULT_VISUAL_STATE,
  canonicalizeVisualState,
  type VisualDensityTier,
  type VisualState,
} from "@/lib/rendering/visual-state";
import type {
  RendererBackend,
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

interface ViewportLifecycleBackend {
  dispose(): void;
}

interface ViewportLifecycleObserver {
  disconnect(): void;
}

export interface ViewportLifecycle {
  isActive(): boolean;
  attachBackend(backend: ViewportLifecycleBackend): boolean;
  attachObserver(observer: ViewportLifecycleObserver): boolean;
  fail(error: unknown): void;
  deactivate(): void;
}

interface ViewportLifecycleOptions {
  readonly isCurrentGeneration: () => boolean;
  readonly clearActiveBackend: (backend: ViewportLifecycleBackend) => void;
  readonly clearPointer: () => void;
  readonly onFailure: (message: string) => void;
}

/** Owns one viewport generation's backend, observer, pointer, and terminal status. */
export function createViewportLifecycle(
  options: ViewportLifecycleOptions,
): ViewportLifecycle {
  let active = true;
  let backend: ViewportLifecycleBackend | null = null;
  let observer: ViewportLifecycleObserver | null = null;

  function isActive(): boolean {
    return active && options.isCurrentGeneration();
  }

  function teardown(error?: unknown): void {
    if (!active) return;
    const shouldReportFailure = error !== undefined && options.isCurrentGeneration();
    active = false;

    const currentObserver = observer;
    observer = null;
    currentObserver?.disconnect();

    const currentBackend = backend;
    backend = null;
    if (currentBackend !== null) {
      options.clearActiveBackend(currentBackend);
      currentBackend.dispose();
    }

    options.clearPointer();
    if (shouldReportFailure) options.onFailure(failureMessage(error));
  }

  return {
    isActive,
    attachBackend(nextBackend) {
      if (!isActive()) {
        nextBackend.dispose();
        return false;
      }
      backend = nextBackend;
      return true;
    },
    attachObserver(nextObserver) {
      if (!isActive()) {
        nextObserver.disconnect();
        return false;
      }
      observer = nextObserver;
      return true;
    },
    fail: (error) => teardown(error),
    deactivate: () => teardown(),
  };
}

function StatusOverlay({ status }: { status: ViewportStatus }) {
  if (status.kind === "READY") return null;
  const failed = status.kind === "FAILED" || status.kind === "UNSUPPORTED";
  const message =
    status.kind === "INITIALIZING" ? "그래픽 백엔드를 초기화하는 중…" : status.message;
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
  const asset = useMemo(
    () =>
      createProceduralStrandSource({
        seed: 20_260_804,
        columns: 9,
        rows: 8,
        controlPointCount: 6,
        defaultWidth: 0.028,
      }).createAsset(),
    [],
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const backendRef = useRef<RendererBackend | null>(null);
  const lifecycleRef = useRef<ViewportLifecycle | null>(null);
  const generationRef = useRef(0);
  const visualStateRef = useRef<VisualState>(DEFAULT_VISUAL_STATE);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [visualState, setVisualState] = useState<VisualState>(DEFAULT_VISUAL_STATE);
  const [forceWebGL, setForceWebGL] = useState(false);
  const [status, setStatus] = useState<ViewportStatus>({ kind: "INITIALIZING" });
  const [diagnostics, setDiagnostics] = useState<RendererDiagnostics | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    if (!hasLocalRendererCapability()) {
      setStatus({
        kind: "UNSUPPORTED",
        message: "이 브라우저에는 WebGPU 또는 WebGL2 그래픽 백엔드가 없습니다.",
      });
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const lifecycle = createViewportLifecycle({
      isCurrentGeneration: () => generationRef.current === generation,
      clearActiveBackend: (backend) => {
        if (backendRef.current === backend) backendRef.current = null;
      },
      clearPointer: () => {
        pointerRef.current = null;
      },
      onFailure: (message) => {
        setStatus((current) =>
          current.kind === "FAILED" ? current : { kind: "FAILED", message },
        );
      },
    });
    lifecycleRef.current = lifecycle;
    setStatus({ kind: "INITIALIZING" });
    setDiagnostics(null);

    async function initialize(target: HTMLDivElement): Promise<void> {
      try {
        const { createRendererBackend } = await import("@/lib/rendering/renderer-backend");
        if (!lifecycle.isActive()) return;
        const backend = createRendererBackend(
          target,
          { forceWebGL },
          {
            onDiagnostics: (next) => {
              if (lifecycle.isActive()) setDiagnostics(next);
            },
            onFailure: (error) => lifecycle.fail(error),
          },
        );
        if (!lifecycle.attachBackend(backend)) return;
        backendRef.current = backend;
        const observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry !== undefined && lifecycle.isActive()) {
            backend.resize(entry.contentRect.width, entry.contentRect.height);
          }
        });
        if (!lifecycle.attachObserver(observer)) return;
        observer.observe(target);
        const initialDiagnostics = await backend.initialize(asset, visualStateRef.current);
        if (!lifecycle.isActive()) return;
        setDiagnostics(initialDiagnostics);
        setStatus({ kind: "READY" });
      } catch (error) {
        lifecycle.fail(error);
      }
    }

    void initialize(container);
    return () => {
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
      lifecycle.deactivate();
    };
  }, [asset, forceWebGL]);

  useEffect(() => {
    visualStateRef.current = visualState;
    const backend = backendRef.current;
    if (backend === null) return;
    try {
      backend.updateVisualState(visualState);
    } catch (error) {
      lifecycleRef.current?.fail(error);
    }
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

  function reset(): void {
    pointerRef.current = null;
    setVisualState(DEFAULT_VISUAL_STATE);
    setForceWebGL(false);
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
              onChange={(event) => setForceWebGL(event.target.value === "WEBGL2")}
              className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-700"
            >
              <option value="AUTO">자동 (WebGPU 우선)</option>
              <option value="WEBGL2">WebGL2 강제</option>
            </select>
          </label>

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
