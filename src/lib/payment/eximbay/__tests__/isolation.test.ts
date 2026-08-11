import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const EX2B1_PRODUCTION_FILES = [
  "src/lib/payment/attempt/provider-order-id.ts",
  "src/lib/payment/eximbay/ready.ts",
] as const;

const PROHIBITED_IMPORT = /^(?:node:)?(?:dns|fs|http|https|net|tls)(?:\/|$)|(?:axios|cross-fetch|got|node-fetch|superagent|undici)|(?:routing|factory|credential|refund|void|actions|api\/payments)/u;
const PROHIBITED_RUNTIME_IDENTIFIER = /^(?:fetch|XMLHttpRequest|WebSocket|EventSource)$/u;

describe("EX2B1 provider-free source isolation", () => {
  it("limits the new production surface to persistence, CSPRNG, and the installed EX2A kernel", () => {
    for (const relativePath of EX2B1_PRODUCTION_FILES) {
      const source = readFileSync(join(ROOT, relativePath), "utf8");
      const sourceFile = ts.createSourceFile(relativePath, source, ts.ScriptTarget.ESNext, true);
      const violations: string[] = [];

      function visit(node: ts.Node): void {
        inspectImportCapability(node, violations);
        inspectRuntimeCapability(node, violations);
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      expect(violations, relativePath).toEqual([]);
    }
  });

  it("does not add provider contact, callback, credential, SDK, or activation vocabulary", () => {
    const source = EX2B1_PRODUCTION_FILES
      .map((relativePath) => readFileSync(join(ROOT, relativePath), "utf8"))
      .join("\n");

    expect(source).not.toMatch(/(?:fgkey|authorization|basic auth|https?:\/\/|callback route|endpoint|sdk|retry|redirect|timeout)/iu);
    expect(source).not.toMatch(/(?:EXIMBAY_(?:SECRET|KEY|ENDPOINT|URL|ENABLED)|PROVIDER_REGISTRY|ROUTING_RULES|MARKET_DEFAULTS)/u);
  });
});

function inspectImportCapability(node: ts.Node, violations: string[]): void {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    const specifier = node.moduleSpecifier.text;
    if (PROHIBITED_IMPORT.test(specifier)) violations.push(`import:${specifier}`);
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
  if (!ts.isIdentifier(node.expression) || node.expression.text !== "process") return;
  if (node.name.text === "env") violations.push("runtime:process.env");
}
