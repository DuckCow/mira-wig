"use client";

import { useEffect, useRef, useState } from "react";
import { startBenchmarkProvenance } from "@/app/admin/render-lab/performance/actions";
import { RENDERER_BENCHMARK_SEED } from "@/lib/rendering/benchmark-input";
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

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "특성화 실행에 실패했습니다.";
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

export function RenderPerformanceLab() {
  const rootRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [operator, setOperator] = useState(DEFAULT_OPERATOR);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RendererBenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    controllerRef.current?.abort("ROUTE_EXIT");
    controllerRef.current = null;
  }, []);

  const update = <K extends keyof BenchmarkOperatorDeclaration>(
    key: K,
    value: BenchmarkOperatorDeclaration[K],
  ): void => setOperator((current) => ({ ...current, [key]: value }));

  async function run(runKind: BenchmarkRunKind): Promise<void> {
    const root = rootRef.current;
    if (root === null || running) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const nextResult = await executeRendererBenchmark({
        runKind,
        operator,
        seed: RENDERER_BENCHMARK_SEED,
      }, {
        root,
        signal: controller.signal,
        readProvenance: startBenchmarkProvenance,
      });
      setResult(nextResult);
    } catch (runError) {
      setError(errorMessage(runError));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setRunning(false);
    }
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
          onClick={() => controllerRef.current?.abort("CANCELLED_BY_OPERATOR")}
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
    </section>
  );
}
