import "server-only";
import {
  materializeEximbayReadyRequest,
  type EximbayReadyRequestFacts,
  type TrustedEximbayProviderOrderBinding,
} from "./ready";
import type { EximbayCanonicalPreparationFacts } from "@/lib/payment/providers/eximbay/preparation";
import type { EximbayPaymentMode } from "@/lib/payment/providers/eximbay/types";

export const EXIMBAY_READY_MAX_REQUEST_BYTES = 65_536;
export const EXIMBAY_READY_MAX_RESPONSE_BYTES = 65_536;
export const EXIMBAY_READY_MAX_RESPONSE_CHUNKS = 65_536;

const READY_ENDPOINTS: Readonly<Record<EximbayPaymentMode, string>> = Object.freeze({
  SANDBOX: "https://api-test.eximbay.com/v1/payments/ready",
  LIVE: "https://api.eximbay.com/v1/payments/ready",
});
const PROTECTED_RESPONSE_KEYS = new Set(["rescode", "resmsg", "fgkey"]);
const UTF8_ENCODER = new TextEncoder();
const readyContactPlanBrand: unique symbol = Symbol("EximbayReadyContactPlanCore");
const admittedReadySuccessBrand: unique symbol = Symbol("TrustedEximbayReadySuccess");
const trustedContactPlanAuthorities = new WeakMap<object, TrustedReadyContactPlanAuthority>();
const admittedReadySuccessAuthorities = new WeakMap<object, AdmittedReadySuccessAuthority>();

export type EximbayReadyKernelErrorCode =
  | "INVALID_PAYMENT_MODE"
  | "READY_REQUEST_TOO_LARGE"
  | "UNTRUSTED_READY_CONTACT_PLAN"
  | "UNTRUSTED_READY_SUCCESS"
  | "READY_SUCCESS_PLAN_MISMATCH";

export class EximbayReadyKernelError extends Error {
  constructor(readonly code: EximbayReadyKernelErrorCode) {
    super(code);
    this.name = "EximbayReadyKernelError";
  }
}

export interface EximbayReadyContactPlanCore {
  readonly [readyContactPlanBrand]: true;
  readonly mode: EximbayPaymentMode;
  readonly endpoint: string;
  readonly method: "POST";
  readonly contentType: "application/json";
  readonly body: string;
}

export interface EximbayReadyTransportResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: AsyncIterable<Uint8Array>;
}

export type EximbayReadyTransportPort = (
  plan: EximbayReadyContactPlanCore,
) => Promise<EximbayReadyTransportResponse>;

export type EximbayReadyAdmissionFailureCode =
  | "TRANSPORT_FAILURE"
  | "NON_2XX"
  | "BODY_TOO_LARGE"
  | "TOO_MANY_RESPONSE_CHUNKS"
  | "INVALID_CONTENT_TYPE"
  | "INVALID_RESPONSE_CHUNK"
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "INVALID_ROOT"
  | "DUPLICATE_PROTECTED_KEY"
  | "INVALID_RESCODE"
  | "INVALID_RESMSG"
  | "INVALID_FGKEY"
  | "PROVIDER_NON_SUCCESS";

export interface TrustedEximbayReadySuccess {
  readonly [admittedReadySuccessBrand]: true;
}

export type EximbayReadyAdmissionResult =
  | Readonly<{
    kind: "admittedSuccess";
    success: TrustedEximbayReadySuccess;
  }>
  | Readonly<{
    kind: "notAdmitted";
    code: EximbayReadyAdmissionFailureCode;
  }>;

export interface EximbayTrustedSdkWireFacts {
  readonly fgkey: string;
  readonly payment: EximbayReadyRequestFacts["payment"];
  readonly merchant: EximbayReadyRequestFacts["merchant"];
  readonly buyer: EximbayReadyRequestFacts["buyer"];
  readonly url: EximbayReadyRequestFacts["url"];
}

interface TrustedReadyContactPlanAuthority {
  readonly mode: EximbayPaymentMode;
  readonly facts: EximbayCanonicalPreparationFacts;
  readonly binding: TrustedEximbayProviderOrderBinding;
  readonly readyWire: EximbayReadyRequestFacts;
}

interface AdmittedReadySuccessAuthority {
  readonly planAuthority: TrustedReadyContactPlanAuthority;
  readonly readyFgkey: string;
}

export function createEximbayReadyContactPlanCore(
  mode: EximbayPaymentMode,
  facts: EximbayCanonicalPreparationFacts,
  binding: TrustedEximbayProviderOrderBinding,
): EximbayReadyContactPlanCore {
  const endpoint = readyEndpoint(mode);
  const request = materializeEximbayReadyRequest(facts, binding);
  const body = JSON.stringify(request);
  if (UTF8_ENCODER.encode(body).byteLength > EXIMBAY_READY_MAX_REQUEST_BYTES) {
    throw new EximbayReadyKernelError("READY_REQUEST_TOO_LARGE");
  }
  const plan: EximbayReadyContactPlanCore = {
    [readyContactPlanBrand]: true,
    mode,
    endpoint,
    method: "POST",
    contentType: "application/json",
    body,
  };
  Object.defineProperty(plan, readyContactPlanBrand, { enumerable: false });
  Object.defineProperty(plan, "body", { enumerable: false });
  trustedContactPlanAuthorities.set(plan, Object.freeze({
    mode,
    facts,
    binding,
    readyWire: request,
  }));
  return Object.freeze(plan);
}

export async function executeEximbayReadyContactPlanCore(
  plan: EximbayReadyContactPlanCore,
  transport: EximbayReadyTransportPort,
): Promise<EximbayReadyAdmissionResult> {
  const planAuthority = trustedContactPlanAuthorities.get(plan);
  if (planAuthority === undefined) {
    throw new EximbayReadyKernelError("UNTRUSTED_READY_CONTACT_PLAN");
  }
  try {
    const response = await transport(plan);
    return await admitReadyResponse(response, planAuthority);
  } catch {
    return notAdmitted("TRANSPORT_FAILURE");
  }
}

export function materializeTrustedEximbaySdkWire(
  plan: EximbayReadyContactPlanCore,
  success: TrustedEximbayReadySuccess,
): EximbayTrustedSdkWireFacts {
  const planAuthority = trustedContactPlanAuthorities.get(plan);
  if (planAuthority === undefined) {
    throw new EximbayReadyKernelError("UNTRUSTED_READY_CONTACT_PLAN");
  }
  const successAuthority = admittedReadySuccessAuthorities.get(success);
  if (successAuthority === undefined) {
    throw new EximbayReadyKernelError("UNTRUSTED_READY_SUCCESS");
  }
  if (successAuthority.planAuthority !== planAuthority) {
    throw new EximbayReadyKernelError("READY_SUCCESS_PLAN_MISMATCH");
  }
  const ready = planAuthority.readyWire;
  return Object.freeze({
    fgkey: successAuthority.readyFgkey,
    payment: ready.payment,
    merchant: ready.merchant,
    buyer: ready.buyer,
    url: ready.url,
  });
}

function readyEndpoint(mode: EximbayPaymentMode): string {
  if (mode === "SANDBOX" || mode === "LIVE") return READY_ENDPOINTS[mode];
  throw new EximbayReadyKernelError("INVALID_PAYMENT_MODE");
}

async function admitReadyResponse(
  response: EximbayReadyTransportResponse,
  planAuthority: TrustedReadyContactPlanAuthority,
): Promise<EximbayReadyAdmissionResult> {
  if (!isHttpSuccess(response.status)) return notAdmitted("NON_2XX");
  if (!isAdmittedJsonContentType(response.contentType)) {
    return notAdmitted("INVALID_CONTENT_TYPE");
  }
  const body = await readBoundedBody(response.body);
  if (!body.ok) return notAdmitted(body.code);
  const decoded = decodeUtf8(body.bytes);
  if (!decoded.ok) return notAdmitted("INVALID_UTF8");
  return admitJsonBody(decoded.text, planAuthority);
}

function isHttpSuccess(status: number): boolean {
  return Number.isInteger(status) && status >= 200 && status < 300;
}

function isAdmittedJsonContentType(value: string | null): boolean {
  if (typeof value !== "string") return false;
  return /^[\t ]*application\/json(?:[\t ]*;[\t ]*charset[\t ]*=[\t ]*utf-8)?[\t ]*$/iu.test(value);
}

type BoundedBodyResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{
    ok: false;
    code:
      | "BODY_TOO_LARGE"
      | "TOO_MANY_RESPONSE_CHUNKS"
      | "INVALID_RESPONSE_CHUNK"
      | "TRANSPORT_FAILURE";
  }>;

async function readBoundedBody(body: AsyncIterable<Uint8Array>): Promise<BoundedBodyResult> {
  const bytes = new Uint8Array(EXIMBAY_READY_MAX_RESPONSE_BYTES);
  let chunkCount = 0;
  let length = 0;
  try {
    for await (const chunk of body) {
      chunkCount += 1;
      if (chunkCount > EXIMBAY_READY_MAX_RESPONSE_CHUNKS) {
        return bodyFailure("TOO_MANY_RESPONSE_CHUNKS");
      }
      if (!(chunk instanceof Uint8Array)) return bodyFailure("INVALID_RESPONSE_CHUNK");
      const nextLength = length + chunk.byteLength;
      if (nextLength > EXIMBAY_READY_MAX_RESPONSE_BYTES) return bodyFailure("BODY_TOO_LARGE");
      if (chunk.byteLength > 0) bytes.set(chunk, length);
      length = nextLength;
    }
  } catch {
    return bodyFailure("TRANSPORT_FAILURE");
  }
  return Object.freeze({ ok: true, bytes: bytes.slice(0, length) });
}

function bodyFailure(
  code:
    | "BODY_TOO_LARGE"
    | "TOO_MANY_RESPONSE_CHUNKS"
    | "INVALID_RESPONSE_CHUNK"
    | "TRANSPORT_FAILURE",
): BoundedBodyResult {
  return Object.freeze({ ok: false, code });
}

type Utf8DecodeResult =
  | Readonly<{ ok: true; text: string }>
  | Readonly<{ ok: false }>;

function decodeUtf8(bytes: Uint8Array): Utf8DecodeResult {
  try {
    return Object.freeze({
      ok: true,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    });
  } catch {
    return Object.freeze({ ok: false });
  }
}

function admitJsonBody(
  text: string,
  planAuthority: TrustedReadyContactPlanAuthority,
): EximbayReadyAdmissionResult {
  const scanned = scanProtectedRootKeys(text);
  if (!scanned.ok) return notAdmitted(scanned.code);
  const parsed = parseJson(text);
  if (!parsed.ok) return notAdmitted("INVALID_JSON");
  if (!isRecord(parsed.value)) return notAdmitted("INVALID_ROOT");
  if (typeof parsed.value.rescode !== "string") return notAdmitted("INVALID_RESCODE");
  if (typeof parsed.value.resmsg !== "string") return notAdmitted("INVALID_RESMSG");
  if (parsed.value.rescode !== "0000") return notAdmitted("PROVIDER_NON_SUCCESS");
  if (!isAdmittedReadyFgkey(parsed.value.fgkey)) return notAdmitted("INVALID_FGKEY");
  return admittedSuccess(planAuthority, parsed.value.fgkey);
}

type ProtectedKeyScanResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: "INVALID_JSON" | "DUPLICATE_PROTECTED_KEY" }>;

function scanProtectedRootKeys(text: string): ProtectedKeyScanResult {
  try {
    new ProtectedRootKeyScanner(text).scan();
    return Object.freeze({ ok: true });
  } catch (error) {
    if (error instanceof ReadyJsonScanError && error.code === "DUPLICATE_PROTECTED_KEY") {
      return Object.freeze({ ok: false, code: error.code });
    }
    return Object.freeze({ ok: false, code: "INVALID_JSON" });
  }
}

type JsonParseResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false }>;

function parseJson(text: string): JsonParseResult {
  try {
    const value: unknown = JSON.parse(text);
    return Object.freeze({ ok: true, value });
  } catch {
    return Object.freeze({ ok: false });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAdmittedReadyFgkey(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\u0000") || /\p{Cc}/u.test(value)) return false;
  const byteLength = UTF8_ENCODER.encode(value).byteLength;
  return byteLength >= 1 && byteLength <= 4_096;
}

function admittedSuccess(
  planAuthority: TrustedReadyContactPlanAuthority,
  readyFgkey: string,
): EximbayReadyAdmissionResult {
  const success: TrustedEximbayReadySuccess = {
    [admittedReadySuccessBrand]: true,
  };
  Object.defineProperty(success, admittedReadySuccessBrand, { enumerable: false });
  admittedReadySuccessAuthorities.set(success, Object.freeze({ planAuthority, readyFgkey }));
  return Object.freeze({
    kind: "admittedSuccess",
    success: Object.freeze(success),
  });
}

function notAdmitted(code: EximbayReadyAdmissionFailureCode): EximbayReadyAdmissionResult {
  return Object.freeze({ kind: "notAdmitted", code });
}

type ObjectScanState = "keyOrEnd" | "colon" | "value" | "commaOrEnd";
type ArrayScanState = "valueOrEnd" | "value" | "commaOrEnd";

interface ObjectScanContext {
  readonly kind: "object";
  readonly root: boolean;
  readonly seenProtectedKeys: Set<string>;
  state: ObjectScanState;
}

interface ArrayScanContext {
  readonly kind: "array";
  state: ArrayScanState;
}

type ScanContext = ObjectScanContext | ArrayScanContext;

class ReadyJsonScanError extends Error {
  constructor(readonly code: "INVALID_JSON" | "DUPLICATE_PROTECTED_KEY") {
    super(code);
  }
}

class ProtectedRootKeyScanner {
  readonly #text: string;
  readonly #contexts: ScanContext[] = [];
  #index = 0;

  constructor(text: string) {
    this.#text = text;
  }

  scan(): void {
    this.#whitespace();
    this.#value(true);
    while (this.#contexts.length > 0) this.#scanCurrentContext();
    this.#whitespace();
    if (this.#index !== this.#text.length) this.#invalid();
  }

  #scanCurrentContext(): void {
    const context = this.#contexts[this.#contexts.length - 1];
    if (!context) return this.#invalid();
    if (context.kind === "object") this.#object(context);
    else this.#array(context);
  }

  #object(context: ObjectScanContext): void {
    this.#whitespace();
    if (context.state === "keyOrEnd") return this.#objectKeyOrEnd(context);
    if (context.state === "colon") return this.#objectColon(context);
    if (context.state === "value") return this.#objectValue(context);
    this.#objectCommaOrEnd(context);
  }

  #objectKeyOrEnd(context: ObjectScanContext): void {
    if (this.#consume("}")) return void this.#contexts.pop();
    const key = this.#string();
    if (context.root && PROTECTED_RESPONSE_KEYS.has(key)) {
      if (context.seenProtectedKeys.has(key)) this.#duplicate();
      context.seenProtectedKeys.add(key);
    }
    context.state = "colon";
  }

  #objectColon(context: ObjectScanContext): void {
    this.#expect(":");
    context.state = "value";
  }

  #objectValue(context: ObjectScanContext): void {
    context.state = "commaOrEnd";
    this.#value(false);
  }

  #objectCommaOrEnd(context: ObjectScanContext): void {
    if (this.#consume("}")) return void this.#contexts.pop();
    this.#expect(",");
    context.state = "keyOrEnd";
  }

  #array(context: ArrayScanContext): void {
    this.#whitespace();
    if (context.state === "valueOrEnd") return this.#arrayValueOrEnd(context);
    if (context.state === "value") return this.#arrayValue(context);
    this.#arrayCommaOrEnd(context);
  }

  #arrayValueOrEnd(context: ArrayScanContext): void {
    if (this.#consume("]")) return void this.#contexts.pop();
    context.state = "commaOrEnd";
    this.#value(false);
  }

  #arrayValue(context: ArrayScanContext): void {
    context.state = "commaOrEnd";
    this.#value(false);
  }

  #arrayCommaOrEnd(context: ArrayScanContext): void {
    if (this.#consume("]")) return void this.#contexts.pop();
    this.#expect(",");
    context.state = "value";
  }

  #value(root: boolean): void {
    this.#whitespace();
    const token = this.#text[this.#index];
    if (token === "{") return this.#beginObject(root);
    if (token === "[") return this.#beginArray();
    if (token === "\"") return void this.#string();
    if (token === "t") return this.#literal("true");
    if (token === "f") return this.#literal("false");
    if (token === "n") return this.#literal("null");
    this.#number();
  }

  #beginObject(root: boolean): void {
    this.#expect("{");
    this.#contexts.push({
      kind: "object",
      root,
      seenProtectedKeys: new Set<string>(),
      state: "keyOrEnd",
    });
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
      if (character === "\"") return this.#decodeString(start);
      if (character === "\\") this.#escape();
      else if (!character || character.charCodeAt(0) <= 0x1f) this.#invalid();
    }
    return this.#invalid();
  }

  #decodeString(start: number): string {
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
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(
      this.#text.slice(this.#index),
    );
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
    throw new ReadyJsonScanError("INVALID_JSON");
  }

  #duplicate(): never {
    throw new ReadyJsonScanError("DUPLICATE_PROTECTED_KEY");
  }
}
