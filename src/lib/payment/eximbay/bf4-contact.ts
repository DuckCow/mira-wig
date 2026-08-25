import "server-only";
import {
  EXIMBAY_LIVE_API_KEY,
  EXIMBAY_LIVE_MID,
  EXIMBAY_SANDBOX_API_KEY,
  EXIMBAY_SANDBOX_MID,
  type ProviderEnv,
} from "@/lib/payment/providers/credentials";
import { classifyEximbayInquiryStatus, type EximbayInquiryStatus } from "@/lib/payment/providers/eximbay/inquiry-status";
import { requireEximbayMode, type EximbayPaymentMode } from "@/lib/payment/providers/eximbay/types";
import { isRecord, requireExactKeys, requireExactText } from "@/lib/payment/providers/eximbay/validation";

export const EXIMBAY_BF4_TOTAL_DEADLINE_MS = 15_000;
export const EXIMBAY_BF4_MAX_RESPONSE_BYTES = 65_536;
export const EXIMBAY_BF4_MAX_RESPONSE_CHUNKS = 256;

const ENDPOINTS: Readonly<Record<EximbayPaymentMode, Readonly<{
  verify: string;
  retrieve: string;
}>>> = Object.freeze({
  SANDBOX: Object.freeze({
    verify: "https://api-test.eximbay.com/v1/payments/verify",
    retrieve: "https://api-test.eximbay.com/v1/payments/retrieve",
  }),
  LIVE: Object.freeze({
    verify: "https://api.eximbay.com/v1/payments/verify",
    retrieve: "https://api.eximbay.com/v1/payments/retrieve",
  }),
});
const configBrand: unique symbol = Symbol("EximbayBf4Config");
const configs = new WeakMap<object, EximbayBf4ConfigAuthority>();
const preparedContactBrand: unique symbol = Symbol("PreparedEximbayBf4Contact");
const preparedContacts = new WeakMap<object, PreparedContactAuthority>();
const executedContacts = new WeakSet<object>();
const UTF8_ENCODER = new TextEncoder();

interface EximbayBf4ConfigAuthority {
  readonly mode: EximbayPaymentMode;
  readonly mid: string;
  readonly apiKey: string;
  readonly credentialBinding: string;
}

interface PreparedContactAuthority {
  readonly config: EximbayBf4ConfigAuthority;
  readonly endpoint: string;
  readonly body: string;
}

export interface EximbayBf4Config {
  readonly [configBrand]: true;
}

export interface EximbayBf4ConfigFacts {
  readonly mode: EximbayPaymentMode;
  readonly mid: string;
  readonly credentialBinding: string;
}

export interface PreparedEximbayBf4Contact {
  readonly [preparedContactBrand]: true;
}

export type EximbayBf4Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type EximbayBf4ContactFailureCode =
  | "TRANSPORT_FAILURE"
  | "NON_2XX"
  | "INVALID_CONTENT_TYPE"
  | "BODY_TOO_LARGE"
  | "TOO_MANY_RESPONSE_CHUNKS"
  | "INVALID_RESPONSE_CHUNK"
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "DUPLICATE_JSON_KEY"
  | "INVALID_ROOT"
  | "UNKNOWN_SHAPE"
  | "PROVIDER_NON_SUCCESS";

export type EximbayBf4VerifyResult =
  | Readonly<{ kind: "admitted"; rescode: "0000"; resmsg: string }>
  | Readonly<{ kind: "outcomeUnknown"; code: EximbayBf4ContactFailureCode }>;

export interface EximbayBf4RetrieveRequest {
  readonly providerOrderId: string;
  readonly transactionId: string;
  readonly currency: string;
  readonly amountWire: string;
  readonly language: "EN" | "JP";
}

export interface EximbayBf4RetrievedPayment {
  readonly mid: string;
  readonly orderId: string;
  readonly currency: string;
  readonly amount: string;
  readonly transactionId: string;
  readonly status: EximbayInquiryStatus;
  readonly transactionDate: string;
}

export type EximbayBf4RetrieveResult =
  | Readonly<{ kind: "admitted"; rescode: "0000"; resmsg: string; payment: EximbayBf4RetrievedPayment }>
  | Readonly<{ kind: "outcomeUnknown"; code: EximbayBf4ContactFailureCode }>;

export interface EximbayCheckoutRecoveryRetrieveRequest {
  readonly providerOrderId: string;
  readonly currency: string;
  readonly amountWire: string;
  readonly language: "EN" | "JP";
}

export type EximbayCheckoutRecoveryRetrieveResult =
  | Readonly<{ kind: "q004"; rescode: "Q004"; resmsg: string }>
  | Readonly<{ kind: "transactionObserved"; rescode: string }>
  | Readonly<{ kind: "outcomeUnknown"; code: EximbayBf4ContactFailureCode }>;

export type EximbayBf4ConfigErrorCode =
  | "INVALID_MODE"
  | "INVALID_API_KEY"
  | "INVALID_MID"
  | "UNTRUSTED_CONFIG"
  | "CONTACT_ALREADY_EXECUTED"
  | "UNTRUSTED_CONTACT";

export class EximbayBf4ConfigError extends Error {
  constructor(readonly code: EximbayBf4ConfigErrorCode) {
    super(code);
    this.name = "EximbayBf4ConfigError";
  }
}

export function resolveEximbayBf4Config(
  modeInput: unknown,
  env: ProviderEnv,
): EximbayBf4Config {
  const mode = resolveMode(modeInput);
  const names = mode === "SANDBOX"
    ? { apiKey: EXIMBAY_SANDBOX_API_KEY, mid: EXIMBAY_SANDBOX_MID }
    : { apiKey: EXIMBAY_LIVE_API_KEY, mid: EXIMBAY_LIVE_MID };
  const config: EximbayBf4Config = { [configBrand]: true };
  Object.defineProperty(config, configBrand, { enumerable: false });
  configs.set(config, Object.freeze({
    mode,
    apiKey: configText(env[names.apiKey], "INVALID_API_KEY"),
    mid: configText(env[names.mid], "INVALID_MID"),
    credentialBinding: `eximbay:bf4:${mode.toLowerCase()}:v1`,
  }));
  return Object.freeze(config);
}

export function requireEximbayBf4ConfigFacts(config: EximbayBf4Config): EximbayBf4ConfigFacts {
  const authority = requireConfig(config);
  return Object.freeze({
    mode: authority.mode,
    mid: authority.mid,
    credentialBinding: authority.credentialBinding,
  });
}

export async function verifyEximbayBf4Status(
  config: EximbayBf4Config,
  exactRawQuery: string,
  transport: EximbayBf4Fetch,
): Promise<EximbayBf4VerifyResult> {
  const prepared = prepareContact(
    config,
    ENDPOINTS[requireConfig(config).mode].verify,
    JSON.stringify({ data: exactRawQuery }),
  );
  const response = await executePreparedContact(prepared, transport);
  if (!response.ok) return outcomeUnknown(response.code);
  return admitVerify(response.text);
}

export async function retrieveEximbayBf4Status(
  config: EximbayBf4Config,
  request: EximbayBf4RetrieveRequest,
  transport: EximbayBf4Fetch,
): Promise<EximbayBf4RetrieveResult> {
  const authority = requireConfig(config);
  const prepared = prepareContact(config, ENDPOINTS[authority.mode].retrieve, JSON.stringify({
    mid: authority.mid,
    key_field: "transaction_id",
    payment: {
      order_id: request.providerOrderId,
      currency: request.currency,
      amount: request.amountWire,
      transaction_id: request.transactionId,
      lang: request.language,
    },
  }));
  const response = await executePreparedContact(prepared, transport);
  if (!response.ok) return outcomeUnknown(response.code);
  return admitRetrieve(response.text);
}

export async function retrieveEximbayCheckoutRecoveryStatus(
  config: EximbayBf4Config,
  request: EximbayCheckoutRecoveryRetrieveRequest,
  transport: EximbayBf4Fetch,
): Promise<EximbayCheckoutRecoveryRetrieveResult> {
  const authority = requireConfig(config);
  const prepared = prepareContact(config, ENDPOINTS[authority.mode].retrieve, JSON.stringify({
    mid: authority.mid,
    key_field: "order_id",
    payment: {
      order_id: request.providerOrderId,
      currency: request.currency,
      amount: request.amountWire,
      lang: request.language,
    },
  }));
  const response = await executePreparedContact(prepared, transport);
  if (!response.ok) return outcomeUnknown(response.code);
  return admitCheckoutRecoveryRetrieve(response.text);
}

function prepareContact(
  config: EximbayBf4Config,
  endpoint: string,
  body: string,
): PreparedEximbayBf4Contact {
  const prepared: PreparedEximbayBf4Contact = { [preparedContactBrand]: true };
  Object.defineProperty(prepared, preparedContactBrand, { enumerable: false });
  preparedContacts.set(prepared, Object.freeze({ config: requireConfig(config), endpoint, body }));
  return Object.freeze(prepared);
}

type ContactReadResult =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false; code: EximbayBf4ContactFailureCode }>;

async function executePreparedContact(
  prepared: PreparedEximbayBf4Contact,
  transport: EximbayBf4Fetch,
): Promise<ContactReadResult> {
  const authority = preparedContacts.get(prepared);
  if (!authority) throw new EximbayBf4ConfigError("UNTRUSTED_CONTACT");
  if (executedContacts.has(prepared)) throw new EximbayBf4ConfigError("CONTACT_ALREADY_EXECUTED");
  executedContacts.add(prepared);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), EXIMBAY_BF4_TOTAL_DEADLINE_MS);
  try {
    const response = await transport(authority.endpoint, {
      method: "POST",
      headers: {
        Authorization: basicAuthorization(authority.config.apiKey),
        "Content-Type": "application/json",
      },
      body: authority.body,
      redirect: "error",
      signal: controller.signal,
    });
    return await readResponse(response);
  } catch {
    return contactFailure("TRANSPORT_FAILURE");
  } finally {
    clearTimeout(deadline);
  }
}

async function readResponse(response: Response): Promise<ContactReadResult> {
  if (!Number.isInteger(response.status) || response.status < 200 || response.status >= 300) {
    return contactFailure("NON_2XX");
  }
  if (!admittedJsonContentType(response.headers.get("Content-Type"))) {
    return contactFailure("INVALID_CONTENT_TYPE");
  }
  const body = await readBoundedBody(response.body);
  if (!body.ok) return body;
  try {
    return Object.freeze({
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(body.bytes),
    });
  } catch {
    return contactFailure("INVALID_UTF8");
  }
}

type BoundedBodyResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; code: EximbayBf4ContactFailureCode }>;

async function readBoundedBody(body: ReadableStream<Uint8Array> | null): Promise<BoundedBodyResult> {
  if (!body) return Object.freeze({ ok: true, bytes: new Uint8Array() });
  const reader = body.getReader();
  const bytes = new Uint8Array(EXIMBAY_BF4_MAX_RESPONSE_BYTES);
  let count = 0;
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return Object.freeze({ ok: true, bytes: bytes.slice(0, length) });
      count += 1;
      if (count > EXIMBAY_BF4_MAX_RESPONSE_CHUNKS) return contactFailure("TOO_MANY_RESPONSE_CHUNKS");
      if (!(next.value instanceof Uint8Array)) return contactFailure("INVALID_RESPONSE_CHUNK");
      length = appendChunk(bytes, length, next.value);
    }
  } catch (error) {
    if (error instanceof EximbayBf4BodyError) return contactFailure(error.code);
    return contactFailure("TRANSPORT_FAILURE");
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function appendChunk(target: Uint8Array, length: number, chunk: Uint8Array): number {
  const nextLength = length + chunk.byteLength;
  if (nextLength > EXIMBAY_BF4_MAX_RESPONSE_BYTES) return bodyTooLarge();
  if (chunk.byteLength > 0) target.set(chunk, length);
  return nextLength;
}

function bodyTooLarge(): never {
  throw new EximbayBf4BodyError("BODY_TOO_LARGE");
}

class EximbayBf4BodyError extends Error {
  constructor(readonly code: EximbayBf4ContactFailureCode) {
    super(code);
  }
}

function admitVerify(text: string): EximbayBf4VerifyResult {
  const parsed = parseClosedJson(text);
  if (!parsed.ok) return outcomeUnknown(parsed.code);
  if (!isRecord(parsed.value)) return outcomeUnknown("INVALID_ROOT");
  try {
    requireExactKeys(parsed.value, ["rescode", "resmsg"]);
  } catch {
    return outcomeUnknown("UNKNOWN_SHAPE");
  }
  if (typeof parsed.value.rescode !== "string" || typeof parsed.value.resmsg !== "string") {
    return outcomeUnknown("UNKNOWN_SHAPE");
  }
  if (parsed.value.rescode !== "0000") return outcomeUnknown("PROVIDER_NON_SUCCESS");
  return Object.freeze({ kind: "admitted", rescode: "0000", resmsg: parsed.value.resmsg });
}

function admitRetrieve(text: string): EximbayBf4RetrieveResult {
  const parsed = parseClosedJson(text);
  if (!parsed.ok) return outcomeUnknown(parsed.code);
  if (!isRecord(parsed.value)) return outcomeUnknown("INVALID_ROOT");
  const header = retrieveHeader(parsed.value);
  if (!header.ok) return outcomeUnknown(header.code);
  if (header.rescode !== "0000") return outcomeUnknown("PROVIDER_NON_SUCCESS");
  const payment = retrievePayment(parsed.value);
  if (!payment) return outcomeUnknown("UNKNOWN_SHAPE");
  return Object.freeze({ kind: "admitted", rescode: "0000", resmsg: header.resmsg, payment });
}

function admitCheckoutRecoveryRetrieve(text: string): EximbayCheckoutRecoveryRetrieveResult {
  const parsed = parseClosedJson(text);
  if (!parsed.ok) return outcomeUnknown(parsed.code);
  if (!isRecord(parsed.value)) return outcomeUnknown("INVALID_ROOT");
  const header = retrieveHeader(parsed.value);
  if (!header.ok) return outcomeUnknown(header.code);
  if (header.rescode === "Q004") {
    return Object.freeze({ kind: "q004", rescode: "Q004", resmsg: boundedResponseText(header.resmsg, 512) });
  }
  return Object.freeze({ kind: "transactionObserved", rescode: boundedResponseText(header.rescode, 64) });
}

type RetrieveHeader =
  | Readonly<{ ok: true; rescode: string; resmsg: string }>
  | Readonly<{ ok: false; code: "UNKNOWN_SHAPE" }>;

function retrieveHeader(value: Record<string, unknown>): RetrieveHeader {
  const allowed = value.rescode === "0000"
    ? ["mid", "payment", "card_info", "other_param"]
    : [];
  try {
    requireExactKeys(value, ["rescode", "resmsg"], allowed);
    requireOptionalRecord(value, "card_info");
    requireOptionalRecord(value, "other_param");
  } catch {
    return Object.freeze({ ok: false, code: "UNKNOWN_SHAPE" });
  }
  if (typeof value.rescode !== "string" || typeof value.resmsg !== "string") {
    return Object.freeze({ ok: false, code: "UNKNOWN_SHAPE" });
  }
  return Object.freeze({ ok: true, rescode: value.rescode, resmsg: value.resmsg });
}

function retrievePayment(root: Record<string, unknown>): EximbayBf4RetrievedPayment | null {
  if (typeof root.mid !== "string" || !isRecord(root.payment)) return null;
  try {
    requireExactKeys(root.payment, [
      "order_id",
      "currency",
      "amount",
      "transaction_id",
      "status",
      "transaction_date",
    ], ["auth_code", "balance", "payment_method"]);
    requireOptionalString(root.payment, "auth_code");
    requireOptionalString(root.payment, "balance");
    requireOptionalString(root.payment, "payment_method");
    const status = classifyEximbayInquiryStatus(root.payment.status).status;
    return Object.freeze({
      mid: boundedResponseText(root.mid, 512),
      orderId: boundedResponseText(root.payment.order_id, 512),
      currency: boundedResponseText(root.payment.currency, 3),
      amount: boundedResponseText(root.payment.amount, 64),
      transactionId: boundedResponseText(root.payment.transaction_id, 512),
      status,
      transactionDate: requireTransactionDate(root.payment.transaction_date),
    });
  } catch {
    return null;
  }
}

function requireOptionalRecord(value: Record<string, unknown>, key: string): void {
  if (Object.hasOwn(value, key) && !isRecord(value[key])) {
    throw new Error("INVALID_OPTIONAL_RESPONSE_OBJECT");
  }
}

function requireOptionalString(value: Record<string, unknown>, key: string): void {
  if (Object.hasOwn(value, key) && typeof value[key] !== "string") {
    throw new Error("INVALID_OPTIONAL_RESPONSE_STRING");
  }
}

type ParsedJson =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; code: "INVALID_JSON" | "DUPLICATE_JSON_KEY" }>;

function parseClosedJson(text: string): ParsedJson {
  try {
    new NoDuplicateJsonScanner(text).scan();
    const value: unknown = JSON.parse(text);
    return Object.freeze({ ok: true, value });
  } catch (error) {
    if (error instanceof EximbayBf4JsonError && error.code === "DUPLICATE_JSON_KEY") {
      return Object.freeze({ ok: false, code: error.code });
    }
    return Object.freeze({ ok: false, code: "INVALID_JSON" });
  }
}

function boundedResponseText(value: unknown, maxBytes: number): string {
  const text = requireExactText(value, "INVALID_RESPONSE_TEXT");
  if (UTF8_ENCODER.encode(text).byteLength > maxBytes) throw new Error("INVALID_RESPONSE_TEXT");
  return text;
}

function requireTransactionDate(value: unknown): string {
  const text = boundedResponseText(value, 14);
  if (!/^\d{14}$/u.test(text)) throw new Error("INVALID_TRANSACTION_DATE");
  return text;
}

function resolveMode(value: unknown): EximbayPaymentMode {
  try {
    return requireEximbayMode(value);
  } catch {
    throw new EximbayBf4ConfigError("INVALID_MODE");
  }
}

function configText(value: unknown, code: "INVALID_API_KEY" | "INVALID_MID"): string {
  try {
    return requireExactText(value, code);
  } catch {
    throw new EximbayBf4ConfigError(code);
  }
}

function requireConfig(config: EximbayBf4Config): EximbayBf4ConfigAuthority {
  const authority = configs.get(config);
  if (!authority) throw new EximbayBf4ConfigError("UNTRUSTED_CONFIG");
  return authority;
}

function admittedJsonContentType(value: string | null): boolean {
  if (typeof value !== "string") return false;
  return /^[\t ]*application\/json(?:[\t ]*;[\t ]*charset[\t ]*=[\t ]*utf-8)?[\t ]*$/iu.test(value);
}

function basicAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`, "utf8").toString("base64")}`;
}

function outcomeUnknown(code: EximbayBf4ContactFailureCode): Readonly<{
  kind: "outcomeUnknown";
  code: EximbayBf4ContactFailureCode;
}> {
  return Object.freeze({ kind: "outcomeUnknown", code });
}

function contactFailure(code: EximbayBf4ContactFailureCode): Readonly<{
  ok: false;
  code: EximbayBf4ContactFailureCode;
}> {
  return Object.freeze({ ok: false, code });
}

type ObjectState = "keyOrEnd" | "colon" | "value" | "commaOrEnd";
type ArrayState = "valueOrEnd" | "value" | "commaOrEnd";
interface ObjectContext { readonly kind: "object"; readonly keys: Set<string>; state: ObjectState }
interface ArrayContext { readonly kind: "array"; state: ArrayState }
type JsonContext = ObjectContext | ArrayContext;

class EximbayBf4JsonError extends Error {
  constructor(readonly code: "INVALID_JSON" | "DUPLICATE_JSON_KEY") {
    super(code);
  }
}

class NoDuplicateJsonScanner {
  readonly #text: string;
  readonly #contexts: JsonContext[] = [];
  #index = 0;

  constructor(text: string) {
    this.#text = text;
  }

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

  #objectColon(context: ObjectContext): void {
    this.#expect(":");
    context.state = "value";
  }

  #objectValue(context: ObjectContext): void {
    context.state = "commaOrEnd";
    this.#value();
  }

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

  #arrayValue(context: ArrayContext): void {
    context.state = "commaOrEnd";
    this.#value();
  }

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
    if (typeof value === "string") return value;
    return this.#invalid();
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
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(this.#text.slice(this.#index));
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

  #expect(value: string): void {
    if (!this.#consume(value)) this.#invalid();
  }

  #consume(value: string): boolean {
    if (this.#text[this.#index] !== value) return false;
    this.#index += 1;
    return true;
  }

  #invalid(): never {
    throw new EximbayBf4JsonError("INVALID_JSON");
  }

  #duplicate(): never {
    throw new EximbayBf4JsonError("DUPLICATE_JSON_KEY");
  }
}
