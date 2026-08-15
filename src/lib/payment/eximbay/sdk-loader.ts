"use client";

import type { EximbaySdkModeV1, EximbaySdkWireV1 } from "./sdk-handoff-contract";

export type EximbayRequestPayV2 = (payload: EximbaySdkWireV1) => unknown;

type LoaderErrorCode =
  | "SDK_BROWSER_UNAVAILABLE"
  | "SDK_INVALID_MODE"
  | "SDK_DOCUMENT_BLOCKED"
  | "SDK_MODE_CONFLICT"
  | "SDK_SCRIPT_ERROR"
  | "SDK_LOAD_TIMEOUT"
  | "SDK_REQUEST_PAY_UNAVAILABLE";
type BlockReason =
  | "PREEXISTING_GLOBAL"
  | "PREEXISTING_UNOWNED_SCRIPT"
  | "ORPHAN_OR_MARKER_SPOOF"
  | "PREEXISTING_STATE_CORRUPT"
  | "OWNED_STATE_MUTATED";
type LoaderPhase = "LOADING" | "AVAILABLE" | "FAILED";

interface SharedStateView {
  readonly record: object;
  readonly phase: LoaderPhase;
  readonly mode: EximbaySdkModeV1;
  readonly source: string;
  readonly ownerToken: object;
  readonly script: HTMLScriptElement;
  readonly promise: Promise<EximbayRequestPayV2>;
}

type StateInspection =
  | Readonly<{ kind: "VALID"; state: SharedStateView }>
  | Readonly<{ kind: "OWNED_MUTATION"; state: SharedStateView }>
  | Readonly<{ kind: "CORRUPT" }>;

interface DeferredRequestPay {
  readonly promise: Promise<EximbayRequestPayV2>;
  readonly resolve: (value: EximbayRequestPayV2) => void;
  readonly reject: (reason: Error) => void;
}

const STATE_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1");
const STATE_BRAND_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1.state-brand");
const SCRIPT_OWNER_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1.owner-token");
const BLOCK_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1.blocked");
const BLOCK_BRAND_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1.block-brand");
const STATE_BRAND_VALUE = "MIRA_EXIMBAY_SDK_LOADER_V2_V1_STATE";
const BLOCK_BRAND_VALUE = "MIRA_EXIMBAY_SDK_LOADER_V2_V1_BLOCKED";
const SCRIPT_MARKER = "data-mira-eximbay-sdk-loader-v2-v1";
const SDK_LOAD_TIMEOUT_MS = 15_000;
const SDK_SOURCES = Object.freeze({
  SANDBOX: "https://api-test.eximbay.com/v2/javascriptSDK.js",
  LIVE: "https://api.eximbay.com/v2/javascriptSDK.js",
});
const SDK_ORIGINS = new Set(["https://api-test.eximbay.com", "https://api.eximbay.com"]);

class EximbaySdkLoaderError extends Error {
  constructor(readonly code: LoaderErrorCode) {
    super(code);
    this.name = "EximbaySdkLoaderError";
  }
}

export function loadEximbaySdkV2(mode: EximbaySdkModeV1): Promise<EximbayRequestPayV2> {
  const browser = currentBrowser();
  if (!browser) return rejected("SDK_BROWSER_UNAVAILABLE");

  const blockDescriptor = Object.getOwnPropertyDescriptor(browser.window, BLOCK_KEY);
  if (blockDescriptor) return blockedPromise(blockDescriptor);
  if (!isMode(mode)) return rejected("SDK_INVALID_MODE");

  const stateDescriptor = Object.getOwnPropertyDescriptor(browser.window, STATE_KEY);
  if (!stateDescriptor) return startInitialLoad(browser.window, browser.document, mode);
  return reuseSharedState(browser.window, browser.document, mode, stateDescriptor);
}

function reuseSharedState(
  ownerWindow: Window,
  ownerDocument: Document,
  mode: EximbaySdkModeV1,
  stateDescriptor: PropertyDescriptor,
): Promise<EximbayRequestPayV2> {
  if (!isExactDataDescriptor(stateDescriptor, false, false)) {
    return installBlocked(ownerWindow, "PREEXISTING_STATE_CORRUPT");
  }
  const inspection = inspectSharedState(stateDescriptor.value, ownerWindow, ownerDocument);
  if (inspection.kind === "CORRUPT") {
    return installBlocked(ownerWindow, "PREEXISTING_STATE_CORRUPT");
  }
  if (inspection.kind === "OWNED_MUTATION") {
    if (inspection.state.phase === "AVAILABLE") {
      return installBlocked(ownerWindow, "OWNED_STATE_MUTATED");
    }
    if (inspection.state.phase === "FAILED") return inspection.state.promise;
    signalOwnedScriptFailure(inspection.state.script);
  }
  if (inspection.state.mode !== mode) return rejected("SDK_MODE_CONFLICT");
  return inspection.state.promise;
}

function currentBrowser(): { window: Window; document: Document } | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (window.document !== document) return null;
  return { window, document };
}

function startInitialLoad(
  ownerWindow: Window,
  ownerDocument: Document,
  mode: EximbaySdkModeV1,
): Promise<EximbayRequestPayV2> {
  const conflict = initialConflict(ownerWindow, ownerDocument);
  if (conflict) return installBlocked(ownerWindow, conflict);

  const source = SDK_SOURCES[mode];
  const script = ownerDocument.createElement("script");
  const ownerToken = Object.freeze({});
  script.src = source;
  script.async = true;
  script.setAttribute(SCRIPT_MARKER, "owned");
  Object.defineProperty(script, SCRIPT_OWNER_KEY, {
    value: ownerToken,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  const deferred = createDeferred();
  let stateRecord: object | null = null;
  let settled = false;
  let cleanup = (): void => undefined;
  const control = {
    fail(code: LoaderErrorCode): void {
      if (!stateRecord || settled) return;
      settled = true;
      settleFailed(ownerWindow, stateRecord, deferred, cleanup, code);
    },
    available(requestPay: EximbayRequestPayV2): void {
      if (!stateRecord || settled) return;
      settled = true;
      settleAvailable(ownerWindow, stateRecord, deferred, cleanup, requestPay);
    },
  };
  stateRecord = createStateRecord(
    ownerWindow,
    ownerDocument,
    mode,
    source,
    script,
    ownerToken,
    deferred.promise,
  );
  Object.defineProperty(ownerWindow, STATE_KEY, {
    value: stateRecord,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  const onLoad = (): void => handleOwnedLoad(ownerWindow, ownerDocument, stateRecord, control);
  const onError = (): void => control.fail("SDK_SCRIPT_ERROR");
  script.addEventListener("load", onLoad);
  script.addEventListener("error", onError);
  const timer = globalThis.setTimeout(() => control.fail("SDK_LOAD_TIMEOUT"), SDK_LOAD_TIMEOUT_MS);
  cleanup = (): void => {
    globalThis.clearTimeout(timer);
    script.removeEventListener("load", onLoad);
    script.removeEventListener("error", onError);
  };
  ownerDocument.head.append(script);
  return deferred.promise;
}

function initialConflict(ownerWindow: Window, ownerDocument: Document): BlockReason | null {
  if (windowEximbayValue(ownerWindow) !== undefined) return "PREEXISTING_GLOBAL";
  for (const script of Array.from(ownerDocument.scripts)) {
    const source = script.src;
    if (script.hasAttribute(SCRIPT_MARKER) || source === SDK_SOURCES.SANDBOX
      || source === SDK_SOURCES.LIVE) {
      return "ORPHAN_OR_MARKER_SPOOF";
    }
    if (isEximbayOrigin(source, ownerDocument.baseURI)) {
      return "PREEXISTING_UNOWNED_SCRIPT";
    }
  }
  return null;
}

function isEximbayOrigin(source: string, baseUri: string): boolean {
  if (source.length === 0) return false;
  try {
    return SDK_ORIGINS.has(new URL(source, baseUri).origin);
  } catch {
    return false;
  }
}

function createDeferred(): DeferredRequestPay {
  let resolvePromise: ((value: EximbayRequestPayV2) => void) | null = null;
  let rejectPromise: ((reason: Error) => void) | null = null;
  const promise = new Promise<EximbayRequestPayV2>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  void promise.catch(() => undefined);
  if (!resolvePromise || !rejectPromise) throw new EximbaySdkLoaderError("SDK_SCRIPT_ERROR");
  return Object.freeze({ promise, resolve: resolvePromise, reject: rejectPromise });
}

function createStateRecord(
  ownerWindow: Window,
  ownerDocument: Document,
  mode: EximbaySdkModeV1,
  source: string,
  script: HTMLScriptElement,
  ownerToken: object,
  promise: Promise<EximbayRequestPayV2>,
): object {
  const state = {};
  Object.defineProperties(state, {
    phase: stateField("LOADING", true),
    mode: stateField(mode, false),
    source: stateField(source, false),
    ownerWindow: stateField(ownerWindow, false),
    ownerDocument: stateField(ownerDocument, false),
    script: stateField(script, false),
    promise: stateField(promise, false),
    [STATE_BRAND_KEY]: protectedField(STATE_BRAND_VALUE),
    [SCRIPT_OWNER_KEY]: protectedField(ownerToken),
  });
  return state;
}

function settleAvailable(
  ownerWindow: Window,
  state: object,
  deferred: DeferredRequestPay,
  cleanup: () => void,
  requestPay: EximbayRequestPayV2,
): void {
  cleanup();
  if (!transitionState(state, "AVAILABLE", "requestPay", requestPay)) {
    void installBlocked(ownerWindow, "PREEXISTING_STATE_CORRUPT");
    deferred.reject(new EximbaySdkLoaderError("SDK_SCRIPT_ERROR"));
    return;
  }
  deferred.resolve(requestPay);
}

function settleFailed(
  ownerWindow: Window,
  state: object,
  deferred: DeferredRequestPay,
  cleanup: () => void,
  code: LoaderErrorCode,
): void {
  cleanup();
  if (!transitionState(state, "FAILED", "failureCode", code)) {
    void installBlocked(ownerWindow, "PREEXISTING_STATE_CORRUPT");
    deferred.reject(new EximbaySdkLoaderError("SDK_SCRIPT_ERROR"));
    return;
  }
  deferred.reject(new EximbaySdkLoaderError(code));
}

function transitionState(
  state: object,
  phase: Exclude<LoaderPhase, "LOADING">,
  field: "requestPay" | "failureCode",
  value: EximbayRequestPayV2 | LoaderErrorCode,
): boolean {
  try {
    Object.defineProperty(state, field, stateField(value, false));
    return Reflect.set(state, "phase", phase);
  } catch {
    return false;
  }
}

function stateField(value: unknown, writable: boolean): PropertyDescriptor {
  return { value, enumerable: true, writable, configurable: false };
}

function protectedField(value: unknown): PropertyDescriptor {
  return { value, enumerable: false, writable: false, configurable: false };
}

function handleOwnedLoad(
  ownerWindow: Window,
  ownerDocument: Document,
  expectedState: object,
  control: Readonly<{
    fail: (code: LoaderErrorCode) => void;
    available: (requestPay: EximbayRequestPayV2) => void;
  }>,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(ownerWindow, STATE_KEY);
  if (!isUnknownDataDescriptor(descriptor) || descriptor.value !== expectedState) return;
  const inspection = inspectSharedState(expectedState, ownerWindow, ownerDocument);
  if (inspection.kind !== "VALID" || inspection.state.phase !== "LOADING") {
    control.fail("SDK_SCRIPT_ERROR");
    return;
  }
  const requestPay = captureRequestPay(ownerWindow);
  if (!requestPay) {
    control.fail("SDK_REQUEST_PAY_UNAVAILABLE");
    return;
  }
  control.available(requestPay);
}

function captureRequestPay(ownerWindow: Window): EximbayRequestPayV2 | null {
  const eximbay = windowEximbayValue(ownerWindow);
  if (!isObjectOrFunction(eximbay)) return null;
  const requestPayDescriptor = Object.getOwnPropertyDescriptor(eximbay, "request_pay");
  if (!isUnknownDataDescriptor(requestPayDescriptor)) return null;
  const requestPay = requestPayDescriptor.value;
  if (typeof requestPay !== "function") return null;
  return (payload) => {
    Reflect.apply(requestPay, eximbay, [payload]);
    return undefined;
  };
}

function inspectSharedState(value: unknown, ownerWindow: Window, ownerDocument: Document): StateInspection {
  if (!isPlainObject(value)) return Object.freeze({ kind: "CORRUPT" });
  const phaseDescriptor = Object.getOwnPropertyDescriptor(value, "phase");
  if (!phaseDescriptor || !("value" in phaseDescriptor) || !isPhase(phaseDescriptor.value)) {
    return Object.freeze({ kind: "CORRUPT" });
  }
  const keys = stateKeys(phaseDescriptor.value);
  const fields = exactDataFields(value, keys, "phase");
  if (!fields) return Object.freeze({ kind: "CORRUPT" });
  const view = stateView(value, fields, ownerWindow, ownerDocument);
  if (!view) return Object.freeze({ kind: "CORRUPT" });
  return classifyStateIntegrity(view, ownerDocument);
}

function classifyStateIntegrity(
  view: SharedStateView,
  ownerDocument: Document,
): StateInspection {
  if (stateIntegrity(view, ownerDocument)) {
    return Object.freeze({ kind: "VALID", state: view });
  }
  if (hasExactScriptOwnership(view, ownerDocument)) {
    return Object.freeze({ kind: "OWNED_MUTATION", state: view });
  }
  return Object.freeze({ kind: "CORRUPT" });
}

function stateKeys(phase: LoaderPhase): Array<string | symbol> {
  const keys: Array<string | symbol> = [
    "phase", "mode", "source", "ownerWindow", "ownerDocument", "script", "promise",
    STATE_BRAND_KEY, SCRIPT_OWNER_KEY,
  ];
  if (phase === "AVAILABLE") keys.push("requestPay");
  if (phase === "FAILED") keys.push("failureCode");
  return keys;
}

function stateView(
  record: object,
  fields: Map<string | symbol, unknown>,
  ownerWindow: Window,
  ownerDocument: Document,
): SharedStateView | null {
  const common = sharedStateCommon(fields, ownerWindow, ownerDocument);
  if (!common || !validPhaseFields(common.phase, fields)) return null;
  return Object.freeze({ record, ...common });
}

function sharedStateCommon(
  fields: Map<string | symbol, unknown>,
  ownerWindow: Window,
  ownerDocument: Document,
): Omit<SharedStateView, "record"> | null {
  const primitives = admittedStatePrimitives(fields);
  if (!primitives) return null;
  const ownerToken = fields.get(SCRIPT_OWNER_KEY);
  const script = fields.get("script");
  const promise = fields.get("promise");
  if (!validStateOwners(fields, ownerWindow, ownerDocument)) return null;
  if (!isObject(ownerToken) || !isHtmlScriptElement(script)) return null;
  if (!isRequestPayPromise(promise)) return null;
  return Object.freeze({ ...primitives, ownerToken, script, promise });
}

function admittedStatePrimitives(
  fields: Map<string | symbol, unknown>,
): Pick<SharedStateView, "phase" | "mode" | "source"> | null {
  const phase = fields.get("phase");
  const mode = fields.get("mode");
  const source = fields.get("source");
  if (!isPhase(phase) || !isMode(mode) || typeof source !== "string") return null;
  if (fields.get(STATE_BRAND_KEY) !== STATE_BRAND_VALUE) return null;
  return Object.freeze({ phase, mode, source });
}

function validStateOwners(
  fields: Map<string | symbol, unknown>,
  ownerWindow: Window,
  ownerDocument: Document,
): boolean {
  return fields.get("ownerWindow") === ownerWindow
    && fields.get("ownerDocument") === ownerDocument;
}

function validPhaseFields(phase: LoaderPhase, fields: Map<string | symbol, unknown>): boolean {
  if (phase === "AVAILABLE") return isRequestPay(fields.get("requestPay"));
  if (phase === "FAILED") return isLoaderErrorCode(fields.get("failureCode"));
  return true;
}

function stateIntegrity(state: SharedStateView, ownerDocument: Document): boolean {
  const expectedSource = SDK_SOURCES[state.mode];
  return state.source === expectedSource
    && state.script.src === expectedSource
    && hasExactScriptOwnership(state, ownerDocument);
}

function hasExactScriptOwnership(state: SharedStateView, ownerDocument: Document): boolean {
  const scriptOwner = Object.getOwnPropertyDescriptor(state.script, SCRIPT_OWNER_KEY);
  return state.script.ownerDocument === ownerDocument
    && Array.from(ownerDocument.scripts).includes(state.script)
    && Boolean(
      isExactDataDescriptor(scriptOwner, false, false)
      && scriptOwner.value === state.ownerToken,
    );
}

function signalOwnedScriptFailure(script: HTMLScriptElement): void {
  script.dispatchEvent(new Event("error"));
}

function exactDataFields(
  record: object,
  expectedKeys: Array<string | symbol>,
  writableKey?: string,
): Map<string | symbol, unknown> | null {
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length !== expectedKeys.length) return null;
  if (expectedKeys.some((key) => !ownKeys.includes(key))) return null;
  const values = new Map<string | symbol, unknown>();
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    const enumerable = typeof key === "string";
    if (!isExactDataDescriptor(descriptor, enumerable, key === writableKey)) return null;
    values.set(key, descriptor.value);
  }
  return values;
}

function installBlocked(ownerWindow: Window, reason: BlockReason): Promise<EximbayRequestPayV2> {
  const existing = Object.getOwnPropertyDescriptor(ownerWindow, BLOCK_KEY);
  if (existing) return blockedPromise(existing);
  const promise = rejected("SDK_DOCUMENT_BLOCKED");
  const block = { promise, reason };
  Object.defineProperty(block, BLOCK_BRAND_KEY, {
    value: BLOCK_BRAND_VALUE,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.freeze(block);
  try {
    Object.defineProperty(ownerWindow, BLOCK_KEY, {
      value: block,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  } catch {
    return rejected("SDK_DOCUMENT_BLOCKED");
  }
  return promise;
}

function blockedPromise(descriptor: PropertyDescriptor): Promise<EximbayRequestPayV2> {
  if (!isExactDataDescriptor(descriptor, false, false) || !isPlainObject(descriptor.value)) {
    return rejected("SDK_DOCUMENT_BLOCKED");
  }
  const fields = exactDataFields(descriptor.value, ["promise", "reason", BLOCK_BRAND_KEY]);
  if (!fields || fields.get(BLOCK_BRAND_KEY) !== BLOCK_BRAND_VALUE) {
    return rejected("SDK_DOCUMENT_BLOCKED");
  }
  const promise = fields.get("promise");
  const reason = fields.get("reason");
  if (!isRequestPayPromise(promise) || !isBlockReason(reason)) {
    return rejected("SDK_DOCUMENT_BLOCKED");
  }
  return promise;
}

function rejected(code: LoaderErrorCode): Promise<never> {
  const promise = Promise.reject(new EximbaySdkLoaderError(code));
  void promise.catch(() => undefined);
  return promise;
}

function isPlainObject(value: unknown): value is object {
  if (!isObject(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isObjectOrFunction(value: unknown): value is object | ((...input: unknown[]) => unknown) {
  return isObject(value) || typeof value === "function";
}

function isHtmlScriptElement(value: unknown): value is HTMLScriptElement {
  return typeof HTMLScriptElement === "function" && value instanceof HTMLScriptElement;
}

function windowEximbayValue(ownerWindow: Window): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(ownerWindow, "EXIMBAY");
  if (!descriptor) return undefined;
  if (!isUnknownDataDescriptor(descriptor)) return descriptor;
  return descriptor.value;
}

function isExactDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
  enumerable: boolean,
  writable: boolean,
): descriptor is UnknownDataDescriptor {
  return isUnknownDataDescriptor(descriptor)
    && descriptor.enumerable === enumerable
    && descriptor.writable === writable
    && descriptor.configurable === false;
}

type UnknownDataDescriptor = Omit<PropertyDescriptor, "value"> & { value: unknown };

function isUnknownDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is UnknownDataDescriptor {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
}

function isMode(value: unknown): value is EximbaySdkModeV1 {
  return value === "SANDBOX" || value === "LIVE";
}

function isPhase(value: unknown): value is LoaderPhase {
  return value === "LOADING" || value === "AVAILABLE" || value === "FAILED";
}

function isRequestPay(value: unknown): value is EximbayRequestPayV2 {
  return typeof value === "function";
}

function isRequestPayPromise(value: unknown): value is Promise<EximbayRequestPayV2> {
  return value instanceof Promise;
}

function isLoaderErrorCode(value: unknown): value is LoaderErrorCode {
  return typeof value === "string" && [
    "SDK_BROWSER_UNAVAILABLE",
    "SDK_INVALID_MODE",
    "SDK_DOCUMENT_BLOCKED",
    "SDK_MODE_CONFLICT",
    "SDK_SCRIPT_ERROR",
    "SDK_LOAD_TIMEOUT",
    "SDK_REQUEST_PAY_UNAVAILABLE",
  ].includes(value);
}

function isBlockReason(value: unknown): value is BlockReason {
  return value === "PREEXISTING_GLOBAL"
    || value === "PREEXISTING_UNOWNED_SCRIPT"
    || value === "ORPHAN_OR_MARKER_SPOOF"
    || value === "PREEXISTING_STATE_CORRUPT"
    || value === "OWNED_STATE_MUTATED";
}
