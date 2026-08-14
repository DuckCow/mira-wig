import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const S1_PRODUCTION_FILES = ["src/lib/payment/eximbay/ready-kernel.ts"] as const;
const ALLOWED_IMPORTS = new Set([
  "server-only",
  "./ready",
  "@/lib/payment/providers/eximbay/preparation",
  "@/lib/payment/providers/eximbay/types",
]);
const PROHIBITED_IMPORT = /^(?:node:)?(?:dns|http|https|net|tls)(?:\/|$)|^(?:axios|cross-fetch|got|node-fetch|superagent|undici)(?:\/|$)|(?:\/|^)(?:actions|api|attempt|complete|credentials|factory|refund|routing|void|webhook)(?:\/|$)/u;
const PROHIBITED_RUNTIME_IDENTIFIER = /^(?:fetch|XMLHttpRequest|WebSocket|EventSource|window|document|localStorage|sessionStorage)$/u;
const PROHIBITED_MEMBER = /^(?:create|createMany|delete|deleteMany|executeRaw|update|updateMany|upsert)$/u;

describe("EX2B2-S1 source isolation", () => {
  it("limits the exact S1 production graph to the installed EX2A/EX2B1 seams and language primitives", () => {
    for (const relativePath of S1_PRODUCTION_FILES) {
      const source = readFileSync(join(ROOT, relativePath), "utf8");
      const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.ESNext, true);
      const violations: string[] = [];

      function visit(node: ts.Node): void {
        inspectImport(node, violations);
        inspectRuntimeCapability(node, violations);
        inspectDurableWrite(node, violations);
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      expect(violations, relativePath).toEqual([]);
    }
  });

  it("contains no provider secret, browser SDK, callback, lifecycle, logging, or activation authority", () => {
    const source = productionSource();

    expect(source).not.toMatch(/(?:process\s*\.\s*env|authorization|api[_-]?key|credential|basic auth)/iu);
    expect(source).not.toMatch(/(?:javascriptSDK\.js|EXIMBAY\.request_pay|request_pay)/u);
    expect(source).not.toMatch(/(?:window|document|localStorage|sessionStorage|browser action)/u);
    expect(source).not.toMatch(/(?:statusFgkey|callbackFgkey|callback route|webhook|completion|capture|refund)/iu);
    expect(source).not.toMatch(/(?:markContactStarted|markOutcomeUnknown|persistInitiationOutput|attemptLifecycle)/u);
    expect(source).not.toMatch(/(?:PROVIDER_REGISTRY|ROUTING_RULES|MARKET_DEFAULTS|liveEnabled)/u);
    expect(source).not.toMatch(/(?:console\.(?:log|error|warn|info)|logger\.)/u);
    expect(source).not.toMatch(/(?:providerRef|providerPaymentKey|initiationOutputKind)/u);
    expect(source).not.toMatch(/projectEximbaySdk/u);
  });

  it("adds no production reachability and preserves the installed EX2B1 source as the sole allowed dependency", () => {
    const source = productionSource();
    const repositoryFiles = ts.sys.readDirectory(join(ROOT, "src"), [".ts", ".tsx"], undefined, undefined);
    const importers = repositoryFiles.filter((absolutePath) => {
      const normalized = absolutePath.replaceAll("\\", "/");
      if (normalized.includes("/__tests__/")) return false;
      if (normalized.endsWith("/ready-kernel.ts")) return false;
      const contents = readFileSync(absolutePath, "utf8");
      return contents.includes("payment/eximbay/ready-kernel") || contents.includes("../ready-kernel");
    });

    expect(source).toContain('from "./ready"');
    expect(source).not.toContain("@/lib/db");
    expect(importers).toEqual([]);
  });
});

function productionSource(): string {
  return S1_PRODUCTION_FILES
    .map((relativePath) => readFileSync(join(ROOT, relativePath), "utf8"))
    .join("\n");
}

function inspectImport(node: ts.Node, violations: string[]): void {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const specifier = node.moduleSpecifier.text;
    if (!ALLOWED_IMPORTS.has(specifier)) violations.push(`unapproved-import:${specifier}`);
    if (PROHIBITED_IMPORT.test(specifier)) violations.push(`prohibited-import:${specifier}`);
  }
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    violations.push("dynamic-import");
  }
}

function inspectRuntimeCapability(node: ts.Node, violations: string[]): void {
  if (ts.isIdentifier(node) && PROHIBITED_RUNTIME_IDENTIFIER.test(node.text)) {
    violations.push(`runtime:${node.text}`);
  }
  if (!ts.isPropertyAccessExpression(node)) return;
  if (ts.isIdentifier(node.expression) && node.expression.text === "process" && node.name.text === "env") {
    violations.push("runtime:process.env");
  }
}

function inspectDurableWrite(node: ts.Node, violations: string[]): void {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
  if (PROHIBITED_MEMBER.test(node.expression.name.text)) {
    violations.push(`durable-write:${node.expression.name.text}`);
  }
}
