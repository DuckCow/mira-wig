import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("Render Lab prototype boundary", () => {
  it("installs the approved decision semantics", () => {
    const decision = read("docs/engineering/render-lab-prototype-decision-v0.1.md");
    const requiredSemantics = [
      "BOUNDED PROTOTYPE DECISION",
      "SMALL-CHANGE EXCEPTION — DOCUMENTED AND BOUNDED",
      "CUSTOMER ACTIVATION:\n  NOT AUTHORIZED",
      "Raw Three.js WebGPURenderer",
      "WebGPU preferred",
      "WebGL2 fallback",
      "StrandSource",
      "StrandAsset",
      "RendererBackend",
      "VisualState",
      "SHADER_PARAMETER",
      "STRAND_SELECTION",
      "VISUAL_ONLY",
      "NOT_A_REAL_BASE_OR_CAP",
      "NOT_A_MANUFACTURING_SPECIFICATION",
      "synchronous in-memory prototype producer",
      "not the final network, storage, bundle or streaming loader API",
      "binary/version/checksum/LOD contract",
      "diagnostic fixture limits, not production learned-model limits",
    ];

    for (const semantic of requiredSemantics) expect(decision).toContain(semantic);
  });

  it("keeps product, order, fit-authority, and production carriers out of visual modules", () => {
    const renderingModules = [
      "src/lib/rendering/strand-asset.ts",
      "src/lib/rendering/strand-source.ts",
      "src/lib/rendering/procedural-strand-source.ts",
      "src/lib/rendering/visual-state.ts",
      "src/lib/rendering/renderer-backend.ts",
      "src/lib/rendering/strand-bundle.ts",
      "src/lib/rendering/strand-bundle-loader.ts",
    ];
    const prohibitedAuthorityNames = [
      "WigStyle",
      "WigVariant",
      "TechnicalModel",
      "ConfigurationRevision",
      "BuildSpec",
      "RenderWitness",
      "ManufacturingRequest",
      "OrderItem",
      "Payment",
      "Fitting",
      "PackedStrandAsset",
    ];

    for (const modulePath of renderingModules) {
      const source = read(modulePath);
      for (const name of prohibitedAuthorityNames) expect(source).not.toContain(name);
    }
  });

  it("leaves customer, fitting, cart, and admin navigation unwired", () => {
    const protectedSurfaces = [
      "src/app/admin/layout.tsx",
      "src/app/admin/page.tsx",
      "src/app/(shop)/styles/[id]/page.tsx",
      "src/app/(shop)/styles/[id]/VariantSelector.tsx",
      "src/components/features/FittingModal.tsx",
      "src/hooks/useFitting.ts",
      "src/app/actions/fitting.ts",
      "src/app/actions/cart.ts",
    ];

    for (const surface of protectedSurfaces) {
      const source = read(surface);
      expect(source).not.toContain("render-lab");
      expect(source).not.toContain("@/lib/rendering");
      expect(source).not.toContain("@/components/rendering");
    }
  });

  it("loads the GPU implementation only below the explicit client boundary", () => {
    const page = read("src/app/admin/render-lab/page.tsx");
    const clientBoundary = read("src/app/admin/render-lab/RenderLabClient.tsx");
    const viewport = read("src/components/rendering/RenderLabViewport.tsx");

    expect(page).not.toContain("three/");
    expect(clientBoundary).toContain("dynamic(");
    expect(clientBoundary).toContain("ssr: false");
    expect(clientBoundary).not.toContain("three/");
    expect(viewport).toContain('import("@/lib/rendering/renderer-backend")');
  });

  it("keeps R2B on its protected visual-only technical boundary", () => {
    const codec = read("src/lib/rendering/strand-bundle.ts");
    const loader = read("src/lib/rendering/strand-bundle-loader.ts");
    const route = read("src/app/admin/render-lab/strand-bundle/[file]/route.ts");
    const viewport = read("src/components/rendering/RenderLabViewport.tsx");
    const packageSource = read("package.json");
    const prohibitedImports = [
      "@/lib/storage",
      "@/lib/payment",
      "@/lib/fitting",
      "@/lib/ai",
      "@prisma/client",
      "aws-sdk",
    ];

    for (const source of [codec, loader, route, viewport]) {
      for (const prohibitedImport of prohibitedImports) {
        expect(source).not.toContain(prohibitedImport);
      }
      expect(source).not.toContain("PackedStrandAsset");
      expect(source).not.toContain("importanceLod");
    }
    expect(route).toContain('import { requireAdmin } from "@/lib/admin"');
    expect(route).toContain("const guard = await requireAdmin()");
    expect(route).toContain('file === "manifest.json"');
    expect(route).toContain('file === "strands.bin"');
    expect(route).not.toContain("resolve(FIXTURE_DIRECTORY, file)");
    expect(loader).toContain('const MANIFEST_URL = "/admin/render-lab/strand-bundle/manifest.json"');
    expect(loader).toContain('const BINARY_URL = "/admin/render-lab/strand-bundle/strands.bin"');
    expect(viewport).not.toContain("createProceduralStrandSource");
    expect(viewport).not.toContain("importanceRank");
    expect(packageSource).not.toContain("pack-render-lab-strand-bundle");
    expect(existsSync(resolve(ROOT, "public/strand-bundle"))).toBe(false);
  });

  it("uses only the exact route-specific trace inclusions", () => {
    const config = read("next.config.ts");
    expect(config).toContain('"/admin/render-lab/strand-bundle/\\\\[file\\\\]"');
    expect(config).toContain(
      '"src/lib/rendering/fixtures/r2-diagnostic-v1/manifest.json"',
    );
    expect(config).toContain(
      '"src/lib/rendering/fixtures/r2-diagnostic-v1/strands.bin"',
    );
    expect(config).not.toContain('"/admin/render-lab/strand-bundle/*"');
    expect(config).not.toContain("r2-diagnostic-v1/**/*");
  });

  it("keeps R2C-A v0.3 synthetic input outside every canonical R2B carrier", () => {
    const benchmarkInput = read("src/lib/rendering/benchmark-input.ts");
    const runner = read("src/lib/rendering/benchmark-runner.ts");
    const prohibited = [
      "validateStrandAsset",
      "loadDiagnosticStrandBundle",
      "strand-bundle-loader",
      "strand-bundle.ts",
      "manifest.json",
      "strands.bin",
    ];

    for (const source of [benchmarkInput, runner]) {
      for (const token of prohibited) expect(source).not.toContain(token);
    }
    expect(benchmarkInput).toContain('canonicalR2BBundle: false');
  });

  it("adds no R2C-A navigation or customer import edge", () => {
    const protectedSurfaces = [
      "src/app/admin/layout.tsx",
      "src/app/admin/page.tsx",
      "src/app/(shop)/styles/[id]/page.tsx",
      "src/app/(shop)/styles/[id]/VariantSelector.tsx",
      "src/components/features/FittingModal.tsx",
      "src/hooks/useFitting.ts",
      "src/app/actions/fitting.ts",
      "src/app/actions/cart.ts",
    ];
    for (const surface of protectedSurfaces) {
      const source = read(surface);
      expect(source).not.toContain("render-lab/performance");
      expect(source).not.toContain("benchmark-runner");
      expect(source).not.toContain("RenderPerformanceLab");
      expect(source).not.toContain("benchmark-point-sensitivity");
      expect(source).not.toContain("benchmark-runner-core");
      expect(source).not.toContain("three/webgpu");
    }
  });

  it("keeps the benchmark surface local-only and free of persistence or external requests", () => {
    const benchmarkPaths = [
      "src/app/admin/render-lab/performance/RenderPerformanceClient.tsx",
      "src/app/admin/render-lab/performance/actions.ts",
      "src/app/admin/render-lab/performance/page.tsx",
      "src/components/rendering/RenderPerformanceLab.tsx",
      "src/lib/rendering/benchmark-input.ts",
      "src/lib/rendering/benchmark-measurement.ts",
      "src/lib/rendering/benchmark-result.ts",
      "src/lib/rendering/benchmark-runner.ts",
      "src/lib/rendering/benchmark-runner-core.ts",
      "src/lib/rendering/benchmark-point-sensitivity-input.ts",
      "src/lib/rendering/benchmark-point-sensitivity-result.ts",
      "src/lib/rendering/benchmark-point-sensitivity-runner.ts",
      "src/app/admin/render-lab/performance/point-sensitivity-actions.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-input.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-browser-admission.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-analysis.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-result.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-runner.ts",
      "src/app/admin/render-lab/performance/control-point-tessellation-actions.ts",
    ];
    const prohibitedNetworkOrPersistence = [
      "localStorage",
      "sessionStorage",
      "navigator.sendBeacon",
      "XMLHttpRequest",
      "WebSocket",
      "fetch(",
    ];
    const prohibitedDomainImports = [
      "@/lib/storage",
      "@/lib/payment",
      "@/lib/fitting",
      "@/lib/ai",
      "@/lib/db",
      "@prisma/client",
      "@/app/(shop)",
      "@/app/actions/cart",
      "@/app/actions/checkout",
    ];
    for (const modulePath of benchmarkPaths) {
      const source = read(modulePath);
      for (const token of prohibitedNetworkOrPersistence) expect(source).not.toContain(token);
      for (const token of prohibitedDomainImports) expect(source).not.toContain(token);
    }
  });

  it("keeps S1 and the shared lifecycle core admin-only and outside canonical R2B", () => {
    const s1Paths = [
      "src/lib/rendering/benchmark-point-sensitivity-input.ts",
      "src/lib/rendering/benchmark-point-sensitivity-result.ts",
      "src/lib/rendering/benchmark-point-sensitivity-runner.ts",
      "src/lib/rendering/benchmark-point-sensitivity-provenance.server.ts",
      "src/lib/rendering/benchmark-runner-core.ts",
      "src/components/rendering/RenderPerformanceLab.tsx",
    ];
    const prohibited = [
      "validateStrandAsset", "loadDiagnosticStrandBundle", "strand-bundle-loader",
      "@/lib/storage", "@/lib/payment", "@/lib/fitting", "@/lib/ai",
      "@prisma/client", "localStorage", "sessionStorage", "navigator.sendBeacon",
      "fetch(",
    ];
    for (const modulePath of s1Paths) {
      const source = read(modulePath);
      for (const token of prohibited) expect(source).not.toContain(token);
    }
    expect(read("src/lib/rendering/benchmark-point-sensitivity-input.ts"))
      .toContain("canonicalR2BBundle: false");
  });

  it("keeps S2 local, admin-only, non-product, non-R2B, and non-persistent", () => {
    const s2Paths = [
      "src/lib/rendering/benchmark-control-point-tessellation-input.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-browser-admission.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-analysis.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-result.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-runner.ts",
      "src/lib/rendering/benchmark-control-point-tessellation-provenance.server.ts",
      "src/app/admin/render-lab/performance/control-point-tessellation-actions.ts",
      "src/components/rendering/RenderPerformanceLab.tsx",
    ];
    const prohibited = [
      "validateStrandAsset", "loadDiagnosticStrandBundle", "strand-bundle-loader",
      "@/lib/storage", "@/lib/payment", "@/lib/fitting", "@/lib/ai",
      "@prisma/client", "localStorage", "sessionStorage", "navigator.sendBeacon",
      "XMLHttpRequest", "WebSocket", "fetch(",
    ];
    for (const modulePath of s2Paths) {
      const source = read(modulePath);
      for (const token of prohibited) expect(source).not.toContain(token);
    }
    expect(read("src/app/admin/render-lab/performance/control-point-tessellation-actions.ts"))
      .toContain("const guard = await requireAdmin()");
    expect(read("src/lib/rendering/benchmark-control-point-tessellation-input.ts"))
      .toContain("canonicalR2BBundle: false");
  });

  it("does not expose the benchmark tessellation override through normal renderer boundaries", () => {
    const renderer = read("src/lib/rendering/renderer-backend.ts");
    const normalInterface = renderer.slice(
      renderer.indexOf("export interface RendererBackend {"),
      renderer.indexOf("export interface RendererBenchmarkBackendObservation"),
    );
    const normalFactory = renderer.slice(
      renderer.indexOf("export function createRendererBackend("),
      renderer.indexOf("export function createRendererBenchmarkBackend("),
    );
    expect(normalInterface).not.toContain("tubularSegments");
    expect(normalFactory).not.toContain("tubularSegments");
    for (const customerBoundary of [
      "src/components/rendering/RenderLabViewport.tsx",
      "src/lib/rendering/strand-asset.ts",
      "src/lib/rendering/strand-bundle-loader.ts",
    ]) {
      expect(read(customerBoundary)).not.toContain("benchmark-control-point-tessellation");
    }
  });

  it("keeps normal R2B initialization observer-free and the benchmark seam separate", () => {
    const source = read("src/lib/rendering/renderer-backend.ts");
    const normalStart = source.indexOf("async initialize(\n    asset: StrandAsset");
    const benchmarkStart = source.indexOf("async initializeBenchmark(", normalStart);
    const normalInitialize = source.slice(normalStart, benchmarkStart);
    const normalFactoryStart = source.indexOf("export function createRendererBackend(");
    const benchmarkFactoryStart = source.indexOf(
      "export function createRendererBenchmarkBackend(",
      normalFactoryStart,
    );
    const normalFactory = source.slice(normalFactoryStart, benchmarkFactoryStart);

    expect(normalStart).toBeGreaterThan(-1);
    expect(benchmarkStart).toBeGreaterThan(normalStart);
    expect(normalInitialize).not.toContain("BenchmarkAggregateStageObserver");
    expect(normalInitialize).not.toContain("preGeometryGuard");
    expect(normalFactory).not.toContain("createRendererBenchmarkBackend");
  });
});
