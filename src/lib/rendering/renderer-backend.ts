import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { StrandAsset, StrandRecord } from "./strand-asset";
import {
  canonicalizeVisualState,
  selectStrandsForTier,
  type VisualDensityTier,
  type VisualState,
} from "./visual-state";

const MAX_DEVICE_PIXEL_RATIO = 2;
const MIN_VIEWPORT_SIZE = 1;
const TUBE_SEGMENTS_PER_CONTROL_SPAN = 3;
const TUBE_RADIAL_SEGMENTS = 4;

export type RendererBackendKind = "WEBGPU" | "WEBGL2";

export interface RendererDiagnostics {
  readonly backend: RendererBackendKind;
  readonly visibleStrandCount: number;
  readonly frameDurationMs: number;
}

export interface RendererBackendCallbacks {
  readonly onDiagnostics: (diagnostics: RendererDiagnostics) => void;
  readonly onFailure: (error: Error) => void;
}

export interface RendererBackendOptions {
  readonly forceWebGL: boolean;
}

export interface RendererBackend {
  initialize(asset: StrandAsset, initialState: VisualState): Promise<RendererDiagnostics>;
  updateVisualState(state: VisualState): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface RendererFrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface RendererFailureGate {
  reportFailure(error: unknown): void;
  runOwnedUpdate(update: () => void): void;
  renderInitially(render: () => RendererDiagnostics): RendererDiagnostics;
  requestRender(render: () => void): void;
  throwIfFailed(): void;
  dispose(): void;
}

const browserFrameScheduler: RendererFrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

function normalizedError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim().length > 0) return new Error(value);
  return new Error("The graphics backend reported an unknown error.");
}

/** Owns terminal renderer failure and frame scheduling without requiring a GPU in tests. */
export function createRendererFailureGate(
  onFailure: (error: Error) => void,
  scheduler: RendererFrameScheduler = browserFrameScheduler,
): RendererFailureGate {
  let failure: Error | null = null;
  let animationFrame: number | null = null;
  let disposed = false;

  function cancelPendingRender(): void {
    if (animationFrame === null) return;
    scheduler.cancel(animationFrame);
    animationFrame = null;
  }

  function reportFailure(value: unknown): void {
    if (disposed || failure !== null) return;
    failure = normalizedError(value);
    cancelPendingRender();
    onFailure(failure);
  }

  return {
    reportFailure,
    runOwnedUpdate(update) {
      if (disposed || failure !== null) return;
      try {
        update();
      } catch (error) {
        reportFailure(error);
      }
    },
    renderInitially(render) {
      if (failure !== null) throw failure;
      if (disposed) throw new Error("RendererBackend was disposed before initial rendering.");
      try {
        return render();
      } catch (error) {
        const normalized = normalizedError(error);
        reportFailure(normalized);
        throw normalized;
      }
    },
    requestRender(render) {
      if (disposed || failure !== null || animationFrame !== null) return;
      animationFrame = scheduler.request(() => {
        animationFrame = null;
        if (disposed || failure !== null) return;
        try {
          render();
        } catch (error) {
          reportFailure(error);
        }
      });
    },
    throwIfFailed() {
      if (failure !== null) throw failure;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPendingRender();
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function backendErrorMessage(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (!isRecord(value)) return "The graphics backend reported an unknown error.";
  const api = typeof value.api === "string" ? value.api : "graphics";
  const type = typeof value.type === "string" ? value.type : "backend error";
  const message = typeof value.message === "string" ? value.message : "Unknown cause";
  return `${api} ${type}: ${message}`;
}

function createTubeGeometry(strand: StrandRecord): THREE.BufferGeometry {
  const points = strand.controlPoints.map(
    ([x, y, z]) => new THREE.Vector3(x, y, z),
  );
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const tubularSegments = (points.length - 1) * TUBE_SEGMENTS_PER_CONTROL_SPAN;
  return new THREE.TubeGeometry(
    curve,
    tubularSegments,
    strand.width / 2,
    TUBE_RADIAL_SEGMENTS,
    false,
  );
}

function mergeStrandGeometry(strands: readonly StrandRecord[]): THREE.BufferGeometry {
  if (strands.length === 0) return new THREE.BufferGeometry();
  const geometries = strands.map(createTubeGeometry);
  const merged = mergeGeometries(geometries);
  for (const geometry of geometries) geometry.dispose();
  return merged;
}

class ThreeRendererBackend implements RendererBackend {
  private readonly renderer: THREE.WebGPURenderer;
  private readonly failureGate: RendererFailureGate;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 30);
  private readonly fixtureGroup = new THREE.Group();
  private readonly strandMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0x34251f,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  private readonly supportMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0xb8c0cc,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  private readonly supportGeometry = new THREE.SphereGeometry(
    1.01,
    32,
    16,
    -1.2,
    2.4,
    0.2,
    1.12,
  );
  private strandGeometry = new THREE.BufferGeometry();
  private readonly strandMesh = new THREE.Mesh(this.strandGeometry, this.strandMaterial);
  private asset: StrandAsset | null = null;
  private densityTier: VisualDensityTier | null = null;
  private backendKind: RendererBackendKind | null = null;
  private visibleStrandCount = 0;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: RendererBackendOptions,
    private readonly callbacks: RendererBackendCallbacks,
  ) {
    this.failureGate = createRendererFailureGate(callbacks.onFailure);
    this.renderer = new THREE.WebGPURenderer({
      antialias: true,
      forceWebGL: options.forceWebGL,
    });
    this.renderer.setClearColor(0xe8edf3, 1);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO),
    );
    const reportBackendFailure = (info: unknown): void => {
      this.failureGate.reportFailure(new Error(backendErrorMessage(info)));
    };
    this.renderer.onError = reportBackendFailure;
    this.renderer.onDeviceLost = reportBackendFailure;
    this.renderer.domElement.setAttribute("aria-label", "렌더 랩 3D 진단 뷰포트");
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.container.appendChild(this.renderer.domElement);
  }

  async initialize(
    asset: StrandAsset,
    initialState: VisualState,
  ): Promise<RendererDiagnostics> {
    if (this.disposed) throw new Error("RendererBackend was disposed before initialization.");
    this.asset = asset;
    this.buildScene();
    this.resize(this.container.clientWidth, this.container.clientHeight);
    this.failureGate.throwIfFailed();
    await this.renderer.init();
    if (this.disposed) throw new Error("RendererBackend was disposed during initialization.");
    this.failureGate.throwIfFailed();

    this.backendKind =
      this.renderer.coordinateSystem === THREE.WebGPUCoordinateSystem ? "WEBGPU" : "WEBGL2";
    this.updateVisualState(initialState);
    return this.failureGate.renderInitially(() => this.renderImmediately());
  }

  updateVisualState(state: VisualState): void {
    this.failureGate.runOwnedUpdate(() => {
      if (this.disposed) return;
      const canonical = canonicalizeVisualState(state);
      this.strandMaterial.color.set(canonical.previewColor);
      this.fixtureGroup.rotation.set(
        canonical.viewRotation.pitch,
        canonical.viewRotation.yaw,
        0,
      );
      if (this.densityTier !== canonical.visualDensityTier) {
        this.rebuildVisibleStrands(canonical.visualDensityTier);
      }
      if (this.backendKind !== null) this.requestRender();
    });
  }

  resize(width: number, height: number): void {
    this.failureGate.runOwnedUpdate(() => {
      if (this.disposed) return;
      const boundedWidth = Math.max(MIN_VIEWPORT_SIZE, Math.floor(width));
      const boundedHeight = Math.max(MIN_VIEWPORT_SIZE, Math.floor(height));
      this.camera.aspect = boundedWidth / boundedHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(boundedWidth, boundedHeight, false);
      if (this.backendKind !== null) this.requestRender();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.failureGate.dispose();
    this.strandGeometry.dispose();
    this.supportGeometry.dispose();
    this.strandMaterial.dispose();
    this.supportMaterial.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private buildScene(): void {
    this.camera.position.set(0, 0.55, 4.8);
    this.camera.lookAt(0, 0.25, 0);

    const supportMesh = new THREE.Mesh(this.supportGeometry, this.supportMaterial);
    supportMesh.scale.z = 0.82;
    this.fixtureGroup.add(supportMesh, this.strandMesh);
    this.scene.add(this.fixtureGroup);

    const hemisphere = new THREE.HemisphereLight(0xf8fafc, 0x334155, 2.1);
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.7);
    keyLight.position.set(2.8, 3.6, 3.1);
    const fillLight = new THREE.DirectionalLight(0x9bbcff, 1.1);
    fillLight.position.set(-3, 1.2, 2);
    this.scene.add(hemisphere, keyLight, fillLight);
  }

  private rebuildVisibleStrands(tier: VisualDensityTier): void {
    if (this.asset === null) throw new Error("StrandAsset is unavailable.");
    const selected = selectStrandsForTier(this.asset, tier);
    const nextGeometry = mergeStrandGeometry(selected);
    const previousGeometry = this.strandGeometry;
    this.strandGeometry = nextGeometry;
    this.strandMesh.geometry = nextGeometry;
    previousGeometry.dispose();
    this.densityTier = tier;
    this.visibleStrandCount = selected.length;
  }

  private requestRender(): void {
    this.failureGate.requestRender(() => this.renderImmediately());
  }

  private renderImmediately(): RendererDiagnostics {
    if (this.backendKind === null) {
      throw new Error("Renderer backend is not initialized.");
    }
    const start = performance.now();
    this.renderer.render(this.scene, this.camera);
    const diagnostics = {
      backend: this.backendKind,
      visibleStrandCount: this.visibleStrandCount,
      frameDurationMs: Math.max(0, performance.now() - start),
    };
    this.callbacks.onDiagnostics(diagnostics);
    return diagnostics;
  }
}

export function createRendererBackend(
  container: HTMLElement,
  options: RendererBackendOptions,
  callbacks: RendererBackendCallbacks,
): RendererBackend {
  return new ThreeRendererBackend(container, options, callbacks);
}
