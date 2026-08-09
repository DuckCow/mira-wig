import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  assembleRendererBenchmarkGeometry,
  createRendererFailureGate,
  enforceRendererBenchmarkBackendRequest,
} from "../renderer-backend";

interface GeometryProbe {
  readonly id: string;
}

function benchmarkFirstSubmitFailure(onFailure: (error: Error) => void): void {
  const gate = createRendererFailureGate(onFailure);
  gate.renderInitially(() => {
    gate.reportFailure(new Error("device lost during first submit"));
    return { backend: "WEBGPU", visibleStrandCount: 72, frameDurationMs: 0 };
  });
  gate.throwIfFailed();
}

function geometryHarness(events: string[]) {
  let authoritative: GeometryProbe = { id: "previous" };
  const previous = authoritative;
  const disposed: string[] = [];
  return {
    previous,
    disposed,
    authoritative: () => authoritative,
    assembly: {
      createSource: (strand: string): GeometryProbe => ({ id: `source:${strand}` }),
      mergeSources: (sources: readonly GeometryProbe[]): GeometryProbe => ({
        id: `merged:${sources.length}`,
      }),
      validateMerged: vi.fn(),
      commitMerged: (merged: GeometryProbe) => {
        events.push("commit");
        authoritative = merged;
      },
      disposePrevious: () => {
        events.push("dispose:previous");
        disposed.push(previous.id);
      },
      disposeGeometry: (geometry: GeometryProbe) => {
        events.push(`dispose:${geometry.id}`);
        disposed.push(geometry.id);
      },
      measureCreate: (work: () => void) => {
        events.push("stage:create");
        work();
      },
      measureMerge: (work: () => void) => {
        events.push("stage:merge");
        work();
      },
      measureFinalize: (work: () => void) => {
        events.push("stage:finalize");
        work();
      },
    },
  };
}

describe("benchmark renderer aggregate geometry transaction", () => {
  it("keeps creation, merge, and finalization ownership truthful", () => {
    const events: string[] = [];
    const harness = geometryHarness(events);
    const merged = assembleRendererBenchmarkGeometry(["a", "b"], harness.assembly);

    expect(merged).toEqual({ id: "merged:2" });
    expect(harness.authoritative()).toBe(merged);
    expect(events).toEqual([
      "stage:create",
      "stage:merge",
      "stage:finalize",
      "dispose:source:a",
      "dispose:source:b",
      "commit",
      "dispose:previous",
    ]);
  });

  it("rolls back a pre-commit validation failure and leaves prior authority unchanged", () => {
    const events: string[] = [];
    const harness = geometryHarness(events);
    harness.assembly.validateMerged.mockImplementation(() => {
      throw new Error("invalid merged candidate");
    });

    expect(() => assembleRendererBenchmarkGeometry(["a"], harness.assembly)).toThrow(
      "invalid merged candidate",
    );
    expect(harness.authoritative()).toBe(harness.previous);
    expect(harness.disposed).toEqual(["source:a", "merged:1"]);
    expect(events).not.toContain("commit");
    expect(events).not.toContain("dispose:previous");
  });

  it("leaves a committed replacement for terminal teardown after post-commit failure", () => {
    const events: string[] = [];
    const harness = geometryHarness(events);
    harness.assembly.disposePrevious = () => {
      events.push("dispose:previous");
      throw new Error("previous disposal failed");
    };

    expect(() => assembleRendererBenchmarkGeometry(["a"], harness.assembly)).toThrow(
      "previous disposal failed",
    );
    expect(harness.authoritative()).toEqual({ id: "merged:1" });
    expect(harness.disposed).toEqual(["source:a"]);
  });
});

describe("benchmark renderer pre-geometry guard", () => {
  const webglObservation = {
    actualBackend: "WEBGL2" as const,
    drawingBufferWidth: 1600,
    drawingBufferHeight: 1200,
    rendererPixelRatio: 2,
  };

  it("rejects forced mismatch and AUTO drift", () => {
    expect(() => enforceRendererBenchmarkBackendRequest("WEBGL2", {
      ...webglObservation,
      actualBackend: "WEBGPU",
    }, null)).toThrow("FORCED_BACKEND_MISMATCH");
    expect(() => enforceRendererBenchmarkBackendRequest("AUTO", webglObservation, "WEBGPU"))
      .toThrow("AUTO_BACKEND_DRIFT");
    expect(enforceRendererBenchmarkBackendRequest("AUTO", webglObservation, null)).toBe("WEBGL2");
  });

  it("places the guard after renderer init observation and before selection or geometry", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/rendering/renderer-backend.ts"),
      "utf8",
    );
    const benchmarkStart = source.indexOf("async initializeBenchmark(");
    const benchmarkEnd = source.indexOf("updateVisualState(", benchmarkStart);
    const body = source.slice(benchmarkStart, benchmarkEnd);

    expect(body.indexOf('measureAwaited("RENDERER_INIT"')).toBeGreaterThan(-1);
    expect(body.indexOf("const observation = this.benchmarkObservation()"))
      .toBeGreaterThan(body.indexOf('measureAwaited("RENDERER_INIT"'));
    expect(body.indexOf("preGeometryGuard(observation)"))
      .toBeGreaterThan(body.indexOf("const observation = this.benchmarkObservation()"));
    expect(body.indexOf('measureSynchronous("GEOMETRY_SELECT"'))
      .toBeGreaterThan(body.indexOf("preGeometryGuard(observation)"));
    expect(body.indexOf("createBenchmarkTubeGeometry"))
      .toBeGreaterThan(body.indexOf("preGeometryGuard(observation)"));
  });
});

describe("benchmark first-submit failure evidence", () => {
  it("rejects a synchronous renderer-reported failure before benchmark init succeeds", () => {
    const reported: Error[] = [];
    const recordFailure = (error: Error): void => { reported.push(error); };

    expect(() => benchmarkFirstSubmitFailure(recordFailure))
      .toThrow("device lost during first submit");
    expect(reported.map((error) => error.message)).toEqual([
      "device lost during first submit",
    ]);
  });

  it("re-checks the failure gate after the owned benchmark render submission", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/rendering/renderer-backend.ts"),
      "utf8",
    );
    const benchmarkStart = source.indexOf("async initializeBenchmark(");
    const benchmarkEnd = source.indexOf("updateVisualState(", benchmarkStart);
    const body = source.slice(benchmarkStart, benchmarkEnd);
    const submit = body.indexOf('measureSynchronous("RENDER_SUBMIT"');
    const postSubmitCheck = body.indexOf("this.failureGate.throwIfFailed()", submit);

    expect(submit).toBeGreaterThan(-1);
    expect(postSubmitCheck).toBeGreaterThan(submit);
  });
});
