import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STATE_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1");
const STATE_BRAND_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1.state-brand");
const SCRIPT_OWNER_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1.owner-token");
const BLOCK_KEY = Symbol.for("mira.payment.eximbay.sdk-loader.v2.v1.blocked");
const SANDBOX_SOURCE = "https://api-test.eximbay.com/v2/javascriptSDK.js";
const LIVE_SOURCE = "https://api.eximbay.com/v2/javascriptSDK.js";
const SCRIPT_MARKER = "data-mira-eximbay-sdk-loader-v2-v1";

class FakeScriptElement {
  src = "";
  async = false;
  readonly ownerDocument: FakeDocument;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(ownerDocument: FakeDocument) {
    this.ownerDocument = ownerDocument;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  fire(type: "load" | "error"): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }

  dispatchEvent(event: Event): boolean {
    if (event.type === "load" || event.type === "error") this.fire(event.type);
    return true;
  }
}

class FakeDocument {
  readonly baseURI = "https://shop.example.test/checkout";
  readonly scripts: FakeScriptElement[] = [];
  readonly head = {
    append: (script: FakeScriptElement): void => {
      this.scripts.push(script);
    },
  };

  createElement(name: string): FakeScriptElement {
    if (name !== "script") throw new Error("Only script elements are supported by the fake");
    return new FakeScriptElement(this);
  }
}

interface FakeBrowser {
  readonly window: Record<PropertyKey, unknown> & { document: FakeDocument };
  readonly document: FakeDocument;
}

describe("EX2B2-S3 document-global SDK loader", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("is import-side-effect-free", async () => {
    const browser = installBrowser();

    await import("../sdk-loader");

    expect(browser.document.scripts).toHaveLength(0);
  });

  it.each([
    ["SANDBOX", SANDBOX_SOURCE],
    ["LIVE", LIVE_SOURCE],
  ] as const)("maps %s to only its exact closed source", async (mode, source) => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");

    const pending = loader.loadEximbaySdkV2(mode);

    expect(browser.document.scripts).toHaveLength(1);
    expect(browser.document.scripts[0]?.src).toBe(source);
    browser.window.EXIMBAY = { request_pay: vi.fn() };
    browser.document.scripts[0]?.fire("load");
    await expect(pending).resolves.toBeTypeOf("function");
  });

  it("shares one exact same-mode promise, script, owner token, and captured callable", async () => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const requestPay = vi.fn();

    const first = loader.loadEximbaySdkV2("SANDBOX");
    const second = loader.loadEximbaySdkV2("SANDBOX");
    expect(second).toBe(first);
    expect(browser.document.scripts).toHaveLength(1);
    const state = ownDataValue(browser.window, STATE_KEY);
    const script = browser.document.scripts[0];
    expect(ownDataValue(state, SCRIPT_OWNER_KEY)).toBe(ownDataValue(script, SCRIPT_OWNER_KEY));
    browser.window.EXIMBAY = { request_pay: requestPay };
    script?.fire("load");
    const callable = await first;
    callable(syntheticPayload());
    expect(requestPay).toHaveBeenCalledTimes(1);
  });

  it("owns exact immutable common state descriptors and an explicit mutable phase", async () => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const pending = loader.loadEximbaySdkV2("SANDBOX");
    const state = ownDataValue(browser.window, STATE_KEY);

    for (const key of ["mode", "source", "ownerWindow", "ownerDocument", "script", "promise"]) {
      expect(Object.getOwnPropertyDescriptor(state, key)).toMatchObject({
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }
    expect(Object.getOwnPropertyDescriptor(state, "phase")).toMatchObject({
      enumerable: true,
      writable: true,
      configurable: false,
    });

    browser.document.scripts[0]?.fire("error");
    await expect(pending).rejects.toMatchObject({ code: "SDK_SCRIPT_ERROR" });
  });

  it("rejects promise substitution and shares the original exact promise across modules", async () => {
    const browser = installBrowser();
    const firstModule = await import("../sdk-loader");
    const first = firstModule.loadEximbaySdkV2("SANDBOX");
    const state = ownDataValue(browser.window, STATE_KEY);
    const substitute = Promise.resolve(vi.fn());

    expect(reflectSet(state, "promise", substitute)).toBe(false);
    expect(ownDataValue(state, "promise")).toBe(first);
    vi.resetModules();
    const secondModule = await import("../sdk-loader");
    expect(secondModule.loadEximbaySdkV2("SANDBOX")).toBe(first);

    browser.document.scripts[0]?.fire("error");
    await expect(first).rejects.toMatchObject({ code: "SDK_SCRIPT_ERROR" });
  });

  it.each(["LOADING", "AVAILABLE", "FAILED"] as const)(
    "rejects opposite mode during %s without replacing or removing the owned script",
    async (phase) => {
      const browser = installBrowser();
      const loader = await import("../sdk-loader");
      const first = loader.loadEximbaySdkV2("SANDBOX");
      const script = browser.document.scripts[0];
      if (phase === "AVAILABLE") {
        browser.window.EXIMBAY = { request_pay: vi.fn() };
        script?.fire("load");
        await first;
      }
      if (phase === "FAILED") {
        script?.fire("error");
        await expect(first).rejects.toMatchObject({ code: "SDK_SCRIPT_ERROR" });
      }

      await expect(loader.loadEximbaySdkV2("LIVE"))
        .rejects.toMatchObject({ code: "SDK_MODE_CONFLICT" });
      expect(browser.document.scripts).toEqual([script]);
    },
  );

  it("permanently blocks both modes on a pre-existing global even after removal", async () => {
    const browser = installBrowser();
    browser.window.EXIMBAY = { request_pay: vi.fn() };
    const loader = await import("../sdk-loader");

    const first = loader.loadEximbaySdkV2("SANDBOX");
    delete browser.window.EXIMBAY;
    const second = loader.loadEximbaySdkV2("LIVE");

    expect(second).toBe(first);
    await expect(first).rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
    expect(browser.document.scripts).toHaveLength(0);
  });

  it.each([
    "https://api-test.eximbay.com/v2/foreign-sdk.js",
    "https://api.eximbay.com/v2/foreign-sdk.js",
  ])(
    "permanently blocks both modes on a pre-existing unowned Eximbay script: %s",
    async (source) => {
      const browser = installBrowser();
      const foreign = browser.document.createElement("script");
      foreign.src = source;
      browser.document.scripts.push(foreign);
      const loader = await import("../sdk-loader");

      const first = loader.loadEximbaySdkV2("SANDBOX");
      browser.document.scripts.splice(0, 1);
      const second = loader.loadEximbaySdkV2("LIVE");

      expect(second).toBe(first);
      await expect(first).rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
      expect(browser.document.scripts).toHaveLength(0);
    },
  );

  it.each([SANDBOX_SOURCE, LIVE_SOURCE])(
    "blocks an exact-source orphan instead of adopting it: %s",
    async (source) => {
      const browser = installBrowser();
      const orphan = browser.document.createElement("script");
      orphan.src = source;
      browser.document.scripts.push(orphan);
      const loader = await import("../sdk-loader");

      await expect(loader.loadEximbaySdkV2("SANDBOX"))
        .rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
      expect(browser.document.scripts).toEqual([orphan]);
    },
  );

  it("blocks a marker-spoofed orphan without adoption", async () => {
    const browser = installBrowser();
    const spoof = browser.document.createElement("script");
    spoof.src = "https://cdn.example.test/lookalike.js";
    spoof.setAttribute(SCRIPT_MARKER, "owned");
    browser.document.scripts.push(spoof);
    const loader = await import("../sdk-loader");

    await expect(loader.loadEximbaySdkV2("SANDBOX"))
      .rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
    expect(browser.document.scripts).toEqual([spoof]);
  });

  it("poisons a corrupt normal state while preserving it", async () => {
    const browser = installBrowser();
    const corrupt = Object.freeze({ phase: "LOOKALIKE" });
    Object.defineProperty(browser.window, STATE_KEY, { value: corrupt, configurable: false });
    const loader = await import("../sdk-loader");

    await expect(loader.loadEximbaySdkV2("SANDBOX"))
      .rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
    expect(ownDataValue(browser.window, STATE_KEY)).toBe(corrupt);
    expect(Object.getOwnPropertyDescriptor(browser.window, BLOCK_KEY)).toBeDefined();
    expect(browser.document.scripts).toHaveLength(0);
  });

  it("poisons a right-looking foreign state with writable common descriptors", async () => {
    const browser = installBrowser();
    const ownerToken = Object.freeze({});
    const script = browser.document.createElement("script");
    script.src = SANDBOX_SOURCE;
    script.setAttribute(SCRIPT_MARKER, "owned");
    Object.defineProperty(script, SCRIPT_OWNER_KEY, {
      value: ownerToken,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    browser.document.scripts.push(script);
    const foreignState = {
      phase: "LOADING",
      mode: "SANDBOX",
      source: SANDBOX_SOURCE,
      ownerWindow: browser.window,
      ownerDocument: browser.document,
      script,
      promise: Promise.resolve(vi.fn()),
    };
    Object.defineProperties(foreignState, {
      [STATE_BRAND_KEY]: {
        value: "MIRA_EXIMBAY_SDK_LOADER_V2_V1_STATE",
        enumerable: false,
        writable: false,
        configurable: false,
      },
      [SCRIPT_OWNER_KEY]: {
        value: ownerToken,
        enumerable: false,
        writable: false,
        configurable: false,
      },
    });
    Object.defineProperty(browser.window, STATE_KEY, {
      value: foreignState,
      enumerable: false,
      writable: false,
      configurable: false,
    });
    const loader = await import("../sdk-loader");

    await expect(loader.loadEximbaySdkV2("SANDBOX"))
      .rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
    expect(ownDataValue(browser.window, STATE_KEY)).toBe(foreignState);
    expect(browser.document.scripts).toEqual([script]);
  });

  it("fails closed without adopting or overwriting a corrupt block record", async () => {
    const browser = installBrowser();
    const corrupt = Object.freeze({ brand: "lookalike" });
    Object.defineProperty(browser.window, BLOCK_KEY, { value: corrupt, configurable: false });
    const loader = await import("../sdk-loader");

    await expect(loader.loadEximbaySdkV2("SANDBOX"))
      .rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
    expect(ownDataValue(browser.window, BLOCK_KEY)).toBe(corrupt);
    expect(browser.document.scripts).toHaveLength(0);
  });

  it.each([
    ["missing callable", "load", "SDK_REQUEST_PAY_UNAVAILABLE"],
    ["script error", "error", "SDK_SCRIPT_ERROR"],
  ] as const)("enters stable FAILED on %s", async (_label, event, code) => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const first = loader.loadEximbaySdkV2("SANDBOX");

    browser.document.scripts[0]?.fire(event);
    const second = loader.loadEximbaySdkV2("SANDBOX");

    expect(second).toBe(first);
    await expect(first).rejects.toMatchObject({ code });
    expect(browser.document.scripts).toHaveLength(1);
  });

  it("enters stable FAILED on the application-owned timeout", async () => {
    vi.useFakeTimers();
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const first = loader.loadEximbaySdkV2("SANDBOX");

    await vi.advanceTimersByTimeAsync(15_000);

    await expect(first).rejects.toMatchObject({ code: "SDK_LOAD_TIMEOUT" });
    expect(loader.loadEximbaySdkV2("SANDBOX")).toBe(first);
    expect(browser.document.scripts).toHaveLength(1);
  });

  it("enters stable FAILED when the owned source mutates", async () => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const first = loader.loadEximbaySdkV2("SANDBOX");
    const script = browser.document.scripts[0];
    if (!script) throw new Error("Expected owned fake script");
    script.src = LIVE_SOURCE;

    expect(loader.loadEximbaySdkV2("SANDBOX")).toBe(first);
    await expect(first).rejects.toMatchObject({ code: "SDK_SCRIPT_ERROR" });
    expect(browser.document.scripts).toEqual([script]);
  });

  it("keeps the exact rejected promise after a later FAILED-state source mutation", async () => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const first = loader.loadEximbaySdkV2("SANDBOX");
    const script = browser.document.scripts[0];
    if (!script) throw new Error("Expected owned fake script");
    script.fire("error");
    await expect(first).rejects.toMatchObject({ code: "SDK_SCRIPT_ERROR" });
    script.src = LIVE_SOURCE;

    expect(loader.loadEximbaySdkV2("SANDBOX")).toBe(first);
    expect(loader.loadEximbaySdkV2("LIVE")).toBe(first);
    expect(browser.document.scripts).toEqual([script]);
  });

  it("permanently blocks both modes after an AVAILABLE owned source mutation", async () => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const first = loader.loadEximbaySdkV2("SANDBOX");
    const script = browser.document.scripts[0];
    if (!script) throw new Error("Expected owned fake script");
    browser.window.EXIMBAY = { request_pay: vi.fn() };
    script.fire("load");
    await expect(first).resolves.toBeTypeOf("function");
    script.src = LIVE_SOURCE;

    const blockedSandbox = loader.loadEximbaySdkV2("SANDBOX");
    const blockedLive = loader.loadEximbaySdkV2("LIVE");
    expect(blockedSandbox).not.toBe(first);
    expect(blockedLive).toBe(blockedSandbox);
    await expect(blockedSandbox).rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
    expect(browser.document.scripts).toEqual([script]);

    script.src = SANDBOX_SOURCE;
    expect(loader.loadEximbaySdkV2("SANDBOX")).toBe(blockedSandbox);
    const freshBrowser = installBrowser();
    vi.resetModules();
    const freshLoader = await import("../sdk-loader");
    const fresh = freshLoader.loadEximbaySdkV2("SANDBOX");
    freshBrowser.window.EXIMBAY = { request_pay: vi.fn() };
    freshBrowser.document.scripts[0]?.fire("load");
    await expect(fresh).resolves.toBeTypeOf("function");
  });

  it.each([
    ["non-extensible state on load", "preventExtensions", "load"],
    ["frozen state on error", "freeze", "error"],
  ] as const)("settles fail-closed after transition sabotage: %s", async (_label, sabotage, event) => {
    const browser = installBrowser();
    const loader = await import("../sdk-loader");
    const first = loader.loadEximbaySdkV2("SANDBOX");
    const state = ownDataValue(browser.window, STATE_KEY);
    if (sabotage === "preventExtensions") Object.preventExtensions(state);
    if (sabotage === "freeze") Object.freeze(state);
    if (event === "load") browser.window.EXIMBAY = { request_pay: vi.fn() };

    browser.document.scripts[0]?.fire(event);

    await expect(first).rejects.toMatchObject({ code: "SDK_SCRIPT_ERROR" });
    const blockedSandbox = loader.loadEximbaySdkV2("SANDBOX");
    const blockedLive = loader.loadEximbaySdkV2("LIVE");
    expect(blockedSandbox).not.toBe(first);
    expect(blockedLive).toBe(blockedSandbox);
    await expect(blockedSandbox).rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });
    expect(browser.document.scripts).toHaveLength(1);
  });

  it("shares exact state, script, owner token, and promise across duplicated module instances", async () => {
    const browser = installBrowser();
    const firstModule = await import("../sdk-loader");
    const first = firstModule.loadEximbaySdkV2("SANDBOX");
    const script = browser.document.scripts[0];
    const token = ownDataValue(script, SCRIPT_OWNER_KEY);

    vi.resetModules();
    const secondModule = await import("../sdk-loader");
    const second = secondModule.loadEximbaySdkV2("SANDBOX");

    expect(second).toBe(first);
    expect(browser.document.scripts).toEqual([script]);
    expect(ownDataValue(ownDataValue(browser.window, STATE_KEY), SCRIPT_OWNER_KEY)).toBe(token);
    browser.window.EXIMBAY = { request_pay: vi.fn() };
    script?.fire("load");
    await expect(first).resolves.toBeTypeOf("function");
  });

  it("does not let a copied owner token and marker replace the exact script identity", async () => {
    const browser = installBrowser();
    const firstModule = await import("../sdk-loader");
    const first = firstModule.loadEximbaySdkV2("SANDBOX");
    const state = ownDataValue(browser.window, STATE_KEY);
    const token = ownDataValue(state, SCRIPT_OWNER_KEY);
    const lookalike = browser.document.createElement("script");
    lookalike.src = SANDBOX_SOURCE;
    lookalike.setAttribute(SCRIPT_MARKER, "owned");
    Object.defineProperty(lookalike, SCRIPT_OWNER_KEY, {
      value: Object.assign({}, token),
      configurable: false,
    });
    expect(reflectSet(state, "script", lookalike)).toBe(false);
    expect(reflectSet(state, "mode", "LIVE")).toBe(false);
    expect(reflectSet(state, "source", LIVE_SOURCE)).toBe(false);
    expect(Reflect.set(browser.window, STATE_KEY, { copied: state })).toBe(false);

    vi.resetModules();
    const secondModule = await import("../sdk-loader");
    expect(secondModule.loadEximbaySdkV2("SANDBOX")).toBe(first);
    await expect(secondModule.loadEximbaySdkV2("LIVE"))
      .rejects.toMatchObject({ code: "SDK_MODE_CONFLICT" });
    browser.window.EXIMBAY = { request_pay: vi.fn() };
    browser.document.scripts[0]?.fire("load");
    await expect(first).resolves.toBeTypeOf("function");
    expect(browser.document.scripts).toHaveLength(1);
  });

  it("recovers only after a new window/document navigation boundary", async () => {
    const blockedBrowser = installBrowser();
    blockedBrowser.window.EXIMBAY = { request_pay: vi.fn() };
    const blockedModule = await import("../sdk-loader");
    await expect(blockedModule.loadEximbaySdkV2("SANDBOX"))
      .rejects.toMatchObject({ code: "SDK_DOCUMENT_BLOCKED" });

    const freshBrowser = installBrowser();
    vi.resetModules();
    const freshModule = await import("../sdk-loader");
    const pending = freshModule.loadEximbaySdkV2("SANDBOX");
    freshBrowser.window.EXIMBAY = { request_pay: vi.fn() };
    freshBrowser.document.scripts[0]?.fire("load");

    await expect(pending).resolves.toBeTypeOf("function");
  });
});

function installBrowser(): FakeBrowser {
  const document = new FakeDocument();
  const window = { document };
  vi.stubGlobal("HTMLScriptElement", FakeScriptElement);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  return { window, document };
}

function ownDataValue(target: unknown, key: PropertyKey): unknown {
  if ((typeof target !== "object" && typeof target !== "function") || target === null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  if (!isUnknownDataDescriptor(descriptor)) return undefined;
  return descriptor.value;
}

function reflectSet(target: unknown, key: PropertyKey, value: unknown): boolean {
  if ((typeof target !== "object" && typeof target !== "function") || target === null) {
    throw new Error("Expected object target");
  }
  return Reflect.set(target, key, value);
}

type UnknownDataDescriptor = Omit<PropertyDescriptor, "value"> & { value: unknown };

function isUnknownDataDescriptor(
  descriptor: PropertyDescriptor | undefined,
): descriptor is UnknownDataDescriptor {
  return descriptor !== undefined && Object.prototype.hasOwnProperty.call(descriptor, "value");
}

function syntheticPayload() {
  return {
    fgkey: "synthetic",
    payment: {
      transaction_type: "PAYMENT" as const,
      order_id: "synthetic-order",
      currency: "USD" as const,
      amount: "1.00",
      lang: "EN" as const,
      payment_method: "P000" as const,
    },
    merchant: { mid: "synthetic-mid" },
    buyer: { name: "Synthetic Buyer", email: "buyer@example.test" },
    url: { return_url: "https://example.test/return", status_url: "https://example.test/status" },
  };
}
