import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as kernel from "../index";

const ROOT = join(process.cwd(), "src/lib/payment/providers/eximbay");
const SOURCE_ROOT = join(process.cwd(), "src");
const COMPILER_OPTIONS: ts.CompilerOptions = {
  lib: ["lib.dom.d.ts", "lib.esnext.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  target: ts.ScriptTarget.ESNext,
};

type IsolationViolationCode =
  | "DYNAMIC_MODULE_LOADING"
  | "EXPORTED_VERIFICATION_AUTHORITY"
  | "PROHIBITED_GLOBAL"
  | "PROHIBITED_RUNTIME_IMPORT"
  | "REQUIRE_MODULE_LOADING"
  | "STATIC_MODULE_ESCAPE"
  | "TEST_DEPENDENCY"
  | "UNRESOLVED_MODULE";

interface IsolationViolation {
  readonly code: IsolationViolationCode;
  readonly file: string;
  readonly detail: string;
}

interface StaticModuleReference {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

describe("Eximbay SOURCE_ONLY runtime isolation", () => {
  it("resolves every production module as an isolated pure dependency graph", () => {
    const files = productionTypeScriptFiles(ROOT);

    expect(files.length).toBeGreaterThan(0);
    expect(inspectProductionTree(ROOT)).toEqual([]);
  });

  it("proves the checker catches representative authority leaks", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "eximbay-isolation-"));
    const kernelRoot = join(fixtureRoot, "kernel");
    try {
      mkdirSync(kernelRoot);
      writeFileSync(join(fixtureRoot, "outside.ts"), "export const escaped = true;\n");
      writeFileSync(join(kernelRoot, "dynamic.ts"), "export const dynamic = true;\n", {
        flag: "wx",
      });
      writeFileSync(join(kernelRoot, "required.ts"), "export const required = true;\n", {
        flag: "wx",
      });
      writeFileSync(join(kernelRoot, "entry.ts"), hostileFixtureSource(), { flag: "wx" });

      const violations = inspectProductionTree(kernelRoot);
      const codes = new Set(violations.map((violation) => violation.code));
      const details = violations.map((violation) => violation.detail).join(" ");

      expect(codes).toEqual(new Set([
        "DYNAMIC_MODULE_LOADING",
        "PROHIBITED_GLOBAL",
        "PROHIBITED_RUNTIME_IMPORT",
        "REQUIRE_MODULE_LOADING",
        "STATIC_MODULE_ESCAPE",
      ]));
      for (const capability of [
        "fetch",
        "XMLHttpRequest",
        "process.env",
        "console",
        "Date.now",
        "Math.random",
        "crypto.randomUUID",
        "node:crypto:randomBytes",
        "setTimeout",
        "setInterval",
        "localStorage",
        "sessionStorage",
      ]) {
        expect(details).toContain(capability);
      }
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("performs no network work while exercising public runtime capabilities", () => {
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = () => {
      fetchCalls += 1;
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    try {
      expect(kernel.encodeEximbayAmount("USD", 1)).toBe("0.01");
      expect(kernel.classifyEximbayInquiryStatus("SALE").potentialCompletedSale).toBe(true);
      expect(kernel.parseUnverifiedEximbayStatus(
        "transaction_type=PAYMENT&mid=m&order_id=o&currency=USD&amount=0.01"
        + "&rescode=0000&resmsg=Success&fgkey=f&transaction_id=t",
      ).authority).toBe("UNVERIFIED_STATUS");
      expect(fetchCalls).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps verification promotion unavailable from barrels and deep production modules", () => {
    const exports = Object.keys(kernel);

    expect(exports.some((name) => /promot|verified.*(?:brand|create|factory|fixture)|sdkLoader|request|fetch/iu.test(name)))
      .toBe(false);
    expect(inspectVerificationAuthorityExports(productionTypeScriptFiles(ROOT))).toEqual([]);
    expect(existsSync(join(ROOT, "verified-status-brand.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "__tests__/fixtures/verified-status.ts"))).toBe(true);
  });
});

function inspectProductionTree(root: string): readonly IsolationViolation[] {
  const files = productionTypeScriptFiles(root);
  const program = ts.createProgram(files, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const violations: IsolationViolation[] = [];

  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (sourceFile === undefined) {
      violations.push(violation("UNRESOLVED_MODULE", file, file));
      continue;
    }
    for (const reference of staticModuleReferences(sourceFile)) {
      inspectStaticReference(root, file, reference, violations);
    }
    inspectCryptoRandomImports(sourceFile, violations);
    inspectSyntaxCapabilities(sourceFile, checker, violations);
  }

  return deduplicateViolations(violations);
}

function inspectCryptoRandomImports(
  sourceFile: ts.SourceFile,
  violations: IsolationViolation[],
): void {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!/^(?:node:)?crypto$/u.test(statement.moduleSpecifier.text)) continue;
    const clause = statement.importClause;
    if (clause === undefined || clause.isTypeOnly) continue;
    const names = importedRuntimeNames(clause);
    for (const name of names) {
      if (/^(?:getRandomValues|random)/u.test(name) || name === "*") {
        violations.push(violation(
          "PROHIBITED_RUNTIME_IMPORT",
          sourceFile.fileName,
          `${statement.moduleSpecifier.text}:${name}`,
        ));
      }
    }
  }
}

function importedRuntimeNames(clause: ts.ImportClause): readonly string[] {
  const names: string[] = [];
  if (clause.name !== undefined) names.push("*");
  if (clause.namedBindings === undefined) return names;
  if (ts.isNamespaceImport(clause.namedBindings)) return [...names, "*"];
  for (const element of clause.namedBindings.elements) {
    if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
  }
  return names;
}

function staticModuleReferences(sourceFile: ts.SourceFile): readonly StaticModuleReference[] {
  const references: StaticModuleReference[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      references.push({
        specifier: statement.moduleSpecifier.text,
        typeOnly: importIsTypeOnly(statement),
      });
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined
      && ts.isStringLiteral(statement.moduleSpecifier)) {
      references.push({ specifier: statement.moduleSpecifier.text, typeOnly: statement.isTypeOnly });
    }
    if (ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
      && ts.isStringLiteral(statement.moduleReference.expression)) {
      references.push({ specifier: statement.moduleReference.expression.text, typeOnly: false });
    }
  }
  return references;
}

function importIsTypeOnly(declaration: ts.ImportDeclaration): boolean {
  const clause = declaration.importClause;
  if (clause === undefined) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name !== undefined || clause.namedBindings === undefined) return false;
  if (!ts.isNamedImports(clause.namedBindings)) return false;
  return clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function inspectStaticReference(
  root: string,
  containingFile: string,
  reference: StaticModuleReference,
  violations: IsolationViolation[],
): void {
  const prohibitedCategory = prohibitedImportCategory(reference);
  if (prohibitedCategory !== undefined) {
    violations.push(violation("PROHIBITED_RUNTIME_IMPORT", containingFile, prohibitedCategory));
  }

  const resolved = ts.resolveModuleName(
    reference.specifier,
    containingFile,
    COMPILER_OPTIONS,
    ts.sys,
  ).resolvedModule;
  if (resolved === undefined) {
    if (reference.specifier.startsWith("node:")) return;
    violations.push(violation("UNRESOLVED_MODULE", containingFile, reference.specifier));
    return;
  }

  const resolvedFile = resolve(resolved.resolvedFileName);
  if (resolvedFile.includes(`${join("", "__tests__")}/`)) {
    violations.push(violation("TEST_DEPENDENCY", containingFile, resolvedFile));
  }
  const repositoryLocal = isInside(SOURCE_ROOT, resolvedFile);
  if ((reference.specifier.startsWith(".") || repositoryLocal) && !isInside(root, resolvedFile)) {
    violations.push(violation("STATIC_MODULE_ESCAPE", containingFile, resolvedFile));
  }
}

function prohibitedImportCategory(reference: StaticModuleReference): string | undefined {
  const specifier = reference.specifier.toLowerCase();
  if (reference.typeOnly && specifier.startsWith("node:")) return undefined;
  if (/^(?:node:)?(?:fs|http|https|net|tls|dns)(?:\/|$)/u.test(specifier)) return specifier;
  if (/(?:^|[/@-])(?:axios|cross-fetch|got|ky|node-fetch|superagent|undici)(?:[/@-]|$)/u.test(specifier)) {
    return specifier;
  }
  if (/(?:^|[/@-])eximbay(?:[/@-]|$)/u.test(specifier) && !specifier.startsWith(".")) {
    return specifier;
  }
  if (/(?:@prisma|^prisma(?:\/|$)|dotenv|env-cmd|next(?:\/|$)|react(?:\/|$))/u.test(specifier)) {
    return specifier;
  }
  if (/(?:routing|factory|credential|resolution|initiation|completion|finaliz|reconciliation|outbox|refund|void)/u.test(specifier)) {
    return specifier;
  }
  if (/(?:^|[/@-])(?:bunyan|log4js|pino|winston)(?:[/@-]|$)/u.test(specifier)) return specifier;
  return undefined;
}

function inspectSyntaxCapabilities(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  violations: IsolationViolation[],
): void {
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      violations.push(violation("DYNAMIC_MODULE_LOADING", sourceFile.fileName, "import(...)"));
    }
    if (isGlobalCall(node, checker, "require")) {
      violations.push(violation("REQUIRE_MODULE_LOADING", sourceFile.fileName, "require(...)"));
    }
    const capability = prohibitedGlobalCapability(node, checker);
    if (capability !== undefined) {
      violations.push(violation("PROHIBITED_GLOBAL", sourceFile.fileName, capability));
    }
    const referencedCapability = ambientCapabilityIdentifier(node, checker);
    if (referencedCapability !== undefined) {
      violations.push(violation(
        "PROHIBITED_GLOBAL",
        sourceFile.fileName,
        referencedCapability,
      ));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function ambientCapabilityIdentifier(node: ts.Node, checker: ts.TypeChecker): string | undefined {
  if (!ts.isIdentifier(node) || !symbolIsAmbient(node, checker)) return undefined;
  if (!identifierIsValuePosition(node)) return undefined;
  if ([
    "Date",
    "XMLHttpRequest",
    "console",
    "fetch",
    "localStorage",
    "sessionStorage",
    "setInterval",
    "setTimeout",
  ].includes(node.text)) return node.text;
  return undefined;
}

function identifierIsValuePosition(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === identifier) return false;
  if (declarationOwnsName(parent, identifier)) return false;
  let ancestor: ts.Node | undefined = parent;
  while (ancestor !== undefined && !ts.isStatement(ancestor)) {
    if (ts.isTypeNode(ancestor)) return false;
    ancestor = ancestor.parent;
  }
  return true;
}

function declarationOwnsName(parent: ts.Node, identifier: ts.Identifier): boolean {
  return bindingOwnsName(parent, identifier)
    || runtimeDeclarationOwnsName(parent, identifier)
    || typeDeclarationOwnsName(parent, identifier)
    || ts.isImportClause(parent)
    || ts.isImportSpecifier(parent)
    || ts.isNamespaceImport(parent)
    || ts.isImportEqualsDeclaration(parent);
}

function bindingOwnsName(parent: ts.Node, identifier: ts.Identifier): boolean {
  if (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) {
    return parent.name === identifier;
  }
  return false;
}

function runtimeDeclarationOwnsName(parent: ts.Node, identifier: ts.Identifier): boolean {
  if (ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)
    || ts.isClassDeclaration(parent) || ts.isClassExpression(parent)
    || ts.isPropertyDeclaration(parent)
    || ts.isMethodDeclaration(parent) || ts.isGetAccessorDeclaration(parent)
    || ts.isSetAccessorDeclaration(parent)) {
    return parent.name === identifier;
  }
  return false;
}

function typeDeclarationOwnsName(parent: ts.Node, identifier: ts.Identifier): boolean {
  if (ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)
    || ts.isEnumDeclaration(parent) || ts.isTypeParameterDeclaration(parent)) {
    return parent.name === identifier;
  }
  return false;
}

function prohibitedGlobalCapability(node: ts.Node, checker: ts.TypeChecker): string | undefined {
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    const direct = directGlobalCapability(node.expression, checker);
    if (direct !== undefined) return direct;
  }
  if (!ts.isPropertyAccessExpression(node)) return undefined;
  const path = globalPropertyPath(node, checker);
  if (path === undefined) return undefined;
  return prohibitedGlobalPath(path);
}

function directGlobalCapability(
  expression: ts.LeftHandSideExpression,
  checker: ts.TypeChecker,
): string | undefined {
  if (!ts.isIdentifier(expression) || !symbolIsAmbient(expression, checker)) return undefined;
  if (["fetch", "XMLHttpRequest", "Date", "setTimeout", "setInterval"].includes(expression.text)) {
    return expression.text;
  }
  return undefined;
}

function globalPropertyPath(
  node: ts.PropertyAccessExpression,
  checker: ts.TypeChecker,
): string | undefined {
  const parts: string[] = [node.name.text];
  let expression = node.expression;
  while (ts.isPropertyAccessExpression(expression)) {
    parts.unshift(expression.name.text);
    expression = expression.expression;
  }
  if (!ts.isIdentifier(expression) || !symbolIsAmbient(expression, checker)) return undefined;
  parts.unshift(expression.text);
  return parts.join(".");
}

function prohibitedGlobalPath(path: string): string | undefined {
  const normalized = path.replace(/^(?:globalThis|self|window)\./u, "");
  return prohibitedHostStatePath(normalized)
    ?? prohibitedNondeterminismPath(normalized)
    ?? prohibitedStorageOrTimerPath(normalized)
    ?? prohibitedNetworkPath(normalized);
}

function prohibitedHostStatePath(path: string): string | undefined {
  if (path === "process.env" || path.startsWith("process.env.")) return "process.env";
  if (path === "console" || path.startsWith("console.")) return "console";
  return undefined;
}

function prohibitedNondeterminismPath(path: string): string | undefined {
  if (path === "Date" || path.startsWith("Date.")) return path;
  if (path === "Math.random" || path.startsWith("Math.random.")) return "Math.random";
  if (/^crypto\.(?:getRandomValues|random)/u.test(path)) return path;
  return undefined;
}

function prohibitedStorageOrTimerPath(path: string): string | undefined {
  if (path === "localStorage" || path.startsWith("localStorage.")) return "localStorage";
  if (path === "sessionStorage" || path.startsWith("sessionStorage.")) return "sessionStorage";
  if (path === "setTimeout" || path.startsWith("setTimeout.")) return "setTimeout";
  if (path === "setInterval" || path.startsWith("setInterval.")) return "setInterval";
  return undefined;
}

function prohibitedNetworkPath(path: string): string | undefined {
  if (path === "fetch" || path.startsWith("fetch.")) return "fetch";
  if (path === "XMLHttpRequest" || path.startsWith("XMLHttpRequest.")) {
    return "XMLHttpRequest";
  }
  return undefined;
}

function isGlobalCall(node: ts.Node, checker: ts.TypeChecker, name: string): boolean {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
  return node.expression.text === name && symbolIsAmbient(node.expression, checker);
}

function symbolIsAmbient(identifier: ts.Identifier, checker: ts.TypeChecker): boolean {
  const symbol = checker.getSymbolAtLocation(identifier);
  if (symbol === undefined || symbol.declarations === undefined) return false;
  return symbol.declarations.every((declaration) => declaration.getSourceFile().isDeclarationFile);
}

function inspectVerificationAuthorityExports(
  files: readonly string[],
): readonly IsolationViolation[] {
  const program = ts.createProgram(files, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const verifiedSource = program.getSourceFile(join(ROOT, "verified-status.ts"));
  const verifiedType = findVerifiedStatusType(verifiedSource, checker);
  if (verifiedType === undefined) {
    return [violation("EXPORTED_VERIFICATION_AUTHORITY", "verified-status.ts", "missing nominal type")];
  }

  const violations: IsolationViolation[] = [];
  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (sourceFile === undefined) continue;
    inspectModuleAuthorityExports(sourceFile, checker, verifiedType, violations);
  }
  return deduplicateViolations(violations);
}

function findVerifiedStatusType(
  sourceFile: ts.SourceFile | undefined,
  checker: ts.TypeChecker,
): ts.Type | undefined {
  if (sourceFile === undefined) return undefined;
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) return undefined;
  const exported = checker.getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.name === "ProviderVerifiedEximbayStatus");
  if (exported === undefined) return undefined;
  return checker.getDeclaredTypeOfSymbol(resolveAlias(exported, checker));
}

function inspectModuleAuthorityExports(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  verifiedType: ts.Type,
  violations: IsolationViolation[],
): void {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) return;
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = resolveAlias(exported, checker);
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (declaration === undefined || (symbol.flags & ts.SymbolFlags.Value) === 0) continue;
    const valueType = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    if (exportsVerificationAuthority(valueType, verifiedType, checker)) {
      violations.push(violation(
        "EXPORTED_VERIFICATION_AUTHORITY",
        sourceFile.fileName,
        exported.name,
      ));
    }
  }
}

function exportsVerificationAuthority(
  exportedType: ts.Type,
  verifiedType: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  if ((exportedType.flags & ts.TypeFlags.UniqueESSymbol) !== 0) return true;
  if (checker.isTypeAssignableTo(exportedType, verifiedType)) return true;
  const signatures = [
    ...exportedType.getCallSignatures(),
    ...exportedType.getConstructSignatures(),
  ];
  return signatures.some((signature) => checker.isTypeAssignableTo(
    checker.getReturnTypeOfSignature(signature),
    verifiedType,
  ));
}

function resolveAlias(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0) return symbol;
  return checker.getAliasedSymbol(symbol);
}

function productionTypeScriptFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "__tests__") continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...productionTypeScriptFiles(path));
    if (entry.isFile() && extname(entry.name) === ".ts") files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(resolve(root), resolve(candidate));
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function violation(
  code: IsolationViolationCode,
  file: string,
  detail: string,
): IsolationViolation {
  return { code, file: relative(process.cwd(), file), detail };
}

function deduplicateViolations(
  violations: readonly IsolationViolation[],
): readonly IsolationViolation[] {
  const unique = new Map<string, IsolationViolation>();
  for (const item of violations) {
    unique.set(`${item.code}:${item.file}:${item.detail}`, item);
  }
  return [...unique.values()].sort((left, right) => {
    return `${left.file}:${left.code}:${left.detail}`.localeCompare(
      `${right.file}:${right.code}:${right.detail}`,
    );
  });
}

function hostileFixtureSource(): string {
  return [
    'import { writeFileSync } from "node:fs";',
    'import { randomBytes } from "node:crypto";',
    'import { escaped } from "../outside";',
    'void import("./dynamic");',
    'require("./required");',
    'fetch("https://example.invalid");',
    'new XMLHttpRequest();',
    'void process.env.SECRET;',
    'console.log(escaped);',
    'Date.now();',
    'Math.random();',
    'crypto.randomUUID();',
    'randomBytes(8);',
    'setTimeout(() => undefined, 1);',
    'setInterval(() => undefined, 1);',
    'localStorage.setItem("key", "value");',
    'sessionStorage.setItem("key", "value");',
    'writeFileSync("forbidden", "value");',
  ].join("\n");
}
