import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
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
const S1_IMPORTERS = [
  "src/lib/payment/eximbay/ready-contact.ts",
  "src/lib/payment/eximbay/ready-http.ts",
] as const;

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

  it("allows only the exact reviewed S2 modules to consume S1 while preserving S1 dependencies", () => {
    const source = productionSource();
    const importers = productionImportersOf("src/lib/payment/eximbay/ready-kernel.ts");

    expect(source).toContain('from "./ready"');
    expect(source).not.toContain("@/lib/db");
    expectExactImporterAllowlist(importers, S1_IMPORTERS);
  });

  it.each([
    ["alias with single quotes", "import x from '@/lib/payment/eximbay/ready-kernel';"],
    ["relative form", "import x from './eximbay/ready-kernel';"],
    ["dynamic import", "const x = import('@/lib/payment/eximbay/ready-kernel');"],
    ["require", "const x = require('./eximbay/ready-kernel');"],
  ])("detects an unexpected %s importer syntax", (_label, source) => {
    expect(sourceImportsTarget(
      "src/lib/payment/unexpected.ts",
      source,
      "src/lib/payment/eximbay/ready-kernel.ts",
    )).toBe(true);
  });

  it("rejects an unexpected production path from the exact allowlist", () => {
    expect(() => expectExactImporterAllowlist(
      [...S1_IMPORTERS, "src/lib/payment/unexpected.ts"],
      S1_IMPORTERS,
    )).toThrowError("UNEXPECTED_PRODUCTION_IMPORTER");
  });

  it("keeps current S2 production ownership exact", () => {
    expectExactImporterAllowlist(
      productionImportersOf("src/lib/payment/eximbay/ready-contact.ts"),
      ["src/lib/payment/attempt/initiate.ts"],
    );
    expectExactImporterAllowlist(
      productionImportersOf("src/lib/payment/eximbay/ready-http.ts"),
      [
        "src/lib/payment/eximbay/ready-config.ts",
        "src/lib/payment/eximbay/ready-contact.ts",
      ],
    );
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

function productionImportersOf(targetRelativePath: string): string[] {
  return ts.sys.readDirectory(join(ROOT, "src"), [".ts", ".tsx"], undefined, undefined)
    .flatMap((absolutePath) => {
      const importer = repositoryRelativePath(absolutePath);
      if (importer.includes("/__tests__/") || importer === targetRelativePath) return [];
      const source = readFileSync(absolutePath, "utf8");
      return sourceImportsTarget(importer, source, targetRelativePath) ? [importer] : [];
    })
    .sort();
}

function sourceImportsTarget(
  importerRelativePath: string,
  source: string,
  targetRelativePath: string,
): boolean {
  const sourceFile = ts.createSourceFile(importerRelativePath, source, ts.ScriptTarget.ESNext, true);
  let found = false;
  function visit(node: ts.Node): void {
    const specifier = importedModuleSpecifier(node);
    if (specifier && resolvesToTarget(importerRelativePath, specifier, targetRelativePath)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return found;
}

function importedModuleSpecifier(node: ts.Node): string | null {
  return declarationModuleSpecifier(node)
    ?? importEqualsModuleSpecifier(node)
    ?? callModuleSpecifier(node);
}

function declarationModuleSpecifier(node: ts.Node): string | null {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) return null;
  if (!node.moduleSpecifier || !ts.isStringLiteralLike(node.moduleSpecifier)) return null;
  return node.moduleSpecifier.text;
}

function importEqualsModuleSpecifier(node: ts.Node): string | null {
  if (!ts.isImportEqualsDeclaration(node)) return null;
  if (!ts.isExternalModuleReference(node.moduleReference)) return null;
  const expression = node.moduleReference.expression;
  if (!expression || !ts.isStringLiteralLike(expression)) return null;
  return expression.text;
}

function callModuleSpecifier(node: ts.Node): string | null {
  if (!ts.isCallExpression(node) || node.arguments.length !== 1) return null;
  const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
  const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
  const argument = node.arguments[0];
  if ((!isDynamicImport && !isRequire) || !argument || !ts.isStringLiteralLike(argument)) return null;
  return argument.text;
}

function resolvesToTarget(
  importerRelativePath: string,
  specifier: string,
  targetRelativePath: string,
): boolean {
  const importerAbsolutePath = resolve(ROOT, importerRelativePath);
  const resolvedSpecifier = specifier.startsWith("@/")
    ? resolve(ROOT, "src", specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importerAbsolutePath), specifier)
      : null;
  if (!resolvedSpecifier) return false;
  return moduleIdentity(resolvedSpecifier) === moduleIdentity(resolve(ROOT, targetRelativePath));
}

function moduleIdentity(path: string): string {
  return path.replace(/\.(?:[cm]?[jt]sx?)$/u, "").replaceAll("\\", "/");
}

function repositoryRelativePath(absolutePath: string): string {
  return relative(ROOT, absolutePath).replaceAll("\\", "/");
}

function expectExactImporterAllowlist(
  actual: readonly string[],
  allowed: readonly string[],
): void {
  if (actual.length === allowed.length && actual.every((path, index) => path === allowed[index])) return;
  throw new Error(`UNEXPECTED_PRODUCTION_IMPORTER:${actual.join(",")}`);
}
