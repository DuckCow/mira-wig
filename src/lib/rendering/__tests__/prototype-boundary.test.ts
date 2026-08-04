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
});
