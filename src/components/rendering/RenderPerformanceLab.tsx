"use client";

import { useEffect, useRef, useState } from "react";
import { startBenchmarkProvenance } from "@/app/admin/render-lab/performance/actions";
import { startPointSensitivityProvenance } from "@/app/admin/render-lab/performance/point-sensitivity-actions";
import { startControlPointTessellationProvenance } from "@/app/admin/render-lab/performance/control-point-tessellation-actions";
import { RENDERER_BENCHMARK_SEED } from "@/lib/rendering/benchmark-input";
import {
  CONTROL_POINT_TESSELLATION_SEED,
} from "@/lib/rendering/benchmark-control-point-tessellation-input";
import {
  captureRawBrowserVersionEvidence,
  deriveBrowserVersionConclusion,
  type ControlPointTessellationBrowserProduct,
} from "@/lib/rendering/benchmark-control-point-tessellation-browser-admission";
import {
  controlPointTessellationResultFilename,
  serializeControlPointTessellationResult,
  type ControlPointTessellationOperatorDeclaration,
  type ControlPointTessellationResult,
} from "@/lib/rendering/benchmark-control-point-tessellation-result";
import {
  executeControlPointTessellationBenchmark,
  type ControlPointTessellationProgress,
} from "@/lib/rendering/benchmark-control-point-tessellation-runner";
import { POINT_SENSITIVITY_SEED } from "@/lib/rendering/benchmark-point-sensitivity-input";
import {
  pointSensitivityResultFilename,
  serializePointSensitivityResult,
  type PointSensitivityResult,
} from "@/lib/rendering/benchmark-point-sensitivity-result";
import { executePointSensitivityBenchmark } from "@/lib/rendering/benchmark-point-sensitivity-runner";
import {
  rendererBenchmarkResultFilename,
  serializeRendererBenchmarkResult,
  type BenchmarkOperatorDeclaration,
  type BenchmarkRunKind,
  type RendererBenchmarkResult,
} from "@/lib/rendering/benchmark-result";
import { executeRendererBenchmark } from "@/lib/rendering/benchmark-runner";

const DISCLOSURES = [
  "BENCHMARK_ONLY",
  "VISUAL_ONLY",
  "EXPLORATORY CHARACTERIZATION",
  "NOT PRODUCT TRUTH",
  "NOT FIT EVIDENCE",
  "NOT A PRODUCTION BUDGET",
  "NOT A MANUFACTURING SPECIFICATION",
] as const;

const DEFAULT_OPERATOR: BenchmarkOperatorDeclaration = {
  browserEngine: "CHROMIUM_FAMILY",
  browserMajor: 140,
  osFamily: "MACOS",
  architecture: "ARM64",
  deviceClass: "PRIMARY_REFERENCE",
  powerMode: "AC_POWER",
  lowPowerState: "OFF",
};

const DEFAULT_S2_OPERATOR: ControlPointTessellationOperatorDeclaration = {
  browserEngine: "CHROMIUM_FAMILY",
  declaredBrowserProduct: "CHROME",
  declaredBrowserMajor: 140,
  osFamily: "MACOS",
  architecture: "ARM64",
  deviceClass: "PRIMARY_REFERENCE",
  powerMode: "AC_POWER",
  lowPowerState: "OFF",
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "특성화 실행에 실패했습니다.";
}

function detectedBrowserLabel(): string {
  try {
    const detected = deriveBrowserVersionConclusion(captureRawBrowserVersionEvidence());
    return `${detected.product} ${detected.major}`;
  } catch {
    return "Unrecognized / admission will fail";
  }
}

function osFamily(value: string): BenchmarkOperatorDeclaration["osFamily"] {
  if (value === "MACOS" || value === "IOS" || value === "WINDOWS") return value;
  if (value === "LINUX" || value === "ANDROID") return value;
  return "OTHER";
}

function architecture(value: string): BenchmarkOperatorDeclaration["architecture"] {
  if (value === "ARM64" || value === "X86_64" || value === "UNAVAILABLE") return value;
  return "OTHER";
}

function deviceClass(value: string): BenchmarkOperatorDeclaration["deviceClass"] {
  if (value === "PRIMARY_REFERENCE" || value === "LOWER_CAPABILITY") return value;
  return "OTHER_DECLARED";
}

function powerMode(value: string): BenchmarkOperatorDeclaration["powerMode"] {
  if (value === "AC_POWER" || value === "BATTERY") return value;
  return "UNKNOWN";
}

function lowPowerState(value: string): BenchmarkOperatorDeclaration["lowPowerState"] {
  if (value === "ON" || value === "OFF") return value;
  return "UNKNOWN";
}

function s2BrowserProduct(value: string): ControlPointTessellationBrowserProduct {
  if (value === "EDGE" || value === "OPERA" || value === "CHROMIUM") return value;
  return "CHROME";
}

function downloadResult(result: RendererBenchmarkResult): void {
  const blob = new Blob([serializeRendererBenchmarkResult(result)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = rendererBenchmarkResultFilename(result);
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadPointSensitivityResult(result: PointSensitivityResult): void {
  const blob = new Blob([serializePointSensitivityResult(result)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = pointSensitivityResultFilename(result);
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadControlPointTessellationResult(
  result: ControlPointTessellationResult,
): void {
  const blob = new Blob([serializeControlPointTessellationResult(result)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = controlPointTessellationResultFilename(result);
  anchor.click();
  URL.revokeObjectURL(url);
}

function ControlPointTessellationResultPanel({
  result,
}: {
  readonly result: ControlPointTessellationResult | null;
}) {
  if (result === null) return null;
  return (
    <section className="rounded-2xl border border-cyan-200 bg-white p-5">
      <h2 className="font-semibold text-slate-950">S2 Result v1</h2>
      <p className="mt-1 text-sm text-slate-600">
        {result.outcome} · {result.stopReason} ·
        {result.analysis.disposition ?? "NO DISPOSITION"}
      </p>
      <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        {result.cells.map((cell) => (
          <li
            key={`${cell.strandCount}-${cell.pointsPerStrand}-${cell.tubularSegmentsPerStrand}`}
            className="rounded-lg bg-cyan-50 px-3 py-2"
          >
            {cell.strandCount}×P{cell.pointsPerStrand}×T
            {cell.tubularSegmentsPerStrand} · requested AUTO · actual
            {cell.actualBackend ?? "UNAVAILABLE"} · {cell.cellOutcome}
          </li>
        ))}
      </ul>
    </section>
  );
}

type PageBenchmarkFamily =
  | "PARENT"
  | "POINT_SENSITIVITY"
  | "CONTROL_POINT_TESSELLATION";

interface PageBenchmarkRunOwner {
  readonly family: PageBenchmarkFamily;
  readonly controller: AbortController;
}

interface PageBenchmarkRunCallbacks<Result> {
  readonly onStart: () => void;
  readonly onSuccess: (result: Result) => void;
  readonly onError: (error: unknown) => void;
}

/** @internal Owns benchmark exclusion for one mounted render-lab page. */
export function createRenderPerformanceLabCoordinator(
  onRunningChange: (running: boolean) => void,
) {
  let mounted = true;
  let active: PageBenchmarkRunOwner | null = null;

  const owns = (owner: PageBenchmarkRunOwner): boolean =>
    mounted && active === owner;

  async function settle<Result>(
    owner: PageBenchmarkRunOwner,
    execute: (signal: AbortSignal) => Promise<Result>,
    callbacks: PageBenchmarkRunCallbacks<Result>,
  ): Promise<void> {
    try {
      const nextResult = await execute(owner.controller.signal);
      if (owns(owner)) callbacks.onSuccess(nextResult);
    } catch (runError) {
      if (owns(owner)) callbacks.onError(runError);
    } finally {
      if (active === owner) {
        active = null;
        if (mounted) onRunningChange(false);
      }
    }
  }

  return {
    mount(): void {
      mounted = true;
    },
    start<Result>(
      family: PageBenchmarkFamily,
      execute: (signal: AbortSignal) => Promise<Result>,
      callbacks: PageBenchmarkRunCallbacks<Result>,
    ): boolean {
      if (!mounted || active !== null) return false;
      const owner: PageBenchmarkRunOwner = {
        family,
        controller: new AbortController(),
      };
      active = owner;
      onRunningChange(true);
      callbacks.onStart();
      void settle(owner, execute, callbacks);
      return true;
    },
    cancel(reason: "CANCELLED_BY_OPERATOR" | "ROUTE_EXIT"): void {
      active?.controller.abort(reason);
    },
    dispose(): void {
      if (!mounted) return;
      mounted = false;
      const owner = active;
      active = null;
      owner?.controller.abort("ROUTE_EXIT");
    },
  };
}

export function RenderPerformanceLab() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [operator, setOperator] = useState(DEFAULT_OPERATOR);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RendererBenchmarkResult | null>(null);
  const [pointSensitivityResult, setPointSensitivityResult] =
    useState<PointSensitivityResult | null>(null);
  const [s2Operator, setS2Operator] = useState(DEFAULT_S2_OPERATOR);
  const [controlPointTessellationResult, setControlPointTessellationResult] =
    useState<ControlPointTessellationResult | null>(null);
  const [s2Progress, setS2Progress] = useState<ControlPointTessellationProgress>({
    completedCells: 0,
    totalCells: 8,
    currentCell: null,
  });
  const [detectedBrowser, setDetectedBrowser] = useState<string>("Not detected yet");
  const [error, setError] = useState<string | null>(null);
  const coordinatorRef = useRef<ReturnType<
    typeof createRenderPerformanceLabCoordinator
  > | null>(null);
  if (coordinatorRef.current === null) {
    coordinatorRef.current = createRenderPerformanceLabCoordinator(setRunning);
  }
  const coordinator = coordinatorRef.current;

  useEffect(() => {
    coordinator.mount();
    setDetectedBrowser(detectedBrowserLabel());
    return () => coordinator.dispose();
  }, [coordinator]);

  const update = <K extends keyof BenchmarkOperatorDeclaration>(
    key: K,
    value: BenchmarkOperatorDeclaration[K],
  ): void => setOperator((current) => ({ ...current, [key]: value }));

  function run(runKind: BenchmarkRunKind): void {
    const root = rootRef.current;
    if (root === null) return;
    coordinator.start("PARENT", (signal) => executeRendererBenchmark({
        runKind,
        operator,
        seed: RENDERER_BENCHMARK_SEED,
      }, {
        root,
        signal,
        readProvenance: startBenchmarkProvenance,
      }), {
      onStart: () => {
        setError(null);
        setResult(null);
      },
      onSuccess: setResult,
      onError: (runError) => setError(errorMessage(runError)),
    });
  }

  function runPointSensitivity(): void {
    const root = rootRef.current;
    if (root === null) return;
    coordinator.start("POINT_SENSITIVITY", (signal) => executePointSensitivityBenchmark({
        operator,
        seed: POINT_SENSITIVITY_SEED,
      }, {
        root,
        signal,
        readProvenance: startPointSensitivityProvenance,
      }), {
      onStart: () => {
        setError(null);
        setPointSensitivityResult(null);
      },
      onSuccess: setPointSensitivityResult,
      onError: (runError) => setError(errorMessage(runError)),
    });
  }

  function runControlPointTessellation(): void {
    const root = rootRef.current;
    if (root === null) return;
    coordinator.start(
      "CONTROL_POINT_TESSELLATION",
      (signal) => executeControlPointTessellationBenchmark({
        operator: s2Operator,
        seed: CONTROL_POINT_TESSELLATION_SEED,
      }, {
        root,
        signal,
        readProvenance: startControlPointTessellationProvenance,
        onProgress: setS2Progress,
      }),
      {
        onStart: () => {
          setError(null);
          setControlPointTessellationResult(null);
          setS2Progress({ completedCells: 0, totalCells: 8, currentCell: null });
        },
        onSuccess: setControlPointTessellationResult,
        onError: (runError) => setError(errorMessage(runError)),
      },
    );
  }

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex flex-wrap gap-2">
          {DISCLOSURES.map((disclosure) => (
            <span
              key={disclosure}
              className="rounded-full border border-amber-400 bg-white px-3 py-1 font-mono text-xs font-bold text-amber-950"
            >
              {disclosure}
            </span>
          ))}
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-950">
          R2C-A v0.3 렌더러 탐색 특성화
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950">
          로컬 브라우저의 합성 6-point strand 렌더링 단계만 관찰합니다. 결과는 로컬
          JSON으로만 내려받을 수 있으며 제품·피팅·제작 판단에 사용할 수 없습니다.
        </p>
      </header>

      <fieldset
        disabled={running}
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <legend className="px-2 text-sm font-semibold text-slate-900">운영자 환경 선언</legend>
        <label className="text-sm text-slate-700">
          browser engine
          <select
            value={operator.browserEngine}
            onChange={(event) => update("browserEngine", event.target.value === "WEBKIT" ? "WEBKIT" : "CHROMIUM_FAMILY")}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value="CHROMIUM_FAMILY">Chromium family</option>
            <option value="WEBKIT">WebKit</option>
          </select>
        </label>
        <label className="text-sm text-slate-700">
          browser major
          <input
            type="number"
            min={0}
            step={1}
            value={operator.browserMajor}
            onChange={(event) => update("browserMajor", Number(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm text-slate-700">
          OS family
          <select
            value={operator.osFamily}
            onChange={(event) => update("osFamily", osFamily(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {(["MACOS", "IOS", "WINDOWS", "LINUX", "ANDROID", "OTHER"] as const).map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          architecture
          <select
            value={operator.architecture}
            onChange={(event) => update("architecture", architecture(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {(["ARM64", "X86_64", "OTHER", "UNAVAILABLE"] as const).map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          device class
          <select
            value={operator.deviceClass}
            onChange={(event) => update("deviceClass", deviceClass(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {(["PRIMARY_REFERENCE", "LOWER_CAPABILITY", "OTHER_DECLARED"] as const).map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          power mode
          <select
            value={operator.powerMode}
            onChange={(event) => update("powerMode", powerMode(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {(["AC_POWER", "BATTERY", "UNKNOWN"] as const).map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-sm text-slate-700">
          low-power state
          <select
            value={operator.lowPowerState}
            onChange={(event) => update("lowPowerState", lowPowerState(event.target.value))}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            {(["ON", "OFF", "UNKNOWN"] as const).map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void run("CHARACTERIZATION")}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Start Characterization
        </button>
        <button
          type="button"
          disabled={running}
          onClick={() => void run("VERIFICATION_SMOKE")}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Run Verification Smoke
        </button>
        <button
          type="button"
          disabled={!running}
          onClick={() => coordinator.cancel("CANCELLED_BY_OPERATOR")}
          className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={result === null || running}
          onClick={() => { if (result !== null) downloadResult(result); }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50"
        >
          Download JSON
        </button>
      </div>

      <section className="rounded-2xl border border-violet-300 bg-violet-50 p-5">
        <h2 className="font-semibold text-violet-950">
          R2C-A-S1 point/tessellation sensitivity
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-950">
          BENCHMARK_ONLY performance perturbation only. P3/P8은 visual fidelity
          evidence나 product truth가 아니며 production budget 또는 후보 시각 설정을
          뜻하지 않습니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={running}
            onClick={() => void runPointSensitivity()}
            className="rounded-lg bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Start R2C-A-S1
          </button>
          <button
            type="button"
            disabled={pointSensitivityResult === null || running}
            onClick={() => {
              if (pointSensitivityResult !== null) {
                downloadPointSensitivityResult(pointSensitivityResult);
              }
            }}
            className="rounded-lg border border-violet-400 px-4 py-2 text-sm font-semibold text-violet-900 disabled:opacity-50"
          >
            Download S1 JSON
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-300 bg-cyan-50 p-5">
        <h2 className="font-semibold text-cyan-950">
          R2C-A-S2 Control-Point × Longitudinal-Tessellation Decoupling
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-cyan-950">
          BENCHMARK_ONLY / non-production authority. 고정 8셀(P3/P8 × T6/T21 ×
          576/1152), 셀당 1 warm-up + 5 measured만 실행합니다. 제품 설정, 시각 품질,
          R2C-B 또는 production remedy를 활성화하지 않습니다.
        </p>
        <p className="mt-2 text-sm text-cyan-900">
          Detected actual browser evidence (informational until Start): {detectedBrowser}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-cyan-950">
            declared browser product
            <select
              disabled={running}
              value={s2Operator.declaredBrowserProduct}
              onChange={(event) => setS2Operator((current) => ({
                ...current,
                declaredBrowserProduct: s2BrowserProduct(event.target.value),
              }))}
              className="mt-1 w-full rounded-lg border border-cyan-300 px-3 py-2"
            >
              {(["CHROME", "EDGE", "OPERA", "CHROMIUM"] as const).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-cyan-950">
            declared browser major
            <input
              disabled={running}
              type="number"
              min={1}
              step={1}
              value={s2Operator.declaredBrowserMajor}
              onChange={(event) => setS2Operator((current) => ({
                ...current,
                declaredBrowserMajor: Number(event.target.value),
              }))}
              className="mt-1 w-full rounded-lg border border-cyan-300 px-3 py-2"
            />
          </label>
        </div>
        <p className="mt-3 font-mono text-xs text-cyan-950">
          Fixed order: 576×P3×T6 → 1152×P8×T21 → 1152×P3×T21 →
          576×P8×T6 → 1152×P8×T6 → 576×P3×T21 → 576×P8×T21 → 1152×P3×T6
        </p>
        <p className="mt-2 text-sm text-cyan-900" aria-live="polite">
          Immutable progress: {s2Progress.completedCells}/8 cells complete
          {s2Progress.currentCell === null ? "" :
            ` · current ${s2Progress.currentCell.strandCount}×P${s2Progress.currentCell.pointsPerStrand}×T${s2Progress.currentCell.tubularSegments}`}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={running}
            onClick={() => void runControlPointTessellation()}
            className="rounded-lg bg-cyan-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Start R2C-A-S2
          </button>
          <button
            type="button"
            disabled={controlPointTessellationResult === null || running}
            onClick={() => {
              if (controlPointTessellationResult !== null) {
                downloadControlPointTessellationResult(controlPointTessellationResult);
              }
            }}
            className="rounded-lg border border-cyan-400 px-4 py-2 text-sm font-semibold text-cyan-950 disabled:opacity-50"
          >
            Download S2 JSON
          </button>
        </div>
      </section>

      {error !== null ? (
        <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-300 bg-slate-950 p-3">
        <div
          ref={rootRef}
          aria-label="R2C-A benchmark renderer host"
          className="relative overflow-hidden bg-slate-900"
          style={{ width: 800, height: 600 }}
        />
      </div>

      {result !== null ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-950">Result v2</h2>
          <p className="mt-1 text-sm text-slate-600">
            {result.outcome} · {result.stopReason}
          </p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {result.cells.map((cell) => (
              <li key={`${cell.strandCount}-${cell.requestedBackend}`} className="rounded-lg bg-slate-100 px-3 py-2">
                {cell.strandCount}×6 · requested {cell.requestedBackend} · actual {cell.actualBackend ?? "UNAVAILABLE"} · {cell.cellOutcome}
              </li>
            ))}
          </ul>
        </section>
      ) : null}


      {pointSensitivityResult !== null ? (
        <section className="rounded-2xl border border-violet-200 bg-white p-5">
          <h2 className="font-semibold text-slate-950">S1 Result v1</h2>
          <p className="mt-1 text-sm text-slate-600">
            {pointSensitivityResult.outcome} · {pointSensitivityResult.stopReason}
          </p>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {pointSensitivityResult.cells.map((cell) => (
              <li key={`${cell.strandCount}-${cell.pointsPerStrand}`} className="rounded-lg bg-violet-50 px-3 py-2">
                {cell.strandCount}×P{cell.pointsPerStrand} · requested AUTO · actual {cell.actualBackend ?? "UNAVAILABLE"} · {cell.cellOutcome}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ControlPointTessellationResultPanel result={controlPointTessellationResult} />
    </section>
  );
}
