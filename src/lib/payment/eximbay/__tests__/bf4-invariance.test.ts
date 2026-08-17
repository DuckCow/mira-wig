import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PaymentProvider } from "@prisma/client";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { PROVIDER_REGISTRY, ROUTING_RULES } from "@/lib/payment/providers/routing";
import { resolveWebhookPipeline } from "@/lib/payment/webhook/pipeline";

const ROOT = process.cwd();
const BF4_SOURCE = [
  "src/lib/payment/eximbay/bf4-contact.ts",
  "src/lib/payment/eximbay/bf4-engine.ts",
  "src/lib/payment/eximbay/bf4-envelope.ts",
  "src/lib/payment/eximbay/bf4-event.ts",
];

describe("Eximbay BF4 I1 dormancy invariants", () => {
  it("keeps the public status route absent and EXIMBAY routing disabled", () => {
    expect(existsSync(join(ROOT, "src/app/api/payments/eximbay/status"))).toBe(false);
    expect(PROVIDER_REGISTRY.EXIMBAY).toMatchObject({
      enabled: false,
      allowedModes: [],
      supportedMethods: [],
      supportedCurrencies: [],
    });
    expect(ROUTING_RULES.every((rule) => !rule.candidates.includes(PaymentProvider.EXIMBAY)))
      .toBe(true);
  });

  it("leaves the generic webhook owner explicitly unavailable for EXIMBAY", async () => {
    const pipeline = resolveWebhookPipeline(db, PaymentProvider.EXIMBAY, {});
    const result = await pipeline.verifier.verify({
      body: JSON.stringify({ transmissionId: "bf4-invariance", eventType: "STATUS" }),
      headers: {},
      receivedAt: new Date(0),
    });

    expect(pipeline.kind).toBe("unavailable");
    expect(result).toMatchObject({
      kind: "rejected",
      code: "EXIMBAY.PUBLIC_WEBHOOK_UNAVAILABLE",
      httpStatus: 503,
    });
  });

  it("has no BF4 SDK loader, request_pay, or route import reachability", () => {
    const sourceFiles = BF4_SOURCE.map((path) => ts.createSourceFile(
      path,
      readFileSync(join(ROOT, path), "utf8"),
      ts.ScriptTarget.ESNext,
      true,
    ));
    const moduleSpecifiers = sourceFiles.flatMap(staticModuleSpecifiers);
    const sourceText = sourceFiles.map((source) => source.text).join("\n");

    expect(moduleSpecifiers.some((specifier) => /(?:sdk-loader|sdk-invocation|app\/api)/u.test(specifier)))
      .toBe(false);
    expect(sourceText).not.toMatch(/request_pay|EXIMBAY\.request_pay/u);
    expect(sourceText).not.toContain("globalThis.fetch");
  });
});

function staticModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    specifiers.push(statement.moduleSpecifier.text);
  }
  return specifiers;
}
