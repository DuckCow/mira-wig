import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const probe = vi.hoisted(() => {
  class Geometry {
    constructor(readonly kind = "buffer") {}
    getAttribute(name: string): object | undefined { return name === "position" ? {} : undefined; }
    dispose(): void {}
  }
  return {
    Geometry,
    curveCalls: new Array<{ pointCount: number; closed: boolean; curveType: string }>(),
    tubeCalls: new Array<{ tubularSegments: number; radialSegments: number; closed: boolean }>(),
  };
});

vi.mock("three/webgpu", () => {
  class Vector3 { constructor(readonly x: number, readonly y: number, readonly z: number) {} }
  class CatmullRomCurve3 {
    constructor(readonly points: readonly Vector3[], readonly closed: boolean, readonly curveType: string) {
      probe.curveCalls.push({ pointCount: points.length, closed, curveType });
    }
  }
  class TubeGeometry extends probe.Geometry {
    constructor(
      _path: CatmullRomCurve3,
      tubularSegments: number,
      _radius: number,
      radialSegments: number,
      closed: boolean,
    ) {
      super("tube");
      probe.tubeCalls.push({ tubularSegments, radialSegments, closed });
    }
  }
  class Color { set(): void {} }
  class Material { readonly color = new Color(); dispose(): void {} }
  class Scene { add(): void {} clear(): void {} }
  class PerspectiveCamera {
    aspect = 1;
    readonly position = { set: () => undefined };
    updateProjectionMatrix(): void {}
    lookAt(): void {}
  }
  class Group { readonly rotation = { set: () => undefined }; add(): void {} }
  class Mesh {
    readonly scale = { z: 1 };
    constructor(public geometry: InstanceType<typeof probe.Geometry>, readonly material: Material) {}
  }
  class Light { readonly position = { set: () => undefined }; }
  const WebGPUCoordinateSystem = Symbol("WebGPUCoordinateSystem");
  class WebGPURenderer {
    coordinateSystem = WebGPUCoordinateSystem;
    onError: ((error: unknown) => void) | null = null;
    onDeviceLost: ((error: unknown) => void) | null = null;
    readonly domElement = {
      width: 0, height: 0, style: { display: "", width: "", height: "" },
      setAttribute: () => undefined, remove: () => undefined,
    };
    private pixelRatio = 1;
    setClearColor(): void {}
    setPixelRatio(value: number): void { this.pixelRatio = value; }
    getPixelRatio(): number { return this.pixelRatio; }
    setSize(width: number, height: number): void {
      this.domElement.width = width * this.pixelRatio;
      this.domElement.height = height * this.pixelRatio;
    }
    init(): Promise<void> { return Promise.resolve(); }
    render(): void {}
    dispose(): void {}
  }
  return {
    BufferGeometry: probe.Geometry,
    CatmullRomCurve3,
    DirectionalLight: Light,
    DoubleSide: "DoubleSide",
    Group,
    HemisphereLight: Light,
    Mesh,
    MeshStandardNodeMaterial: Material,
    PerspectiveCamera,
    Scene,
    SphereGeometry: probe.Geometry,
    TubeGeometry,
    Vector3,
    WebGPUCoordinateSystem,
    WebGPURenderer,
  };
});

vi.mock("three/addons/utils/BufferGeometryUtils.js", () => ({
  mergeGeometries: () => new probe.Geometry("merged"),
}));

import type { BenchmarkAggregateStageObserver } from "../benchmark-measurement";
import {
  createRendererBackend,
  createRendererBenchmarkBackend,
  type RendererBenchmarkGeometryInput,
} from "../renderer-backend";
import type { StrandAsset } from "../strand-asset";
import type { VisualState } from "../visual-state";

const visual: VisualState = {
  previewColor: "#34251F",
  visualDensityTier: "HIGH",
  viewRotation: { yaw: 0, pitch: 0 },
};

function points(count: number): [number, number, number][] {
  return Array.from({ length: count }, (_, index) => [index / 10, index / 20, 0]);
}

function input(pointCount: number, tubularSegments?: number): RendererBenchmarkGeometryInput {
  return {
    strandCount: 1,
    ...(tubularSegments === undefined ? {} : { tubularSegments }),
    strands: [{ controlPoints: points(pointCount), width: 0.028, densityRank: 0 }],
  };
}

const stageObserver: BenchmarkAggregateStageObserver = {
  measureSynchronous: (_stage, task) => task(),
  measureAwaited: (_stage, task) => task(),
};

function container(): HTMLElement { return document.createElement("div"); }

describe("renderer S2 benchmark-only tessellation override", () => {
  beforeEach(() => {
    probe.curveCalls.length = 0;
    probe.tubeCalls.length = 0;
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
      callback();
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("document", {
      createElement: () => ({ clientWidth: 800, clientHeight: 600, appendChild: () => undefined }),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [3, 6], [3, 21], [8, 6], [8, 21],
  ])("sends P%i/T%i to the real benchmark TubeGeometry constructor", async (pointCount, tubularSegments) => {
    const backend = createRendererBenchmarkBackend(
      container(),
      { forceWebGL: false },
      { onDiagnostics: () => undefined, onFailure: () => undefined },
    );
    await backend.initialize(input(pointCount, tubularSegments), visual, stageObserver, () => undefined);
    expect(probe.curveCalls).toEqual([{ pointCount, closed: false, curveType: "centripetal" }]);
    expect(probe.tubeCalls).toEqual([{ tubularSegments, radialSegments: 4, closed: false }]);
  });

  it.each([[3, 6], [6, 15], [8, 21]])(
    "retains absent-field P%i to T%i derivation",
    async (pointCount, tubularSegments) => {
      const backend = createRendererBenchmarkBackend(
        container(),
        { forceWebGL: false },
        { onDiagnostics: () => undefined, onFailure: () => undefined },
      );
      await backend.initialize(input(pointCount), visual, stageObserver, () => undefined);
      expect(probe.tubeCalls[0].tubularSegments).toBe(tubularSegments);
    },
  );

  it("rejects an invalid explicit value before TubeGeometry construction", async () => {
    const backend = createRendererBenchmarkBackend(
      container(),
      { forceWebGL: false },
      { onDiagnostics: () => undefined, onFailure: () => undefined },
    );
    await expect(backend.initialize(input(3, 0), visual, stageObserver, () => undefined))
      .rejects.toThrow(/positive safe integer/);
    expect(probe.tubeCalls).toEqual([]);
  });

  it("does not let the normal renderer observe a stray benchmark override", async () => {
    const asset: StrandAsset & { readonly tubularSegments: number } = {
      schema: "mira.render-lab.strand-asset",
      version: 1,
      tubularSegments: 21,
      coordinateSystem: { handedness: "RIGHT_HANDED", upAxis: "Y", unit: "SCENE_UNIT" },
      defaultWidth: 0.028,
      strands: [{
        id: "normal",
        controlPoints: points(3),
        width: 0.028,
        densityRank: 0,
        importanceRank: 0,
        materialGroup: "PREVIEW",
      }],
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    };
    const backend = createRendererBackend(
      container(),
      { forceWebGL: false },
      { onDiagnostics: () => undefined, onFailure: () => undefined },
    );
    await backend.initialize(asset, visual);
    expect(probe.tubeCalls[0].tubularSegments).toBe(6);
  });
});
