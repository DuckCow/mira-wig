import { emptyRetrieveShapeDiagnostic, summarizeShape, ROOT_FIELDS, PAYMENT_FIELDS, CARD_FIELDS, OTHER_FIELDS, type RetrieveShapeDiagnostic, type RetrieveShapeFailure } from "./retrieve-shape-diagnostic";
import { PaymentMode } from "@prisma/client";
import { decodeEximbayAmount, encodeEximbayAmount } from "@/lib/payment/providers/eximbay/amount";
import { isRecord, requireExactKeys, requireExactText } from "@/lib/payment/providers/eximbay/validation";
import type { EximbayCurrency } from "@/lib/payment/providers/eximbay/types";
import {
  boundedEximbayRefundIdentifier,
  normalizeEximbayRefundPreflightFacts,
  type EximbayRefundPreflightConfig,
  type EximbayRefundPreflightFacts,
} from "./preflight-contract";

export const EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_BYTES = 65_536;
export const EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_CHUNKS = 256;
export const EXIMBAY_REFUND_RETRIEVE_DEADLINE_MS = 15_000;

const POSTGRES_INT_MAX = 2_147_483_647;
const UTF8_ENCODER = new TextEncoder();
const ENDPOINTS = Object.freeze({
  SANDBOX: "https://api-test.eximbay.com/v1/payments/retrieve",
});
const planAuthorities = new WeakMap<object, RetrieveAuthority>();
const executedPlans = new WeakSet<object>();

export type EximbayRefundRetrieveExpectation = Readonly<{
  providerOrderId: string;
  providerTransactionId: string;
  currency: EximbayCurrency;
  originalAmount: number;
}>;

interface RetrieveAuthority {
  readonly config: EximbayRefundPreflightConfig;
  readonly expectation: EximbayRefundRetrieveExpectation;
}

export interface EximbayRefundRetrievePlan {
  readonly mode: "SANDBOX";
  readonly endpoint: string;
  readonly method: "POST";
  readonly contentType: "application/json";
  readonly body: string;
}

export type EximbayRefundRetrieveTransport = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type EximbayRefundRetrieveFailureCode =
  | "TRANSPORT_FAILURE"
  | "NON_2XX"
  | "INVALID_CONTENT_TYPE"
  | "BODY_TOO_LARGE"
  | "TOO_MANY_RESPONSE_CHUNKS"
  | "INVALID_RESPONSE_CHUNK"
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "DUPLICATE_JSON_KEY"
  | "UNKNOWN_SHAPE"
  | "PROVIDER_NON_SUCCESS"
  | "IDENTITY_MISMATCH"
  | "MONEY_MISMATCH"
  | "INVALID_BALANCE"
  | "UNSUPPORTED_STATUS";

export type EximbayRefundRetrieveResult =
  | Readonly<{ kind: "admitted"; facts: EximbayRefundPreflightFacts }>
  | Readonly<{ kind: "notAdmitted"; code: EximbayRefundRetrieveFailureCode; failureKind: "REJECTION" | "EXCEPTION"; responseReceived?: boolean; httpStatus?: number | null }>;

export function createEximbayRefundRetrievePlan(
  config: EximbayRefundPreflightConfig,
  expectation: EximbayRefundRetrieveExpectation,
): EximbayRefundRetrievePlan {
  const providerOrderId = boundedEximbayRefundIdentifier(expectation.providerOrderId);
  const providerTransactionId = boundedEximbayRefundIdentifier(expectation.providerTransactionId);
  if (!providerOrderId || !providerTransactionId) throw new Error("INVALID_EXIMBAY_RETRIEVE_IDENTITY");
  const amount = encodeEximbayAmount(expectation.currency, expectation.originalAmount);
  const admittedExpectation = Object.freeze({
    providerOrderId,
    providerTransactionId,
    currency: expectation.currency,
    originalAmount: expectation.originalAmount,
  });
  const plan = Object.freeze({
    mode: PaymentMode.SANDBOX,
    endpoint: ENDPOINTS.SANDBOX,
    method: "POST" as const,
    contentType: "application/json" as const,
    body: JSON.stringify({
      mid: config.mid,
      key_field: "transaction_id",
      payment: {
        order_id: providerOrderId,
        currency: expectation.currency,
        amount,
        transaction_id: providerTransactionId,
        lang: expectation.currency === "JPY" ? "JP" : "EN",
      },
    }),
  });
  planAuthorities.set(plan, Object.freeze({ config, expectation: admittedExpectation }));
  return plan;
}

export async function executeEximbayRefundRetrieve(
  plan: EximbayRefundRetrievePlan,
  transport: EximbayRefundRetrieveTransport,
): Promise<EximbayRefundRetrieveResult> {
  return executeRetrieve(plan, transport);
}

export async function diagnoseEximbayRefundRetrieve(
  plan: EximbayRefundRetrievePlan,
  transport: EximbayRefundRetrieveTransport,
): Promise<Readonly<{ parserResult: "ADMITTED" | EximbayRefundRetrieveFailureCode; shape: RetrieveShapeDiagnostic }>> {
  const shape = emptyRetrieveShapeDiagnostic();
  const result = await executeRetrieve(plan, transport, shape);
  return Object.freeze({ parserResult: result.kind === "admitted" ? "ADMITTED" : result.code, shape });
}

async function executeRetrieve(
  plan: EximbayRefundRetrievePlan,
  transport: EximbayRefundRetrieveTransport,
  diagnostic?: RetrieveShapeDiagnostic,
): Promise<EximbayRefundRetrieveResult> {
  const authority = planAuthorities.get(plan);
  if (!authority) throw new Error("UNTRUSTED_EXIMBAY_REFUND_RETRIEVE_PLAN");
  if (executedPlans.has(plan)) throw new Error("EXIMBAY_REFUND_RETRIEVE_PLAN_REUSED");
  executedPlans.add(plan);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), EXIMBAY_REFUND_RETRIEVE_DEADLINE_MS);
  let responseReceived = false;
  let httpStatus: number | null = null;
  try {
    const response = await transport(plan.endpoint, {
      method: plan.method,
      headers: { "Content-Type": plan.contentType },
      body: plan.body,
      redirect: "error",
      signal: controller.signal,
    });
    responseReceived = true;
    httpStatus = safeHttpStatus(response.status);
    if (diagnostic) {
      diagnostic.httpStatus = httpStatus;
      diagnostic.contentTypeClass = admittedJsonContentType(response.headers.get("content-type")) ? "JSON" : "OTHER";
    }
    const boundary = await readResponseBoundary(response, diagnostic);
    const result = boundary.ok ? admitResponse(boundary.body, authority, diagnostic) : notAdmitted(boundary.code);
    return result.kind === "admitted" ? result : Object.freeze({ ...result, responseReceived, httpStatus });
  } catch {
    return Object.freeze({ ...notAdmitted("TRANSPORT_FAILURE"), failureKind: "EXCEPTION", responseReceived, httpStatus });
  } finally {
    clearTimeout(deadline);
  }
}

function admitResponse(
  body: string,
  authority: RetrieveAuthority,
  diagnostic?: RetrieveShapeDiagnostic,
): EximbayRefundRetrieveResult {
  const parsed = parseClosedJson(body);
  if (!parsed.ok) return notAdmitted(parsed.code);
  observeParsedShape(parsed.value, diagnostic);
  if (!isRecord(parsed.value)) return shapeFailure(diagnostic, "ROOT_NOT_OBJECT");
  return admitRoot(parsed.value, authority, diagnostic);
}

type BoundaryFailure = Readonly<{
  ok: false;
  code: "NON_2XX" | "INVALID_CONTENT_TYPE" | "BODY_TOO_LARGE"
    | "TOO_MANY_RESPONSE_CHUNKS" | "INVALID_RESPONSE_CHUNK" | "INVALID_UTF8";
}>;
type ResponseBoundary =
  | Readonly<{ ok: true; body: string }>
  | BoundaryFailure;
type ByteBoundary = Readonly<{ ok: true; body: Uint8Array }> | BoundaryFailure;

async function readResponseBoundary(response: Response, diagnostic?: RetrieveShapeDiagnostic): Promise<ResponseBoundary> {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    return boundaryFailure("NON_2XX");
  }
  if (!admittedJsonContentType(response.headers.get("content-type"))) {
    return boundaryFailure("INVALID_CONTENT_TYPE");
  }
  const bytes = await readBoundedBody(response.body);
  if (!bytes.ok) return bytes;
  if (diagnostic) diagnostic.bodyByteLength = bytes.body.byteLength;
  try {
    return Object.freeze({ ok: true, body: new TextDecoder("utf-8", { fatal: true }).decode(bytes.body) });
  } catch {
    return boundaryFailure("INVALID_UTF8");
  }
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
): Promise<ByteBoundary> {
  if (!body) return Object.freeze({ ok: true, body: new Uint8Array() });
  const reader = body.getReader();
  const output = new Uint8Array(EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_BYTES);
  let length = 0;
  let chunks = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      chunks += 1;
      if (chunks > EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_CHUNKS) {
        return boundaryFailure("TOO_MANY_RESPONSE_CHUNKS");
      }
      if (!(next.value instanceof Uint8Array)) {
        return boundaryFailure("INVALID_RESPONSE_CHUNK");
      }
      if (next.value.byteLength > EXIMBAY_REFUND_RETRIEVE_MAX_RESPONSE_BYTES - length) {
        return boundaryFailure("BODY_TOO_LARGE");
      }
      output.set(next.value, length);
      length += next.value.byteLength;
    }
    return Object.freeze({ ok: true, body: output.slice(0, length) });
  } finally {
    try { await reader.cancel(); } catch { /* boundary cleanup is best effort */ }
    reader.releaseLock();
  }
}

function boundaryFailure(code: BoundaryFailure["code"]): BoundaryFailure {
  return Object.freeze({ ok: false, code });
}

function admitRoot(
  root: Record<string, unknown>,
  authority: RetrieveAuthority,
  diagnostic?: RetrieveShapeDiagnostic,
): EximbayRefundRetrieveResult {
  try {
    if (root.rescode === "0000") {
      requireExactKeys(root, ["rescode", "resmsg", "mid", "payment"], ["card_info", "other_param"]);
    } else {
      requireExactKeys(root, ["rescode", "resmsg"]);
    }
  } catch {
    return shapeFailure(diagnostic, "ROOT_KEY_SET_MISMATCH");
  }
  if (!boundedText(root.rescode, 32) || !boundedText(root.resmsg, 4_096)) {
    return shapeFailure(diagnostic, "ROOT_REQUIRED_TEXT_INVALID");
  }
  if (root.rescode !== "0000") return notAdmitted("PROVIDER_NON_SUCCESS");
  if (!isRecord(root.payment)) return shapeFailure(diagnostic, "PAYMENT_NOT_OBJECT");
  if (!optionalRootEnvelopeValid(root)) return shapeFailure(diagnostic, "OPTIONAL_ROOT_ENVELOPE_INVALID");
  return admitPayment(root.mid, root.payment, authority, diagnostic);
}

function admitPayment(
  rootMid: unknown,
  payment: Record<string, unknown>,
  authority: RetrieveAuthority,
  diagnostic?: RetrieveShapeDiagnostic,
): EximbayRefundRetrieveResult {
  try {
    requireExactKeys(payment, [
      "order_id", "currency", "amount", "transaction_id", "status", "transaction_date", "balance",
    ], ["auth_code", "payment_method"]);
  } catch {
    return shapeFailure(diagnostic, "PAYMENT_KEY_SET_MISMATCH");
  }
  if (!optionalPaymentEnvelopeValid(payment)) return shapeFailure(diagnostic, "OPTIONAL_PAYMENT_ENVELOPE_INVALID");
  const identity = retrieveIdentity(rootMid, payment);
  if (!identity) return shapeFailure(diagnostic, "IDENTITY_SHAPE_INVALID");
  if (!identityMatches(identity, authority)) return notAdmitted("IDENTITY_MISMATCH");
  const semanticFailure = observePaymentSemanticFailure(payment, diagnostic);
  if (semanticFailure) return semanticFailure;
  const money = admittedMoney(payment, authority.expectation, diagnostic);
  if (!money.ok) {
    return notAdmitted(money.code);
  }
  const amounts = money.amounts;
  const facts = normalizeEximbayRefundPreflightFacts({
    ...identity,
    providerStatus: "SALE",
    currency: authority.expectation.currency,
    ...amounts,
  });
  return facts ? Object.freeze({ kind: "admitted", facts }) : notAdmitted("INVALID_BALANCE");
}

function optionalRootEnvelopeValid(root: Record<string, unknown>): boolean {
  return optionalCardInfoValid(root) && optionalOtherParamValid(root);
}

function optionalCardInfoValid(root: Record<string, unknown>): boolean {
  if (!Object.hasOwn(root, "card_info")) return true;
  if (!isRecord(root.card_info)) return false;
  const cardFields = documentedCardFields(root.card_info);
  if (!cardFields) return false;
  return cardFields.every((value) => /^[0-9]{4}$/u.test(boundedText(value, 4) ?? ""));
}

function documentedCardFields(
  cardInfo: Record<string, unknown>,
): readonly [unknown, unknown] | null {
  try {
    requireExactKeys(cardInfo, [], ["card_number1", "card_number4", "cardno1", "cardno4"]);
  } catch {
    return null;
  }
  const signature = Object.keys(cardInfo).sort().join(",");
  if (signature === "card_number1,card_number4") {
    return [cardInfo.card_number1, cardInfo.card_number4];
  }
  return signature === "cardno1,cardno4" ? [cardInfo.cardno1, cardInfo.cardno4] : null;
}

function optionalOtherParamValid(root: Record<string, unknown>): boolean {
  if (!Object.hasOwn(root, "other_param")) return true;
  if (!isRecord(root.other_param)) return false;
  const otherParam = root.other_param;
  try {
    requireExactKeys(otherParam, [], ["param1", "param2"]);
  } catch {
    return false;
  }
  return ["param1", "param2"].every((key) => (
    !Object.hasOwn(otherParam, key) || Boolean(boundedText(otherParam[key], 255))
  ));
}

function optionalPaymentEnvelopeValid(payment: Record<string, unknown>): boolean {
  return (!Object.hasOwn(payment, "auth_code") || Boolean(boundedText(payment.auth_code, 128)))
    && (!Object.hasOwn(payment, "payment_method") || Boolean(boundedText(payment.payment_method, 128)));
}

type AdmittedMoney =
  | Readonly<{ ok: true; amounts: Readonly<{ originalAmount: number; refundableBalance: number }> }>
  | Readonly<{ ok: false; code: "MONEY_MISMATCH" | "INVALID_BALANCE" }>;

function admittedMoney(
  payment: Record<string, unknown>,
  expectation: EximbayRefundRetrieveExpectation,
  diagnostic?: RetrieveShapeDiagnostic,
): AdmittedMoney {
  if (payment.currency !== expectation.currency) {
    return Object.freeze({ ok: false, code: "MONEY_MISMATCH" });
  }
  const amounts = retrieveAmounts(payment, expectation.currency, diagnostic);
  if (!amounts) return Object.freeze({ ok: false, code: "INVALID_BALANCE" });
  return amounts.originalAmount === expectation.originalAmount
    ? Object.freeze({ ok: true, amounts })
    : Object.freeze({ ok: false, code: "MONEY_MISMATCH" });
}

function paymentSemanticFailure(
  payment: Record<string, unknown>,
): "UNSUPPORTED_STATUS" | "UNKNOWN_SHAPE" | null {
  if (payment.status !== "SALE" || !boundedText(payment.status, 32)) {
    return "UNSUPPORTED_STATUS";
  }
  return /^[0-9]{14}$/u.test(boundedText(payment.transaction_date, 32) ?? "")
    ? null
    : "UNKNOWN_SHAPE";
}

function retrieveIdentity(
  rootMid: unknown,
  payment: Record<string, unknown>,
): Readonly<{ mid: string; providerOrderId: string; providerTransactionId: string }> | null {
  const mid = boundedEximbayRefundIdentifier(rootMid);
  const providerOrderId = boundedEximbayRefundIdentifier(payment.order_id);
  const providerTransactionId = boundedEximbayRefundIdentifier(payment.transaction_id);
  return mid && providerOrderId && providerTransactionId
    ? Object.freeze({ mid, providerOrderId, providerTransactionId })
    : null;
}

function identityMatches(
  identity: Readonly<{ mid: string; providerOrderId: string; providerTransactionId: string }>,
  authority: RetrieveAuthority,
): boolean {
  return identity.mid === authority.config.mid
    && identity.providerOrderId === authority.expectation.providerOrderId
    && identity.providerTransactionId === authority.expectation.providerTransactionId;
}

function retrieveAmounts(
  payment: Record<string, unknown>,
  currency: EximbayCurrency,
  diagnostic?: RetrieveShapeDiagnostic,
): Readonly<{ originalAmount: number; refundableBalance: number }> | null {
  let stage: RetrieveShapeFailure = "OTHER_EXACT_STRUCTURAL_FAILURE";
  try {
    const originalAmount = decodeEximbayAmount(currency, payment.amount);
    stage = "BALANCE_SHAPE_INVALID";
    const refundableBalance = decodeNonnegativeAmount(currency, payment.balance);
    if (refundableBalance > originalAmount) return null;
    return Object.freeze({ originalAmount, refundableBalance });
  } catch {
    if (diagnostic) diagnostic.firstFailure = stage;
    return null;
  }
}

function decodeNonnegativeAmount(currency: EximbayCurrency, value: unknown): number {
  if (typeof value !== "string") throw new Error("INVALID_EXIMBAY_BALANCE");
  const digits = currency === "JPY" ? jpyDigits(value) : usdDigits(value);
  let amount = 0;
  for (const digit of digits) {
    amount = amount * 10 + digit.charCodeAt(0) - 48;
    if (amount > POSTGRES_INT_MAX) throw new Error("INVALID_EXIMBAY_BALANCE");
  }
  return amount;
}

function jpyDigits(value: string): string {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error("INVALID_EXIMBAY_BALANCE");
  return value;
}

function usdDigits(value: string): string {
  if (!/^(?:0|[1-9][0-9]*)\.[0-9]{2}$/u.test(value)) {
    throw new Error("INVALID_EXIMBAY_BALANCE");
  }
  return value.replace(".", "");
}

function boundedText(value: unknown, maxBytes: number): string | null {
  try {
    const text = requireExactText(value, "INVALID_EXIMBAY_RETRIEVE_TEXT");
    return UTF8_ENCODER.encode(text).byteLength <= maxBytes ? text : null;
  } catch {
    return null;
  }
}

function admittedJsonContentType(value: string | null): boolean {
  return typeof value === "string"
    && /^[\t ]*application\/json(?:[\t ]*;[\t ]*charset[\t ]*=[\t ]*utf-8)?[\t ]*$/iu.test(value);
}

function notAdmitted(code: EximbayRefundRetrieveFailureCode): EximbayRefundRetrieveResult {
  return Object.freeze({ kind: "notAdmitted", code, failureKind: "REJECTION" });
}

type ClosedJson =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; code: "INVALID_JSON" | "DUPLICATE_JSON_KEY" }>;

function parseClosedJson(text: string): ClosedJson {
  try {
    new NoDuplicateJsonScanner(text).scan();
    const value: unknown = JSON.parse(text);
    return Object.freeze({ ok: true, value });
  } catch (error) {
    if (error instanceof ClosedJsonError && error.code === "DUPLICATE_JSON_KEY") {
      return Object.freeze({ ok: false, code: error.code });
    }
    return Object.freeze({ ok: false, code: "INVALID_JSON" });
  }
}

type ObjectState = "keyOrEnd" | "colon" | "value" | "commaOrEnd";
type ArrayState = "valueOrEnd" | "value" | "commaOrEnd";
interface ObjectContext { readonly kind: "object"; readonly keys: Set<string>; state: ObjectState }
interface ArrayContext { readonly kind: "array"; state: ArrayState }
type JsonContext = ObjectContext | ArrayContext;

class ClosedJsonError extends Error {
  constructor(readonly code: "INVALID_JSON" | "DUPLICATE_JSON_KEY") { super(code); }
}

class NoDuplicateJsonScanner {
  readonly #contexts: JsonContext[] = [];
  readonly #text: string;
  #index = 0;

  constructor(text: string) { this.#text = text; }

  scan(): void {
    this.#whitespace();
    this.#value();
    while (this.#contexts.length > 0) this.#scanContext();
    this.#whitespace();
    if (this.#index !== this.#text.length) this.#invalid();
  }

  #scanContext(): void {
    const context = this.#contexts[this.#contexts.length - 1];
    if (!context) return this.#invalid();
    if (context.kind === "object") return this.#object(context);
    this.#array(context);
  }

  #object(context: ObjectContext): void {
    this.#whitespace();
    if (context.state === "keyOrEnd") return this.#objectKey(context);
    if (context.state === "colon") return this.#objectColon(context);
    if (context.state === "value") return this.#objectValue(context);
    this.#objectEnd(context);
  }

  #objectKey(context: ObjectContext): void {
    if (this.#consume("}")) return void this.#contexts.pop();
    const key = this.#string();
    if (context.keys.has(key)) this.#duplicate();
    context.keys.add(key);
    context.state = "colon";
  }

  #objectColon(context: ObjectContext): void { this.#expect(":"); context.state = "value"; }
  #objectValue(context: ObjectContext): void { context.state = "commaOrEnd"; this.#value(); }
  #objectEnd(context: ObjectContext): void {
    if (this.#consume("}")) return void this.#contexts.pop();
    this.#expect(",");
    context.state = "keyOrEnd";
  }

  #array(context: ArrayContext): void {
    this.#whitespace();
    if (context.state === "valueOrEnd") return this.#arrayFirst(context);
    if (context.state === "value") return this.#arrayValue(context);
    this.#arrayEnd(context);
  }

  #arrayFirst(context: ArrayContext): void {
    if (this.#consume("]")) return void this.#contexts.pop();
    context.state = "commaOrEnd";
    this.#value();
  }

  #arrayValue(context: ArrayContext): void { context.state = "commaOrEnd"; this.#value(); }
  #arrayEnd(context: ArrayContext): void {
    if (this.#consume("]")) return void this.#contexts.pop();
    this.#expect(",");
    context.state = "value";
  }

  #value(): void {
    this.#whitespace();
    const token = this.#text[this.#index];
    if (token === "{") return this.#beginObject();
    if (token === "[") return this.#beginArray();
    if (token === "\"") return void this.#string();
    if (token === "t") return this.#literal("true");
    if (token === "f") return this.#literal("false");
    if (token === "n") return this.#literal("null");
    this.#number();
  }

  #beginObject(): void {
    this.#expect("{");
    this.#contexts.push({ kind: "object", keys: new Set<string>(), state: "keyOrEnd" });
  }

  #beginArray(): void {
    this.#expect("[");
    this.#contexts.push({ kind: "array", state: "valueOrEnd" });
  }

  #string(): string {
    const start = this.#index;
    this.#expect("\"");
    while (this.#index < this.#text.length) {
      const character = this.#text[this.#index];
      this.#index += 1;
      if (character === "\"") return this.#decodedString(start);
      if (character === "\\") this.#escape();
      else if (!character || character.charCodeAt(0) <= 0x1f) this.#invalid();
    }
    return this.#invalid();
  }

  #decodedString(start: number): string {
    const value: unknown = JSON.parse(this.#text.slice(start, this.#index));
    return typeof value === "string" ? value : this.#invalid();
  }

  #escape(): void {
    const escaped = this.#text[this.#index];
    this.#index += 1;
    if (escaped !== "u") {
      if (!escaped || !"\"\\/bfnrt".includes(escaped)) this.#invalid();
      return;
    }
    const unicode = this.#text.slice(this.#index, this.#index + 4);
    if (!/^[0-9a-fA-F]{4}$/u.test(unicode)) this.#invalid();
    this.#index += 4;
  }

  #number(): void {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(this.#text.slice(this.#index));
    if (!match) return this.#invalid();
    this.#index += match[0].length;
  }

  #literal(value: string): void {
    if (!this.#text.startsWith(value, this.#index)) return this.#invalid();
    this.#index += value.length;
  }

  #whitespace(): void {
    while (/^[\t\n\r ]$/u.test(this.#text[this.#index] ?? "")) this.#index += 1;
  }

  #expect(value: string): void { if (!this.#consume(value)) this.#invalid(); }
  #consume(value: string): boolean {
    if (this.#text[this.#index] !== value) return false;
    this.#index += 1;
    return true;
  }

  #invalid(): never { throw new ClosedJsonError("INVALID_JSON"); }
  #duplicate(): never { throw new ClosedJsonError("DUPLICATE_JSON_KEY"); }
}

function safeHttpStatus(status: number): number | null {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

function shapeFailure(diagnostic: RetrieveShapeDiagnostic | undefined, failure: RetrieveShapeFailure): EximbayRefundRetrieveResult {
  if (diagnostic) diagnostic.firstFailure = failure;
  return notAdmitted("UNKNOWN_SHAPE");
}

function observePaymentSemanticFailure(payment: Record<string, unknown>, diagnostic?: RetrieveShapeDiagnostic): EximbayRefundRetrieveResult | null {
  const failure = paymentSemanticFailure(payment);
  if (failure === "UNKNOWN_SHAPE") return shapeFailure(diagnostic, "TRANSACTION_DATE_SHAPE_INVALID");
  return failure ? notAdmitted(failure) : null;
}

function observeParsedShape(value: unknown, diagnostic?: RetrieveShapeDiagnostic): void {
  if (!diagnostic) return;
  diagnostic.jsonParseSuccess = true;
  diagnostic.root = summarizeShape(value, ROOT_FIELDS);
  if (!isRecord(value)) return;
  if (Object.hasOwn(value, "payment")) diagnostic.payment = summarizeShape(value.payment, PAYMENT_FIELDS);
  if (Object.hasOwn(value, "card_info")) diagnostic.cardInfo = summarizeShape(value.card_info, CARD_FIELDS);
  if (Object.hasOwn(value, "other_param")) diagnostic.otherParam = summarizeShape(value.other_param, OTHER_FIELDS);
}
