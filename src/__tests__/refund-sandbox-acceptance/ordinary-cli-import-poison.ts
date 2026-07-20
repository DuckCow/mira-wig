import { register } from "node:module";

const hookSource = `
const blockedSpecifiers = new Set([
  "dotenv/config",
  "@prisma/client",
  "@prisma/adapter-pg",
  "pg",
]);
const blockedUrlFragments = [
  "/scripts/refund-sandbox-acceptance/cli-runtime.ts",
  "/scripts/refund-sandbox-acceptance/database-context.ts",
  "/scripts/refund-sandbox-acceptance/credential-guard.ts",
  "/scripts/refund-sandbox-acceptance/scenario-orchestrator.ts",
  "/scripts/refund-sandbox-acceptance/bootstrap.ts",
  "/scripts/refund-sandbox-acceptance/bootstrap-projection.ts",
  "/src/lib/payment/refund/providers/toss/refund-cancellation-http.ts",
  "/src/lib/payment/refund/providers/toss/refund-lookup-http.ts",
  "/src/lib/payment/refund/run-refund-execution-worker-cycle.ts",
  "/src/lib/payment/refund/worker-router.ts",
];

export async function resolve(specifier, context, nextResolve) {
  if (blockedSpecifiers.has(specifier)) {
    throw new Error("TEST_FORBIDDEN_PRODUCTION_IMPORT");
  }
  const resolved = await nextResolve(specifier, context);
  if (blockedUrlFragments.some((fragment) => resolved.url.includes(fragment))) {
    throw new Error("TEST_FORBIDDEN_PRODUCTION_IMPORT");
  }
  return resolved;
}
`;

register(`data:text/javascript,${encodeURIComponent(hookSource)}`, import.meta.url);
