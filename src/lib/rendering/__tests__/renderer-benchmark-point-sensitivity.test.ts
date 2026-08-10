import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rendererProbe = vi.hoisted(() => {
  interface CurveCall {
    readonly pointCount: number;
    readonly closed: boolean;
    readonly curveType: string;
  }
  interface TubeCall {
    readonly tubularSegments: number;
    readonly radius: number;
    readonly radialSegments: number;
    readonly closed: boolean;
  }
  class Geometry {
    disposed = false;

    constructor(readonly kind = "buffer") {}

    getAttribute(name: string): object | undefined {
      return name === "position" ? {} : undefined;
    }

    dispose(): void {
      this.disposed = true;
    }
  }
  const curveCalls: CurveCall[] = [];
  const tubeCalls: TubeCall[] = [];
  const mergeCalls: string[][] = [];
  return {
    Geometry,
    curveCalls,
    tubeCalls,
    mergeCalls,
  };
});

vi.mock("three/webgpu", () => {
  class Vector3 {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly z: number,
    ) {}
  }

  class CatmullRomCurve3 {
    constructor(
      readonly points: readonly Vector3[],
      readonly closed: boolean,
      readonly curveType: string,
    ) {
      rendererProbe.curveCalls.push({
        pointCount: points.length,
        closed,
        curveType,
      });
    }
  }

  class TubeGeometry extends rendererProbe.Geometry {
    constructor(
      readonly path: CatmullRomCurve3,
      tubularSegments: number,
      radius: number,
      radialSegments: number,
      closed: boolean,
    ) {
      super("tube");
      rendererProbe.tubeCalls.push({
        tubularSegments,
        radius,
        radialSegments,
        closed,
      });
    }
  }

  class Color {
    set(_value: string): void { return; }
  }

  class Material {
    readonly color = new Color();

    dispose(): void { return; }
  }

  class Scene {
    add(..._objects: readonly object[]): void { return; }
    clear(): void { return; }
  }

  class PerspectiveCamera {
    aspect = 1;
    readonly position = { set: (_x: number, _y: number, _z: number) => undefined };

    updateProjectionMatrix(): void { return; }
    lookAt(_x: number, _y: number, _z: number): void { return; }
  }

  class Group {
    readonly rotation = { set: (_x: number, _y: number, _z: number) => undefined };

    add(..._objects: readonly object[]): void { return; }
  }

  class Mesh {
    readonly scale = { z: 1 };

    constructor(
      public geometry: InstanceType<typeof rendererProbe.Geometry>,
      readonly material: Material,
    ) {}
  }

  class Light {
    readonly position = { set: (_x: number, _y: number, _z: number) => undefined };
  }

  const WebGPUCoordinateSystem = Symbol("WebGPUCoordinateSystem");

  class WebGPURenderer {
    coordinateSystem = WebGPUCoordinateSystem;
    onError: ((error: unknown) => void) | null = null;
    onDeviceLost: ((error: unknown) => void) | null = null;
    readonly domElement = {
      width: 0,
      height: 0,
      style: { display: "", width: "", height: "" },
      setAttribute: (_name: string, _value: string) => undefined,
      remove: () => undefined,
    };
    private pixelRatio = 1;

    setClearColor(_color: number, _alpha: number): void { return; }
    setPixelRatio(value: number): void { this.pixelRatio = value; }
    getPixelRatio(): number { return this.pixelRatio; }
    setSize(width: number, height: number): void {
      this.domElement.width = width * this.pixelRatio;
      this.domElement.height = height * this.pixelRatio;
    }
    init(): Promise<void> { return Promise.resolve(); }
    render(_scene: Scene, _camera: PerspectiveCamera): void { return; }
    dispose(): void { return; }
  }

  return {
    BufferGeometry: rendererProbe.Geometry,
    CatmullRomCurve3,
    DirectionalLight: Light,
    DoubleSide: "DoubleSide",
    Group,
    HemisphereLight: Light,
    Mesh,
    MeshStandardNodeMaterial: Material,
    PerspectiveCamera,
    Scene,
    SphereGeometry: rendererProbe.Geometry,
    TubeGeometry,
    Vector3,
    WebGPUCoordinateSystem,
    WebGPURenderer,
  };
});

vi.mock("three/addons/utils/BufferGeometryUtils.js", () => ({
  mergeGeometries: (
    sources: readonly InstanceType<typeof rendererProbe.Geometry>[],
  ) => {
    rendererProbe.mergeCalls.push(sources.map((source) => source.kind));
    return new rendererProbe.Geometry("merged");
  },
}));

import type { BenchmarkAggregateStageObserver } from "../benchmark-measurement";
import {
  RENDERER_BENCHMARK_TUBE_RADIAL_SEGMENTS,
  RENDERER_BENCHMARK_TUBE_SEGMENTS_PER_CONTROL_SPAN,
  createRendererBenchmarkBackend,
  rendererBenchmarkTubularSegments,
  type RendererBenchmarkGeometryInput,
} from "../renderer-backend";
import type { VisualState } from "../visual-state";

const FIXED_VISUAL_STATE: VisualState = {
  previewColor: "#34251F",
  visualDensityTier: "HIGH",
  viewRotation: { yaw: 0, pitch: 0 },
};

function input(pointCount: number): RendererBenchmarkGeometryInput {
  const controlPoints: [number, number, number][] = Array.from(
    { length: pointCount },
    (_, index) => [index / 10, index / 20, 0],
  );
  return {
    strandCount: 1,
    strands: [{ controlPoints, width: 0.028, densityRank: 0 }],
  };
}

function observer(stages: string[]): BenchmarkAggregateStageObserver {
  return {
    measureSynchronous(stage, task) {
      stages.push(stage);
      return task();
    },
    async measureAwaited(stage, task) {
      stages.push(stage);
      return task();
    },
  };
}

function container(): HTMLElement {
  return document.createElement("div");
}

describe("renderer S1 geometry policy", () => {
  beforeEach(() => {
    rendererProbe.curveCalls.length = 0;
    rendererProbe.tubeCalls.length = 0;
    rendererProbe.mergeCalls.length = 0;
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    vi.stubGlobal("document", {
      createElement: () => ({
        clientWidth: 800,
        clientHeight: 600,
        appendChild: (node: object) => node,
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains the exact coupled longitudinal and radial segment policy", () => {
    expect(RENDERER_BENCHMARK_TUBE_SEGMENTS_PER_CONTROL_SPAN).toBe(3);
    expect(RENDERER_BENCHMARK_TUBE_RADIAL_SEGMENTS).toBe(4);
    expect(rendererBenchmarkTubularSegments(3)).toBe(6);
    expect(rendererBenchmarkTubularSegments(6)).toBe(15);
    expect(rendererBenchmarkTubularSegments(8)).toBe(21);
    expect(() => rendererBenchmarkTubularSegments(1)).toThrow(/two control points/);
  });

  it.each([
    { points: 3, tubularSegments: 6 },
    { points: 6, tubularSegments: 15 },
    { points: 8, tubularSegments: 21 },
  ])("constructs and merges the production P$points geometry regime", async ({
    points,
    tubularSegments,
  }) => {
    const stages: string[] = [];
    const stageObserver = observer(stages);
    const backend = createRendererBenchmarkBackend(
      container(),
      { forceWebGL: false },
      { onDiagnostics: () => undefined, onFailure: () => undefined },
    );

    await backend.initialize(
      input(points),
      FIXED_VISUAL_STATE,
      stageObserver,
      () => undefined,
    );

    expect(rendererProbe.curveCalls).toEqual([{
      pointCount: points,
      closed: false,
      curveType: "centripetal",
    }]);
    expect(rendererProbe.tubeCalls).toEqual([{
      tubularSegments,
      radius: 0.014,
      radialSegments: 4,
      closed: false,
    }]);
    expect(rendererProbe.mergeCalls).toEqual([["tube"]]);
    expect(stages).toEqual([
      "SCENE_SETUP",
      "RENDERER_INIT",
      "GEOMETRY_SELECT",
      "GEOMETRY_CREATE",
      "GEOMETRY_MERGE",
      "GEOMETRY_FINALIZE",
      "RENDER_SUBMIT",
    ]);

    backend.dispose(stageObserver);
    expect(stages.at(-1)).toBe("DISPOSE");
  });
});
