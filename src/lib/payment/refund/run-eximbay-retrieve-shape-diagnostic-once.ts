import { PrismaClient, type Payment } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { parseEximbayRefundCanaryEnvironment } from "./eximbay-refund-canary-environment";
import { readExactEximbayRefundCanarySecret } from "./eximbay-refund-canary-secret-reader";
import { createAuthenticatedEximbayRefundRestFetch, createEximbayRefundRestCredentials, type EximbayRefundRestFetch } from "./providers/eximbay/authenticated-transport";
import { boundedEximbayRefundIdentifier, createEximbayRefundPreflightConfig } from "./providers/eximbay/preflight-contract";
import { createEximbayRefundRetrievePlan, diagnoseEximbayRefundRetrieve, type EximbayRefundRetrieveExpectation } from "./providers/eximbay/preflight-retrieve";
import { type RetrieveDiagnosticResult, diagnosticResult } from "./retrieve-diagnostic-result";

export const RETRIEVE_DIAGNOSTIC_PAYMENT_ID = "MIRA_EXIMBAY_RETRIEVE_DIAGNOSTIC_PAYMENT_ID";
type Environment = Readonly<Record<string, string | undefined>>;
const SELECT = Object.freeze({ id: true, provider: true, mode: true, status: true, amount: true,
  currency: true, providerOrderId: true, providerPaymentKey: true } as const);
type DiagnosticPayment = Pick<Payment, keyof typeof SELECT>;
export type RetrieveDiagnosticDatabase = Readonly<{
  payment: Readonly<{ findUnique(input: Readonly<{ where: Readonly<{ id: string }>; select: typeof SELECT }>): Promise<DiagnosticPayment | null> }>;
  $disconnect(): Promise<void>;
}>;
export type RetrieveDiagnosticDependencies = Readonly<{
  createDatabase(env: Environment): RetrieveDiagnosticDatabase;
  readSecret: typeof readExactEximbayRefundCanarySecret;
  fetch: EximbayRefundRestFetch;
}>;
const DEFAULTS: RetrieveDiagnosticDependencies = Object.freeze({
  createDatabase: (env) => {
    if (!env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  },
  readSecret: readExactEximbayRefundCanarySecret,
  fetch: globalThis.fetch,
});
export function diagnosticPaymentId(env: Environment): string | null {
  const value = env[RETRIEVE_DIAGNOSTIC_PAYMENT_ID];
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
}
export async function runEximbayRetrieveShapeDiagnosticOnce(
  env: Environment,
  dependencies: RetrieveDiagnosticDependencies = DEFAULTS,
): Promise<RetrieveDiagnosticResult> {
  const id = diagnosticPaymentId(env);
  const authority = parseEximbayRefundCanaryEnvironment(env);
  if (!id || !authority) return diagnosticResult("CONFIG_INVALID");
  let database: RetrieveDiagnosticDatabase;
  try { database = dependencies.createDatabase(env); }
  catch { return diagnosticResult("DATABASE_UNAVAILABLE"); }
  let result: RetrieveDiagnosticResult;
  let disconnected = true;
  try { result = await readAndDiagnose(database, id, authority, dependencies); }
  catch { result = diagnosticResult("DATABASE_READ_FAILED"); }
  finally {
    try { await database.$disconnect(); }
    catch { disconnected = false; }
  }
  return disconnected ? result : { ...result, ok: false, databaseDisconnected: false };
}
async function readAndDiagnose(
  database: RetrieveDiagnosticDatabase,
  id: string,
  authority: NonNullable<ReturnType<typeof parseEximbayRefundCanaryEnvironment>>,
  dependencies: RetrieveDiagnosticDependencies,
): Promise<RetrieveDiagnosticResult> {
  const payment = await database.payment.findUnique({ where: { id }, select: SELECT });
  if (!payment) return diagnosticResult("PAYMENT_NOT_FOUND");
  const expectation = paymentExpectation(payment, id);
  if (!expectation) return diagnosticResult("PAYMENT_INVALID");
  let transport: EximbayRefundRestFetch;
  try {
    const secret = await dependencies.readSecret({ resource: authority.secretResource, version: authority.secretVersion });
    transport = createAuthenticatedEximbayRefundRestFetch(createEximbayRefundRestCredentials(secret), dependencies.fetch);
  } catch { return diagnosticResult("CREDENTIAL_UNAVAILABLE"); }
  let inquiryCount: 0 | 1 = 0;
  const retrieve: EximbayRefundRestFetch = (input, init) => {
    if (inquiryCount !== 0) throw new Error("DIAGNOSTIC_INQUIRY_LIMIT");
    inquiryCount = 1;
    return transport(input, init);
  };
  try {
    const config = createEximbayRefundPreflightConfig({ ...authority, mode: "SANDBOX" });
    const observation = await diagnoseEximbayRefundRetrieve(createEximbayRefundRetrievePlan(config, expectation), retrieve);
    return { ...diagnosticResult("DIAGNOSTIC_COMPLETE"), inquiryCount, ...observation };
  } catch { return { ...diagnosticResult("DIAGNOSTIC_FAILED"), inquiryCount }; }
}
function paymentExpectation(payment: DiagnosticPayment, id: string): EximbayRefundRetrieveExpectation | null {
  if (![payment.id === id, payment.provider === "EXIMBAY", payment.mode === "SANDBOX",
    payment.status === "SUCCEEDED", Number.isInteger(payment.amount), payment.amount > 0,
    payment.amount <= 2_147_483_647].every(Boolean)) return null;
  if (payment.currency !== "USD" && payment.currency !== "JPY") return null;
  const providerOrderId = boundedEximbayRefundIdentifier(payment.providerOrderId);
  const providerTransactionId = boundedEximbayRefundIdentifier(payment.providerPaymentKey);
  if (!providerOrderId || !providerTransactionId) return null;
  return { providerOrderId, providerTransactionId, currency: payment.currency, originalAmount: payment.amount };
}
